import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  db,
  hashPassword,
  withTransaction,
  logAudit,
  createNotification,
  getSetting,
  setSetting,
} from '../db.ts';
import { type AuthedRequest, requireAuth, requirePermission } from '../auth.ts';
import {
  generateBillingCycleForMonth,
  getRoomCategoriesWithAvailability,
  refreshOverdueStatuses,
} from '../services/hostelLogic.ts';
import {
  dispatchAndLogWhatsAppMessage,
  getWhatsAppConfigStatus,
  runAutomatedWhatsAppReminders,
} from '../whatsapp.ts';
import { computeInvoiceState, getKarachiDateParts } from '../../src/lib/billing.ts';

export const adminOpsRouter = Router();

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'media');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `media-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB for videos/photos
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Allowed formats: JPG, PNG, WebP, MP4, WebM, MOV.'));
  },
});

// ================= PAYMENTS & MONTHLY BILLING =================

adminOpsRouter.get('/payments', requireAuth, requirePermission('payments.view'), (req, res) => {
  refreshOverdueStatuses();
  const karachi = getKarachiDateParts();
  const billingMonth = String(req.query.month || karachi.billingMonth);
  const status = String(req.query.status || '');
  const categoryId = String(req.query.category_id || '');
  const q = String(req.query.q || '').trim();

  let sql = `SELECT i.*, m.member_code, m.full_name, m.phone, m.whatsapp_number, m.status as member_status,
                    rc.name as category_name, rm.room_number
             FROM invoices i
             JOIN hostel_members m ON m.id = i.member_id
             LEFT JOIN room_categories rc ON rc.id = m.room_category_id
             LEFT JOIN bed_allocations ba ON ba.member_id = m.id AND ba.is_active = 1
             LEFT JOIN rooms rm ON rm.id = ba.room_id
             WHERE 1=1`;
  const params: Array<string | number> = [];

  if (billingMonth && billingMonth !== 'All') {
    sql += ' AND i.billing_month = ?';
    params.push(billingMonth);
  }
  if (status && status !== 'All') {
    sql += ' AND i.status = ?';
    params.push(status);
  }
  if (categoryId && categoryId !== 'All') {
    sql += ' AND m.room_category_id = ?';
    params.push(Number(categoryId));
  }
  if (q) {
    sql += ' AND (m.full_name LIKE ? OR m.member_code LIKE ? OR i.invoice_number LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY i.billing_month DESC, m.full_name ASC';

  const invoices = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  const summary = invoices.reduce<{
    expected: number;
    collected: number;
    remaining: number;
    paidCount: number;
    overdueCount: number;
    unpaidOrPartialCount: number;
  }>(
    (acc, inv) => {
      acc.expected += Number(inv.amount_due) + Number(inv.adjustment_net || 0);
      acc.collected += Number(inv.paid_amount);
      acc.remaining += Number(inv.remaining_amount);
      if (inv.status === 'Paid') acc.paidCount += 1;
      else if (inv.status === 'Overdue') acc.overdueCount += 1;
      else acc.unpaidOrPartialCount += 1;
      return acc;
    },
    { expected: 0, collected: 0, remaining: 0, paidCount: 0, overdueCount: 0, unpaidOrPartialCount: 0 }
  );

  const recentPayments = db
    .prepare(
      `SELECT p.*, m.full_name, m.full_name AS member_name, m.member_code, i.billing_month, i.invoice_number, r.receipt_number
       FROM payments p
       JOIN hostel_members m ON m.id = p.member_id
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN payment_receipts r ON r.payment_id = p.id
       ORDER BY p.created_at DESC LIMIT 60`
    )
    .all();

  const periods = db
    .prepare('SELECT billing_month, due_date FROM billing_periods ORDER BY billing_month DESC')
    .all();

  res.json({ billingMonth, invoices, summary, recentPayments, periods });
});

adminOpsRouter.post('/payments/generate-billing', requireAuth, requirePermission('payments.manage'), (req: AuthedRequest, res) => {
  const karachi = getKarachiDateParts();
  const billingMonth = String(req.body.billing_month || karachi.billingMonth);
  if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
    res.status(400).json({ error: 'Invalid billing_month format (expected YYYY-MM)' });
    return;
  }
  const result = generateBillingCycleForMonth(billingMonth, req.authUser!.id);
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'billing.generated',
    entityType: 'billing_period',
    entityId: billingMonth,
    details: result,
  });
  res.json(result);
});

adminOpsRouter.post('/payments/record', requireAuth, requirePermission('payments.manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    invoice_id: z.coerce.number().int().positive(),
    amount: z.coerce.number().int().positive('Payment amount must be greater than zero'),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payment_method: z.enum(['Cash', 'Bank Transfer', 'JazzCash', 'Easypaisa', 'Other']),
    reference_id: z.string().trim().max(100).optional().default(''),
    notes: z.string().trim().max(500).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payment payload' });
    return;
  }

  try {
    const out = withTransaction(() => {
      const d = parsed.data;
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(d.invoice_id) as
        | {
            id: number;
            member_id: number;
            amount_due: number;
            adjustment_net: number;
            paid_amount: number;
            remaining_amount: number;
            due_date: string;
            billing_month: string;
            status: string;
          }
        | undefined;
      if (!inv) throw new Error('Invoice not found');
      if (inv.remaining_amount <= 0) throw new Error('Invoice is already settled (no duplicate payment allowed).');
      if (d.amount > inv.remaining_amount) {
        throw new Error(`Payment amount (Rs. ${d.amount}) exceeds remaining balance (Rs. ${inv.remaining_amount}).`);
      }

      if (d.reference_id) {
        const dup = db
          .prepare('SELECT id FROM payments WHERE reference_id = ? AND reference_id != ""')
          .get(d.reference_id);
        if (dup) throw new Error(`Duplicate transaction reference ID: ${d.reference_id}`);
      }

      const payInfo = db
        .prepare(
          `INSERT INTO payments (invoice_id, member_id, amount, payment_date, payment_method, reference_id, notes, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(inv.id, inv.member_id, d.amount, d.payment_date, d.payment_method, d.reference_id, d.notes, req.authUser!.id);
      const paymentId = Number(payInfo.lastInsertRowid);

      const receiptNumber = `RCP-${d.payment_date.replace(/-/g, '')}-${String(paymentId).padStart(4, '0')}`;
      db.prepare(
        'INSERT INTO payment_receipts (receipt_number, payment_id, invoice_id, member_id, issued_by) VALUES (?, ?, ?, ?, ?)'
      ).run(receiptNumber, paymentId, inv.id, inv.member_id, req.authUser!.id);

      const newPaid = inv.paid_amount + d.amount;
      const karachi = getKarachiDateParts();
      const computed = computeInvoiceState({
        amountDue: inv.amount_due,
        adjustmentNet: inv.adjustment_net,
        paidAmount: newPaid,
        dueDate: inv.due_date,
        currentDateIso: karachi.isoDate,
      });

      db.prepare(
        "UPDATE invoices SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newPaid, computed.remainingAmount, computed.status, inv.id);

      const member = db.prepare('SELECT full_name FROM hostel_members WHERE id = ?').get(inv.member_id) as {
        full_name: string;
      };

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'payment.recorded',
        entityType: 'payment',
        entityId: paymentId,
        details: {
          invoice_id: inv.id,
          amount: d.amount,
          method: d.payment_method,
          new_status: computed.status,
          receipt_number: receiptNumber,
        },
      });

      createNotification({
        title: 'Payment Recorded',
        message: `Rs. ${d.amount.toLocaleString('en-PK')} received from ${member.full_name} (${d.payment_method}).`,
        category: 'payment',
        linkModule: 'payments',
      });

      return { paymentId, receiptNumber, status: computed.status, remainingAmount: computed.remainingAmount };
    });
    res.status(201).json(out);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record payment' });
  }
});

adminOpsRouter.post('/payments/adjust', requireAuth, requirePermission('payments.manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    invoice_id: z.coerce.number().int().positive(),
    adjustment_type: z.enum(['Discount', 'Refund', 'Penalty', 'Correction', 'Waiver']),
    amount_delta: z.coerce.number().int(), // negative for discount/waiver, positive for penalty/refund reversal
    reason: z.string().trim().min(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid adjustment' });
    return;
  }

  try {
    const out = withTransaction(() => {
      const d = parsed.data;
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(d.invoice_id) as
        | { id: number; member_id: number; amount_due: number; adjustment_net: number; paid_amount: number; due_date: string }
        | undefined;
      if (!inv) throw new Error('Invoice not found');

      db.prepare(
        `INSERT INTO payment_adjustments (invoice_id, member_id, adjustment_type, amount_delta, reason, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(inv.id, inv.member_id, d.adjustment_type, d.amount_delta, d.reason, req.authUser!.id);

      const newAdjNet = inv.adjustment_net + d.amount_delta;
      const karachi = getKarachiDateParts();
      const computed = computeInvoiceState({
        amountDue: inv.amount_due,
        adjustmentNet: newAdjNet,
        paidAmount: inv.paid_amount,
        dueDate: inv.due_date,
        currentDateIso: karachi.isoDate,
        isWaived: d.adjustment_type === 'Waiver',
      });

      db.prepare(
        "UPDATE invoices SET adjustment_net = ?, remaining_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newAdjNet, computed.remainingAmount, computed.status, inv.id);

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'payment.adjusted',
        entityType: 'invoice',
        entityId: inv.id,
        details: { type: d.adjustment_type, delta: d.amount_delta, reason: d.reason },
      });

      return computed;
    });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Adjustment failed' });
  }
});

adminOpsRouter.get('/receipts/:paymentId', requireAuth, requirePermission('payments.view'), (req, res) => {
  const row = db
    .prepare(
      `SELECT p.*, r.receipt_number, r.issued_at, i.invoice_number, i.billing_month, i.amount_due, i.paid_amount, i.remaining_amount,
              m.full_name, m.member_code, m.phone, m.father_name, rm.room_number, rc.name as category_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN hostel_members m ON m.id = p.member_id
       LEFT JOIN payment_receipts r ON r.payment_id = p.id
       LEFT JOIN room_categories rc ON rc.id = m.room_category_id
       LEFT JOIN bed_allocations ba ON ba.member_id = m.id AND ba.is_active = 1
       LEFT JOIN rooms rm ON rm.id = ba.room_id
       WHERE p.id = ?`
    )
    .get(Number(req.params.paymentId));
  if (!row) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }
  res.json({ receipt: row });
});

// ================= WHATSAPP NOTIFICATIONS =================

adminOpsRouter.get('/whatsapp', requireAuth, requirePermission('whatsapp.manage'), (_req, res) => {
  const status = getWhatsAppConfigStatus();
  const templates = db.prepare('SELECT * FROM whatsapp_templates ORDER BY id ASC').all();
  const logs = db
    .prepare(
      `SELECT w.*, m.full_name as member_name
       FROM whatsapp_messages w
       LEFT JOIN hostel_members m ON m.id = w.member_id
       ORDER BY w.created_at DESC LIMIT 80`
    )
    .all();
  const schedule = {
    whatsapp_auto_enabled: getSetting('whatsapp_auto_enabled', '1'),
    first_reminder_day: getSetting('first_reminder_day', '1'),
    billing_due_day: getSetting('billing_due_day', '5'),
    overdue_reminder_frequency_days: getSetting('overdue_reminder_frequency_days', '3'),
  };
  res.json({ status, templates, logs, schedule });
});

adminOpsRouter.patch('/whatsapp/config', requireAuth, requirePermission('whatsapp.manage'), (req: AuthedRequest, res) => {
  const {
    whatsapp_phone_number_id,
    whatsapp_waba_id,
    whatsapp_auto_enabled,
    first_reminder_day,
    billing_due_day,
    overdue_reminder_frequency_days,
  } = req.body as Record<string, string>;

  if (whatsapp_phone_number_id !== undefined) setSetting('whatsapp_phone_number_id', whatsapp_phone_number_id);
  if (whatsapp_waba_id !== undefined) setSetting('whatsapp_waba_id', whatsapp_waba_id);
  if (whatsapp_auto_enabled !== undefined) setSetting('whatsapp_auto_enabled', whatsapp_auto_enabled);
  if (first_reminder_day !== undefined) setSetting('first_reminder_day', first_reminder_day);
  if (billing_due_day !== undefined) setSetting('billing_due_day', billing_due_day);
  if (overdue_reminder_frequency_days !== undefined)
    setSetting('overdue_reminder_frequency_days', overdue_reminder_frequency_days);

  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'whatsapp.config_updated',
    entityType: 'settings',
  });
  res.json({ ok: true });
});

adminOpsRouter.patch('/whatsapp/templates/:id', requireAuth, requirePermission('whatsapp.manage'), (req, res) => {
  const { body_template, is_active } = req.body as { body_template?: string; is_active?: number };
  db.prepare(
    "UPDATE whatsapp_templates SET body_template = COALESCE(?, body_template), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ?"
  ).run(body_template ?? null, is_active ?? null, Number(req.params.id));
  res.json({ ok: true });
});

adminOpsRouter.post('/whatsapp/send-test', requireAuth, requirePermission('whatsapp.manage'), async (req, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };
  if (!phone || !message) {
    res.status(400).json({ error: 'Phone and message are required' });
    return;
  }
  const result = await dispatchAndLogWhatsAppMessage({
    recipientPhone: phone,
    messageType: 'test_message',
    messageContent: message,
  });
  res.json(result);
});

adminOpsRouter.post('/whatsapp/run-reminders', requireAuth, requirePermission('whatsapp.manage'), async (req: AuthedRequest, res) => {
  const forceDay = req.body?.force_day ? Number(req.body.force_day) : undefined;
  const summary = await runAutomatedWhatsAppReminders({ forceDayOfMonth: forceDay });
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'whatsapp.reminders_executed',
    entityType: 'whatsapp',
    details: summary,
  });
  res.json(summary);
});

adminOpsRouter.post('/whatsapp/messages/:id/retry', requireAuth, requirePermission('whatsapp.manage'), async (req, res) => {
  const msg = db.prepare('SELECT * FROM whatsapp_messages WHERE id = ?').get(Number(req.params.id)) as
    | {
        id: number;
        member_id: number | null;
        invoice_id: number | null;
        billing_month: string | null;
        recipient_phone: string;
        message_type: string;
        message_content: string;
      }
    | undefined;
  if (!msg) {
    res.status(404).json({ error: 'Message log not found' });
    return;
  }
  const out = await dispatchAndLogWhatsAppMessage({
    memberId: msg.member_id,
    invoiceId: msg.invoice_id,
    billingMonth: msg.billing_month,
    recipientPhone: msg.recipient_phone,
    messageType: msg.message_type,
    messageContent: msg.message_content,
  });
  res.json(out);
});

adminOpsRouter.post('/whatsapp/log-manual', requireAuth, requirePermission('whatsapp.manage'), (req, res) => {
  const { member_id, phone, message_type, message_content } = req.body as {
    member_id?: number;
    phone: string;
    message_type: string;
    message_content: string;
  };
  db.prepare(
    `INSERT INTO whatsapp_messages
     (member_id, recipient_phone, message_type, message_content, channel, delivery_status, sent_at)
     VALUES (?, ?, ?, ?, 'manual_link', 'manual_opened', datetime('now'))`
  ).run(member_id ?? null, phone, message_type || 'manual_contact', message_content || '');
  res.json({ ok: true });
});

// ================= MESS MENU, FACILITIES, GALLERY, ANNOUNCEMENTS, CMS =================

adminOpsRouter.get('/mess-menu', requireAuth, requirePermission('content.manage'), (_req, res) => {
  const items = db
    .prepare(
      `SELECT * FROM mess_menus ORDER BY effective_date IS NOT NULL, effective_date ASC,
       CASE day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 ELSE 8 END`
    )
    .all();
  res.json({ items });
});

adminOpsRouter.post('/mess-menu', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { day_of_week, effective_date, is_special, special_title, breakfast, lunch, dinner, image_url, is_published } =
    req.body as Record<string, unknown>;
  const info = db
    .prepare(
      `INSERT INTO mess_menus (day_of_week, effective_date, is_special, special_title, breakfast, lunch, dinner, image_url, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(day_of_week || 'Special'),
      effective_date ? String(effective_date) : null,
      Number(is_special || 0),
      special_title ? String(special_title) : null,
      String(breakfast || ''),
      String(lunch || ''),
      String(dinner || ''),
      image_url ? String(image_url) : null,
      is_published !== undefined ? Number(is_published) : 1
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

adminOpsRouter.patch('/mess-menu/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { breakfast, lunch, dinner, is_published, special_title, image_url } = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE mess_menus
     SET breakfast = COALESCE(?, breakfast),
         lunch = COALESCE(?, lunch),
         dinner = COALESCE(?, dinner),
         is_published = COALESCE(?, is_published),
         special_title = COALESCE(?, special_title),
         image_url = COALESCE(?, image_url),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    typeof breakfast === 'string' ? breakfast : null,
    typeof lunch === 'string' ? lunch : null,
    typeof dinner === 'string' ? dinner : null,
    is_published !== undefined && is_published !== null ? Number(is_published) : null,
    typeof special_title === 'string' ? special_title : null,
    typeof image_url === 'string' ? image_url : null,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

adminOpsRouter.delete('/mess-menu/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  db.prepare('DELETE FROM mess_menus WHERE id = ? AND effective_date IS NOT NULL').run(Number(req.params.id));
  res.json({ ok: true });
});

adminOpsRouter.get('/facilities', requireAuth, requirePermission('content.manage'), (_req, res) => {
  const items = db.prepare('SELECT * FROM facilities ORDER BY display_order ASC, id ASC').all();
  res.json({ items });
});

adminOpsRouter.post('/facilities', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { name, description, icon_name, image_url, is_active, display_order } = req.body as Record<string, unknown>;
  const info = db
    .prepare(
      'INSERT INTO facilities (name, description, icon_name, image_url, is_active, display_order) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      String(name),
      String(description || ''),
      String(icon_name || 'CheckCircle2'),
      image_url ? String(image_url) : null,
      is_active !== undefined ? Number(is_active) : 1,
      Number(display_order || 10)
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

adminOpsRouter.patch('/facilities/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { name, description, icon_name, image_url, is_active, display_order } = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE facilities
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         icon_name = COALESCE(?, icon_name),
         image_url = COALESCE(?, image_url),
         is_active = COALESCE(?, is_active),
         display_order = COALESCE(?, display_order)
     WHERE id = ?`
  ).run(
    typeof name === 'string' ? name : null,
    typeof description === 'string' ? description : null,
    typeof icon_name === 'string' ? icon_name : null,
    typeof image_url === 'string' ? image_url : null,
    is_active !== undefined && is_active !== null ? Number(is_active) : null,
    display_order !== undefined && display_order !== null ? Number(display_order) : null,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

adminOpsRouter.delete('/facilities/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  db.prepare('DELETE FROM facilities WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

adminOpsRouter.get('/gallery', requireAuth, requirePermission('content.manage'), (_req, res) => {
  const items = db.prepare('SELECT * FROM media_gallery ORDER BY display_order ASC, id DESC').all();
  res.json({ items });
});

adminOpsRouter.post(
  '/gallery/upload',
  requireAuth,
  requirePermission('content.manage'),
  uploadMedia.single('file'),
  (req: AuthedRequest, res) => {
    const { title, description, category, room_category_id, external_url, media_type } = req.body as Record<string, string>;
    let url = external_url || '';
    let resolvedType: 'image' | 'video' = media_type === 'video' ? 'video' : 'image';

    if (req.file) {
      url = `/uploads/media/${req.file.filename}`;
      resolvedType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }
    if (!url) {
      res.status(400).json({ error: 'Upload a media file or provide a valid media URL' });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO media_gallery (title, description, category, media_type, url, thumbnail_url, room_category_id, is_published, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`
      )
      .run(
        title || 'Hostel Media',
        description || '',
        category || 'Common areas',
        resolvedType,
        url,
        resolvedType === 'image' ? url : null,
        room_category_id ? Number(room_category_id) : null
      );

    logAudit({
      userId: req.authUser!.id,
      username: req.authUser!.username,
      action: 'gallery.uploaded',
      entityType: 'media_gallery',
      entityId: Number(info.lastInsertRowid),
      details: { title, category, media_type: resolvedType },
    });

    res.status(201).json({ id: Number(info.lastInsertRowid), url });
  }
);

adminOpsRouter.patch('/gallery/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { title, description, category, is_published, display_order } = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE media_gallery
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         category = COALESCE(?, category),
         is_published = COALESCE(?, is_published),
         display_order = COALESCE(?, display_order)
     WHERE id = ?`
  ).run(
    typeof title === 'string' ? title : null,
    typeof description === 'string' ? description : null,
    typeof category === 'string' ? category : null,
    is_published !== undefined && is_published !== null ? Number(is_published) : null,
    display_order !== undefined && display_order !== null ? Number(display_order) : null,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

adminOpsRouter.delete('/gallery/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  db.prepare('DELETE FROM media_gallery WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

adminOpsRouter.get('/announcements', requireAuth, requirePermission('content.manage'), (_req, res) => {
  const items = db.prepare('SELECT * FROM announcements ORDER BY publish_date DESC, id DESC').all();
  res.json({ items });
});

adminOpsRouter.post('/announcements', requireAuth, requirePermission('content.manage'), (req: AuthedRequest, res) => {
  const { title, description, publish_date, expiry_date, status } = req.body as Record<string, string>;
  const info = db
    .prepare(
      'INSERT INTO announcements (title, description, publish_date, expiry_date, status) VALUES (?, ?, ?, ?, ?)'
    )
    .run(title, description, publish_date || getKarachiDateParts().isoDate, expiry_date || null, status || 'Published');
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'announcement.created',
    entityType: 'announcement',
    entityId: Number(info.lastInsertRowid),
  });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

adminOpsRouter.patch('/announcements/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { title, description, status, expiry_date } = req.body as Record<string, string>;
  db.prepare(
    `UPDATE announcements
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         expiry_date = COALESCE(?, expiry_date)
     WHERE id = ?`
  ).run(title ?? null, description ?? null, status ?? null, expiry_date ?? null, Number(req.params.id));
  res.json({ ok: true });
});

adminOpsRouter.post('/announcements/:id/broadcast', requireAuth, requirePermission('whatsapp.manage'), async (req, res) => {
  const ann = db.prepare('SELECT title, description FROM announcements WHERE id = ?').get(Number(req.params.id)) as
    | { title: string; description: string }
    | undefined;
  if (!ann) {
    res.status(404).json({ error: 'Announcement not found' });
    return;
  }
  const optedIn = db
    .prepare("SELECT id, full_name, whatsapp_number FROM hostel_members WHERE status = 'Active' AND whatsapp_opt_in = 1")
    .all() as Array<{ id: number; full_name: string; whatsapp_number: string }>;

  let accepted = 0;
  let failed = 0;
  for (const m of optedIn) {
    const out = await dispatchAndLogWhatsAppMessage({
      memberId: m.id,
      recipientPhone: m.whatsapp_number,
      messageType: 'announcement',
      messageContent: `DOT BOYS HOSTEL Update: ${ann.title}\n\n${ann.description}`,
    });
    if (out.delivery_status === 'accepted') accepted += 1;
    else failed += 1;
  }
  res.json({ total: optedIn.length, accepted, failed });
});

adminOpsRouter.get('/cms', requireAuth, requirePermission('content.manage'), (_req, res) => {
  const rows = db.prepare('SELECT key, value, section FROM website_content ORDER BY section, key').all();
  const faqs = db.prepare('SELECT * FROM faqs ORDER BY display_order ASC, id ASC').all();
  res.json({ rows, faqs });
});

adminOpsRouter.put('/cms', requireAuth, requirePermission('content.manage'), (req: AuthedRequest, res) => {
  const updates = req.body.updates as Record<string, string>;
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'updates object required' });
    return;
  }
  withTransaction(() => {
    const stmt = db.prepare(
      `INSERT INTO website_content (key, value, section, updated_at) VALUES (?, ?, 'general', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    );
    for (const [k, v] of Object.entries(updates)) {
      stmt.run(k, String(v ?? ''));
    }
  });
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'cms.updated',
    entityType: 'website_content',
    details: { keys: Object.keys(updates) },
  });
  res.json({ ok: true });
});

adminOpsRouter.post('/faqs', requireAuth, requirePermission('content.manage'), (req, res) => {
  const { question, answer, display_order } = req.body as { question: string; answer: string; display_order?: number };
  const info = db
    .prepare('INSERT INTO faqs (question, answer, display_order, is_published) VALUES (?, ?, ?, 1)')
    .run(question, answer, display_order ?? 10);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

adminOpsRouter.delete('/faqs/:id', requireAuth, requirePermission('content.manage'), (req, res) => {
  db.prepare('DELETE FROM faqs WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ================= REPORTS, STAFF & SETTINGS =================

adminOpsRouter.get('/reports', requireAuth, requirePermission('reports.view'), (req, res) => {
  const fromMonth = String(req.query.from_month || '2020-01');
  const toMonth = String(req.query.to_month || '2099-12');

  const financialByMonth = db
    .prepare(
      `SELECT billing_month,
              COUNT(*) as total_invoices,
              COALESCE(SUM(amount_due + adjustment_net), 0) as total_billed,
              COALESCE(SUM(paid_amount), 0) as total_collected,
              COALESCE(SUM(remaining_amount), 0) as total_outstanding,
              SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN status = 'Partially Paid' THEN 1 ELSE 0 END) as partial_count,
              SUM(CASE WHEN status IN ('Unpaid', 'Overdue') THEN 1 ELSE 0 END) as unpaid_count
       FROM invoices
       WHERE billing_month >= ? AND billing_month <= ?
       GROUP BY billing_month
       ORDER BY billing_month DESC`
    )
    .all(fromMonth, toMonth);

  const revenueByCategory = db
    .prepare(
      `SELECT COALESCE(rc.name, 'Unassigned') as category_name,
              COALESCE(SUM(i.amount_due + i.adjustment_net), 0) as expected,
              COALESCE(SUM(i.paid_amount), 0) as collected,
              COALESCE(SUM(i.remaining_amount), 0) as outstanding
       FROM invoices i
       JOIN hostel_members m ON m.id = i.member_id
       LEFT JOIN room_categories rc ON rc.id = m.room_category_id
       WHERE i.billing_month >= ? AND i.billing_month <= ?
       GROUP BY rc.id`
    )
    .all(fromMonth, toMonth);

  const occupancyByCategory = getRoomCategoriesWithAvailability(true);

  const residentSummary = db
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM hostel_members
       GROUP BY status`
    )
    .all();

  const residentsDetail = db
    .prepare(
      `SELECT m.member_code, m.full_name, m.occupation, m.phone, m.monthly_rent, m.joining_date, m.actual_leaving_date, m.status,
              rc.name as category_name, rm.room_number, b.bed_number
       FROM hostel_members m
       LEFT JOIN room_categories rc ON rc.id = m.room_category_id
       LEFT JOIN bed_allocations ba ON ba.member_id = m.id AND ba.is_active = 1
       LEFT JOIN rooms rm ON rm.id = ba.room_id
       LEFT JOIN beds b ON b.id = ba.bed_id
       ORDER BY m.status ASC, m.full_name ASC`
    )
    .all();

  res.json({ financialByMonth, revenueByCategory, occupancyByCategory, residentSummary, residentsDetail });
});

adminOpsRouter.get('/staff', requireAuth, requirePermission('staff.manage'), (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active, u.must_change_password, u.last_login_at,
              r.id as role_id, r.slug as role_slug, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.id ASC`
    )
    .all();
  const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all();
  res.json({ users, roles });
});

adminOpsRouter.post('/staff', requireAuth, requirePermission('staff.manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    username: z.string().trim().min(3),
    full_name: z.string().trim().min(2),
    email: z.string().trim().optional().default(''),
    phone: z.string().trim().optional().default(''),
    role_id: z.coerce.number().int().positive(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid staff input' });
    return;
  }
  try {
    const d = parsed.data;
    const info = db
      .prepare(
        `INSERT INTO users (username, full_name, email, phone, password_hash, role_id, is_active, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
      )
      .run(d.username, d.full_name, d.email, d.phone, hashPassword(d.password), d.role_id);
    logAudit({
      userId: req.authUser!.id,
      username: req.authUser!.username,
      action: 'staff.created',
      entityType: 'user',
      entityId: Number(info.lastInsertRowid),
      details: { username: d.username },
    });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Username already exists' });
  }
});

adminOpsRouter.patch('/staff/:id', requireAuth, requirePermission('staff.manage'), (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { is_active, role_id, new_password } = req.body as {
    is_active?: number;
    role_id?: number;
    new_password?: string;
  };
  if (targetId === req.authUser!.id && is_active === 0) {
    res.status(400).json({ error: 'Cannot deactivate your own active session account.' });
    return;
  }
  db.prepare(
    `UPDATE users
     SET is_active = COALESCE(?, is_active),
         role_id = COALESCE(?, role_id),
         password_hash = COALESCE(?, password_hash),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    is_active ?? null,
    role_id ?? null,
    new_password && new_password.length >= 6 ? hashPassword(new_password) : null,
    targetId
  );
  res.json({ ok: true });
});

adminOpsRouter.get('/settings', requireAuth, requirePermission('settings.manage'), (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM hostel_settings ORDER BY key ASC').all();
  res.json({ settings: Object.fromEntries((rows as Array<{ key: string; value: string }>).map((r) => [r.key, r.value])) });
});

adminOpsRouter.put('/settings', requireAuth, requirePermission('settings.manage'), (req: AuthedRequest, res) => {
  const settings = req.body.settings as Record<string, string>;
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'settings object required' });
    return;
  }
  for (const [k, v] of Object.entries(settings)) {
    setSetting(k, String(v ?? ''));
  }
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'settings.updated',
    entityType: 'hostel_settings',
  });
  res.json({ ok: true });
});

adminOpsRouter.get('/backup/export', requireAuth, requirePermission('settings.manage'), (_req, res) => {
  const tables = [
    'room_categories',
    'rooms',
    'beds',
    'hostel_members',
    'bed_allocations',
    'reservations',
    'billing_periods',
    'invoices',
    'payments',
    'payment_adjustments',
    'payment_receipts',
    'facilities',
    'mess_menus',
    'announcements',
    'website_content',
    'hostel_settings',
  ];
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  res.setHeader('Content-Disposition', `attachment; filename="dotboys-backup-${getKarachiDateParts().isoDate}.json"`);
  res.json({ exported_at: new Date().toISOString(), timezone: 'Asia/Karachi', data: dump });
});
