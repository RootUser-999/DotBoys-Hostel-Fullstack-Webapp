import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  db,
  hashPassword,
  verifyPassword,
  withTransaction,
  logAudit,
  createNotification,
  getSetting,
} from '../db.ts';
import {
  type AuthedRequest,
  checkLoginRateLimit,
  loadUserWithPermissions,
  recordLoginAttempt,
  requireAuth,
  requirePermission,
  signAuthToken,
} from '../auth.ts';
import {
  getRoomCategoriesWithAvailability,
  refreshOverdueStatuses,
  releaseExpiredReservations,
} from '../services/hostelLogic.ts';
import { computeInvoiceState, getKarachiDateParts, getDueDateForMonth } from '../../src/lib/billing.ts';
import { canClaimBed, type BedRecord, type RoomRecord } from '../../src/lib/occupancy.ts';

export const adminCoreRouter = Router();

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'documents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `doc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const uploadDoc = multer({
  storage: docStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP, or PDF documents are allowed.'));
  },
});

// ================= AUTHENTICATION =================

adminCoreRouter.post('/auth/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const uname = String(username || '').trim();
  const pwd = String(password || '');
  const ip = req.ip || 'unknown';

  if (!uname || !pwd) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  if (!checkLoginRateLimit(uname, ip)) {
    res.status(429).json({ error: 'Too many failed login attempts. Try again in 15 minutes.' });
    return;
  }

  const row = db
    .prepare('SELECT id, username, password_hash, is_active FROM users WHERE username = ?')
    .get(uname) as { id: number; username: string; password_hash: string; is_active: number } | undefined;

  if (!row || row.is_active !== 1 || !verifyPassword(pwd, row.password_hash)) {
    recordLoginAttempt(uname, ip, false);
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  recordLoginAttempt(uname, ip, true);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.id);

  const user = loadUserWithPermissions(row.id);
  if (!user) {
    res.status(401).json({ error: 'User account inactive' });
    return;
  }

  const token = signAuthToken(user.id);
  logAudit({
    userId: user.id,
    username: user.username,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
  });

  res.cookie('dotboys_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ token, user });
});

adminCoreRouter.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  logAudit({
    userId: req.authUser?.id,
    username: req.authUser?.username,
    action: 'auth.logout',
    entityType: 'user',
    entityId: req.authUser?.id,
  });
  res.clearCookie('dotboys_token', { path: '/' });
  res.json({ ok: true });
});

adminCoreRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.authUser });
});

adminCoreRouter.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(6, 'New password must be at least 6 characters'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input' });
    return;
  }
  const userId = req.authUser!.id;
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string };
  if (!verifyPassword(parsed.data.current_password, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }
  if (parsed.data.current_password === parsed.data.new_password) {
    res.status(400).json({ error: 'New password must be different from current password' });
    return;
  }

  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
  ).run(hashPassword(parsed.data.new_password), userId);

  logAudit({
    userId,
    username: req.authUser!.username,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
  });

  const updated = loadUserWithPermissions(userId);
  res.json({ user: updated, message: 'Password updated successfully' });
});

// ================= DASHBOARD, SEARCH, NOTIFICATIONS, AUDIT =================

adminCoreRouter.get('/dashboard', requireAuth, requirePermission('dashboard.view'), (_req, res) => {
  releaseExpiredReservations();
  refreshOverdueStatuses();
  const karachi = getKarachiDateParts();

  const activeMembersCount = (
    db.prepare("SELECT COUNT(*) as c FROM hostel_members WHERE status IN ('Active', 'Notice Given', 'Leaving')").get() as { c: number }
  ).c;

  const bedStats = db
    .prepare(
      `SELECT COUNT(b.id) as total_beds,
              SUM(CASE WHEN b.status = 'Occupied' THEN 1 ELSE 0 END) as occupied_beds,
              SUM(CASE WHEN b.status = 'Reserved' THEN 1 ELSE 0 END) as reserved_beds,
              SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as available_beds,
              SUM(CASE WHEN b.status = 'Maintenance' THEN 1 ELSE 0 END) as maintenance_beds
       FROM beds b
       JOIN rooms r ON r.id = b.room_id
       WHERE r.is_active = 1`
    )
    .get() as Record<string, number>;

  const totalRooms = (db.prepare('SELECT COUNT(*) as c FROM rooms WHERE is_active = 1').get() as { c: number }).c;
  const pendingReservations = (
    db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status IN ('Pending', 'Under Review', 'Awaiting Confirmation')").get() as { c: number }
  ).c;

  const revStats = db
    .prepare(
      `SELECT COALESCE(SUM(amount_due + adjustment_net), 0) as expected_revenue,
              COALESCE(SUM(paid_amount), 0) as collected_revenue,
              COALESCE(SUM(remaining_amount), 0) as outstanding_amount,
              SUM(CASE WHEN status = 'Overdue' THEN 1 ELSE 0 END) as overdue_count,
              SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_count
       FROM invoices WHERE billing_month = ?`
    )
    .get(karachi.billingMonth) as Record<string, number>;

  const categoryOccupancy = getRoomCategoriesWithAvailability(true).map((c) => {
    const cat = c as Record<string, unknown>;
    return {
      name: cat.name,
      total_beds: cat.total_beds,
      occupied_beds: cat.occupied_beds,
      reserved_beds: cat.reserved_beds,
      available_beds: cat.available_beds,
      monthly_rent: cat.monthly_rent,
    };
  });

  const monthlySeries = db
    .prepare(
      `SELECT billing_month,
              COALESCE(SUM(amount_due + adjustment_net), 0) as expected,
              COALESCE(SUM(paid_amount), 0) as collected
       FROM invoices
       GROUP BY billing_month
       ORDER BY billing_month ASC
       LIMIT 6`
    )
    .all();

  const recentBookings = db
    .prepare(
      `SELECT r.id, r.reference_code, r.full_name, r.phone, r.status, r.preferred_move_in, r.created_at, rc.name as category_name
       FROM reservations r
       JOIN room_categories rc ON rc.id = r.category_id
       ORDER BY r.created_at DESC LIMIT 5`
    )
    .all();

  const recentPayments = db
    .prepare(
      `SELECT p.id, p.amount, p.payment_date, p.payment_method, m.full_name as member_name, i.billing_month
       FROM payments p
       JOIN hostel_members m ON m.id = p.member_id
       JOIN invoices i ON i.id = p.invoice_id
       ORDER BY p.created_at DESC LIMIT 5`
    )
    .all();

  const overdueAlerts = db
    .prepare(
      `SELECT i.id as invoice_id, i.invoice_number, i.remaining_amount, i.due_date, i.billing_month,
              m.id as member_id, m.full_name, m.phone, m.whatsapp_number
       FROM invoices i
       JOIN hostel_members m ON m.id = i.member_id
       WHERE i.status IN ('Overdue', 'Partially Paid', 'Unpaid') AND i.remaining_amount > 0
       ORDER BY i.due_date ASC LIMIT 8`
    )
    .all();

  const upcomingCheckouts = db
    .prepare(
      `SELECT id, member_code, full_name, expected_leaving_date, status
       FROM hostel_members
       WHERE status IN ('Notice Given', 'Leaving')
          OR (status = 'Active' AND expected_leaving_date IS NOT NULL AND expected_leaving_date != '')
       ORDER BY expected_leaving_date ASC LIMIT 5`
    )
    .all();

  res.json({
    billingMonth: karachi.billingMonth,
    metrics: {
      activeMembersCount,
      totalRooms,
      totalBeds: bedStats.total_beds || 0,
      occupiedBeds: bedStats.occupied_beds || 0,
      reservedBeds: bedStats.reserved_beds || 0,
      availableBeds: bedStats.available_beds || 0,
      pendingReservations,
      expectedRevenue: revStats.expected_revenue || 0,
      collectedRevenue: revStats.collected_revenue || 0,
      outstandingAmount: revStats.outstanding_amount || 0,
      overdueCount: revStats.overdue_count || 0,
      paidCount: revStats.paid_count || 0,
    },
    categoryOccupancy,
    monthlySeries,
    recentBookings,
    recentPayments,
    overdueAlerts,
    upcomingCheckouts,
  });
});

adminCoreRouter.get('/search', requireAuth, (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ members: [], rooms: [], reservations: [], payments: [] });
    return;
  }
  const like = `%${q}%`;
  const canViewMembers =
    req.authUser!.role_slug === 'super_admin' || req.authUser!.permissions.includes('members.view');
  const canViewPayments =
    req.authUser!.role_slug === 'super_admin' || req.authUser!.permissions.includes('payments.view');

  const members = canViewMembers
    ? db
        .prepare(
          `SELECT id, member_code, full_name, phone, status FROM hostel_members
           WHERE full_name LIKE ? OR phone LIKE ? OR member_code LIKE ? LIMIT 6`
        )
        .all(like, like, like)
    : [];

  const rooms = db
    .prepare(
      `SELECT r.id, r.room_number, r.floor, rc.name as category_name
       FROM rooms r JOIN room_categories rc ON rc.id = r.category_id
       WHERE r.room_number LIKE ? LIMIT 6`
    )
    .all(like);

  const reservations = db
    .prepare(
      `SELECT id, reference_code, full_name, phone, status FROM reservations
       WHERE reference_code LIKE ? OR full_name LIKE ? OR phone LIKE ? LIMIT 6`
    )
    .all(like, like, like);

  const payments = canViewPayments
    ? db
        .prepare(
          `SELECT p.id, p.reference_id, p.amount, p.payment_date, m.full_name
           FROM payments p JOIN hostel_members m ON m.id = p.member_id
           WHERE p.reference_id LIKE ? OR m.full_name LIKE ? LIMIT 6`
        )
        .all(like, like)
    : [];

  res.json({ members, rooms, reservations, payments });
});

adminCoreRouter.get('/notifications', requireAuth, (_req, res) => {
  const items = db
    .prepare('SELECT * FROM admin_notifications ORDER BY is_read ASC, created_at DESC LIMIT 40')
    .all();
  res.json({ items });
});

adminCoreRouter.post('/notifications/:id/read', requireAuth, (req, res) => {
  if (req.params.id === 'all') {
    db.prepare('UPDATE admin_notifications SET is_read = 1').run();
  } else {
    db.prepare('UPDATE admin_notifications SET is_read = 1 WHERE id = ?').run(Number(req.params.id));
  }
  res.json({ ok: true });
});

adminCoreRouter.get('/audit-logs', requireAuth, requirePermission('dashboard.view'), (req, res) => {
  const limit = Math.min(200, Number(req.query.limit || 80));
  const items = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit);
  res.json({ items });
});

// ================= BOOKINGS & RESERVATIONS =================

adminCoreRouter.get('/bookings', requireAuth, requirePermission('bookings.manage'), (req, res) => {
  releaseExpiredReservations();
  const status = String(req.query.status || '');
  const categoryId = String(req.query.category_id || '');
  const q = String(req.query.q || '').trim();

  let sql = `SELECT r.*, rc.name as category_name, b.bed_number, rm.room_number
             FROM reservations r
             JOIN room_categories rc ON rc.id = r.category_id
             LEFT JOIN beds b ON b.id = r.bed_id
             LEFT JOIN rooms rm ON rm.id = b.room_id
             WHERE 1=1`;
  const params: Array<string | number> = [];
  if (status && status !== 'All') {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  if (categoryId && categoryId !== 'All') {
    sql += ' AND r.category_id = ?';
    params.push(Number(categoryId));
  }
  if (q) {
    sql += ' AND (r.full_name LIKE ? OR r.phone LIKE ? OR r.reference_code LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY r.created_at DESC';

  const items = db.prepare(sql).all(...params);
  const inquiries = db.prepare('SELECT * FROM contact_inquiries ORDER BY created_at DESC LIMIT 100').all();
  res.json({ items, inquiries });
});

adminCoreRouter.patch('/bookings/:id', requireAuth, requirePermission('bookings.manage'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { status, internal_notes, bed_id } = req.body as {
    status?: string;
    internal_notes?: string;
    bed_id?: number | null;
  };

  try {
    const updated = withTransaction(() => {
      const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as
        | { id: number; category_id: number; bed_id: number | null; status: string; reference_code: string }
        | undefined;
      if (!existing) throw new Error('Booking not found');

      let nextBedId = existing.bed_id;
      const holdHours = Number(getSetting('reservation_hold_hours', '48'));
      let holdExpiresAt: string | null = null;

      if (status && ['Approved', 'Awaiting Confirmation', 'Confirmed'].includes(status)) {
        // Verify category/bed capacity to prevent overbooking
        if (bed_id) {
          const bed = db.prepare('SELECT id, room_id, status FROM beds WHERE id = ?').get(bed_id) as BedRecord | undefined;
          const room = bed
            ? (db.prepare('SELECT id, category_id, max_occupancy, is_active FROM rooms WHERE id = ?').get(bed.room_id) as RoomRecord | undefined)
            : undefined;
          if (existing.bed_id !== bed_id) {
            const check = canClaimBed(bed, room);
            if (!check.ok) throw new Error(check.reason || 'Bed is unavailable');
            if (existing.bed_id) {
              db.prepare("UPDATE beds SET status = 'Available' WHERE id = ? AND status = 'Reserved'").run(existing.bed_id);
            }
            db.prepare("UPDATE beds SET status = 'Reserved' WHERE id = ?").run(bed_id);
            nextBedId = bed_id;
          }
        } else if (!existing.bed_id) {
          const cats = getRoomCategoriesWithAvailability(true);
          const cat = cats.find((c) => Number((c as Record<string, unknown>).id) === existing.category_id) as
            | { available_beds: number }
            | undefined;
          if (!cat || cat.available_beds <= 0) {
            throw new Error('No available beds remaining in this room category to approve.');
          }
        }
        holdExpiresAt = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
      } else if (status && ['Rejected', 'Cancelled', 'Expired'].includes(status)) {
        if (existing.bed_id) {
          db.prepare("UPDATE beds SET status = 'Available' WHERE id = ? AND status = 'Reserved'").run(existing.bed_id);
          nextBedId = null;
        }
      }

      db.prepare(
        `UPDATE reservations
         SET status = COALESCE(?, status),
             internal_notes = COALESCE(?, internal_notes),
             bed_id = ?,
             hold_expires_at = COALESCE(?, hold_expires_at),
             reviewed_by = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(status ?? null, internal_notes ?? null, nextBedId, holdExpiresAt, req.authUser!.id, id);

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: `booking.${(status || 'updated').toLowerCase()}`,
        entityType: 'reservation',
        entityId: id,
        details: { reference_code: existing.reference_code, status, bed_id: nextBedId },
      });

      return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    });
    res.json({ item: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update booking' });
  }
});

adminCoreRouter.post('/bookings/:id/convert', requireAuth, requirePermission('members.manage'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    room_id: z.coerce.number().int().positive(),
    bed_id: z.coerce.number().int().positive(),
    cnic: z.string().trim().min(5, 'CNIC is required'),
    father_name: z.string().trim().optional().default(''),
    permanent_address: z.string().trim().optional().default(''),
    emergency_contact: z.string().trim().optional().default(''),
    guardian_contact: z.string().trim().optional().default(''),
    monthly_rent: z.coerce.number().int().positive(),
    deposit_amount: z.coerce.number().int().min(0).default(0),
    joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid conversion data' });
    return;
  }

  try {
    const result = withTransaction(() => {
      const booking = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!booking) throw new Error('Booking not found');
      if (booking.converted_member_id) throw new Error('Booking already converted to a member');

      const bed = db.prepare('SELECT id, room_id, status FROM beds WHERE id = ?').get(parsed.data.bed_id) as
        | BedRecord
        | undefined;
      const room = db.prepare('SELECT id, category_id, max_occupancy, is_active FROM rooms WHERE id = ?').get(parsed.data.room_id) as
        | RoomRecord
        | undefined;

      if (!bed || bed.room_id !== parsed.data.room_id) throw new Error('Bed does not belong to selected room');
      const allowReservedOwn = booking.bed_id === bed.id && bed.status === 'Reserved';
      if (!allowReservedOwn) {
        const check = canClaimBed(bed, room);
        if (!check.ok) throw new Error(check.reason || 'Bed unavailable');
      }

      const memberCode = `DBH-M-${Date.now().toString().slice(-5)}`;
      const mInfo = db
        .prepare(
          `INSERT INTO hostel_members
           (member_code, full_name, father_name, cnic, phone, whatsapp_number, email, occupation, institution_or_company,
            permanent_address, emergency_contact, guardian_contact, room_category_id, monthly_rent, joining_date, deposit_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`
        )
        .run(
          memberCode,
          String(booking.full_name),
          parsed.data.father_name || String(booking.father_name || ''),
          parsed.data.cnic,
          String(booking.phone),
          String(booking.whatsapp_number),
          String(booking.email || ''),
          String(booking.occupation || 'Student'),
          String(booking.institution_or_company || ''),
          parsed.data.permanent_address,
          parsed.data.emergency_contact,
          parsed.data.guardian_contact,
          room!.category_id,
          parsed.data.monthly_rent,
          parsed.data.joining_date,
          parsed.data.deposit_amount
        );

      const memberId = Number(mInfo.lastInsertRowid);
      db.prepare("UPDATE beds SET status = 'Occupied' WHERE id = ?").run(bed.id);
      db.prepare(
        `INSERT INTO bed_allocations (member_id, room_id, bed_id, start_date, is_active, allocated_by)
         VALUES (?, ?, ?, ?, 1, ?)`
      ).run(memberId, room!.id, bed.id, parsed.data.joining_date, req.authUser!.id);

      db.prepare(
        "UPDATE reservations SET status = 'Confirmed', bed_id = ?, converted_member_id = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(bed.id, memberId, id);

      // Create first month invoice if billing period exists
      const karachi = getKarachiDateParts();
      const billingMonth = parsed.data.joining_date.slice(0, 7);
      const dueDate = getDueDateForMonth(billingMonth, Number(getSetting('billing_due_day', '5')));
      let period = db.prepare('SELECT id FROM billing_periods WHERE billing_month = ?').get(billingMonth) as
        | { id: number }
        | undefined;
      if (!period) {
        const pInfo = db
          .prepare('INSERT INTO billing_periods (billing_month, label, due_date, generated_by) VALUES (?, ?, ?, ?)')
          .run(billingMonth, billingMonth, dueDate, req.authUser!.id);
        period = { id: Number(pInfo.lastInsertRowid) };
      }
      const invState = computeInvoiceState({
        amountDue: parsed.data.monthly_rent,
        paidAmount: 0,
        dueDate,
        currentDateIso: karachi.isoDate,
      });
      db.prepare(
        `INSERT INTO invoices (invoice_number, member_id, billing_period_id, billing_month, due_date, rent_snapshot, amount_due, paid_amount, remaining_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        `INV-${billingMonth.replace('-', '')}-${String(memberId).padStart(4, '0')}`,
        memberId,
        period.id,
        billingMonth,
        dueDate,
        parsed.data.monthly_rent,
        parsed.data.monthly_rent,
        invState.remainingAmount,
        invState.status
      );

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'booking.converted_to_member',
        entityType: 'hostel_member',
        entityId: memberId,
        details: { booking_id: id, member_code: memberCode, room_id: room!.id, bed_id: bed.id },
      });

      createNotification({
        title: 'Resident Registered',
        message: `${String(booking.full_name)} converted from booking to active member (${memberCode}).`,
        category: 'member',
        linkModule: 'members',
      });

      return { memberId, memberCode };
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Conversion failed' });
  }
});

adminCoreRouter.patch('/inquiries/:id', requireAuth, requirePermission('bookings.manage'), (req, res) => {
  const { status, internal_notes } = req.body as { status?: string; internal_notes?: string };
  db.prepare(
    'UPDATE contact_inquiries SET status = COALESCE(?, status), internal_notes = COALESCE(?, internal_notes) WHERE id = ?'
  ).run(status ?? null, internal_notes ?? null, Number(req.params.id));
  res.json({ ok: true });
});

// ================= HOSTEL MEMBERS & CHECKOUT =================

adminCoreRouter.get('/members', requireAuth, requirePermission('members.view'), (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  const karachi = getKarachiDateParts();

  let sql = `SELECT m.*, rc.name as category_name,
                    rm.id as current_room_id, rm.room_number, b.id as current_bed_id, b.bed_number,
                    (SELECT status FROM invoices WHERE member_id = m.id AND billing_month = ? LIMIT 1) as current_payment_status,
                    (SELECT remaining_amount FROM invoices WHERE member_id = m.id AND billing_month = ? LIMIT 1) as current_remaining_amount
             FROM hostel_members m
             LEFT JOIN room_categories rc ON rc.id = m.room_category_id
             LEFT JOIN bed_allocations ba ON ba.member_id = m.id AND ba.is_active = 1
             LEFT JOIN rooms rm ON rm.id = ba.room_id
             LEFT JOIN beds b ON b.id = ba.bed_id
             WHERE 1=1`;
  const params: Array<string | number> = [karachi.billingMonth, karachi.billingMonth];

  if (status && status !== 'All') {
    sql += ' AND m.status = ?';
    params.push(status);
  }
  if (q) {
    sql += ' AND (m.full_name LIKE ? OR m.phone LIKE ? OR m.member_code LIKE ? OR m.cnic LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY m.created_at DESC';

  const items = db.prepare(sql).all(...params);
  res.json({ items });
});

adminCoreRouter.get('/members/:id', requireAuth, requirePermission('members.view'), (req, res) => {
  const id = Number(req.params.id);
  const member = db
    .prepare(
      `SELECT m.*, rc.name as category_name,
              rm.id as current_room_id, rm.room_number, b.id as current_bed_id, b.bed_number
       FROM hostel_members m
       LEFT JOIN room_categories rc ON rc.id = m.room_category_id
       LEFT JOIN bed_allocations ba ON ba.member_id = m.id AND ba.is_active = 1
       LEFT JOIN rooms rm ON rm.id = ba.room_id
       LEFT JOIN beds b ON b.id = ba.bed_id
       WHERE m.id = ?`
    )
    .get(id);

  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const allocations = db
    .prepare(
      `SELECT ba.*, rm.room_number, b.bed_number
       FROM bed_allocations ba
       JOIN rooms rm ON rm.id = ba.room_id
       JOIN beds b ON b.id = ba.bed_id
       WHERE ba.member_id = ? ORDER BY ba.created_at DESC`
    )
    .all(id);

  const invoices = db
    .prepare('SELECT * FROM invoices WHERE member_id = ? ORDER BY billing_month DESC')
    .all(id);

  const payments = db
    .prepare(
      `SELECT p.*, r.receipt_number, i.billing_month
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN payment_receipts r ON r.payment_id = p.id
       WHERE p.member_id = ? ORDER BY p.payment_date DESC, p.id DESC`
    )
    .all(id);

  const documents = db
    .prepare('SELECT id, doc_type, title, mime_type, file_size, created_at FROM member_documents WHERE member_id = ?')
    .all(id);

  res.json({ member, allocations, invoices, payments, documents });
});

adminCoreRouter.post('/members', requireAuth, requirePermission('members.manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(2),
    father_name: z.string().trim().optional().default(''),
    cnic: z.string().trim().min(5),
    phone: z.string().trim().min(7),
    whatsapp_number: z.string().trim().min(7),
    email: z.string().trim().optional().default(''),
    occupation: z.string().trim().default('Student'),
    institution_or_company: z.string().trim().optional().default(''),
    permanent_address: z.string().trim().optional().default(''),
    emergency_contact: z.string().trim().optional().default(''),
    guardian_contact: z.string().trim().optional().default(''),
    room_id: z.coerce.number().int().positive(),
    bed_id: z.coerce.number().int().positive(),
    monthly_rent: z.coerce.number().int().positive(),
    joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expected_leaving_date: z.string().optional().nullable(),
    deposit_amount: z.coerce.number().int().min(0).default(0),
    notes: z.string().optional().default(''),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid member data' });
    return;
  }

  try {
    const out = withTransaction(() => {
      const d = parsed.data;
      const bed = db.prepare('SELECT id, room_id, status FROM beds WHERE id = ?').get(d.bed_id) as BedRecord | undefined;
      const room = db.prepare('SELECT id, category_id, max_occupancy, is_active FROM rooms WHERE id = ?').get(d.room_id) as
        | RoomRecord
        | undefined;
      if (!bed || bed.room_id !== d.room_id) throw new Error('Bed does not belong to selected room');
      const check = canClaimBed(bed, room);
      if (!check.ok) throw new Error(check.reason || 'Selected bed is unavailable');

      const memberCode = `DBH-M-${Date.now().toString().slice(-5)}`;
      const mInfo = db
        .prepare(
          `INSERT INTO hostel_members
           (member_code, full_name, father_name, cnic, phone, whatsapp_number, email, occupation, institution_or_company,
            permanent_address, emergency_contact, guardian_contact, room_category_id, monthly_rent, joining_date,
            expected_leaving_date, deposit_amount, notes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`
        )
        .run(
          memberCode,
          d.full_name,
          d.father_name,
          d.cnic,
          d.phone,
          d.whatsapp_number,
          d.email,
          d.occupation,
          d.institution_or_company,
          d.permanent_address,
          d.emergency_contact,
          d.guardian_contact,
          room!.category_id,
          d.monthly_rent,
          d.joining_date,
          d.expected_leaving_date || null,
          d.deposit_amount,
          d.notes
        );

      const memberId = Number(mInfo.lastInsertRowid);
      db.prepare("UPDATE beds SET status = 'Occupied' WHERE id = ?").run(bed.id);
      db.prepare(
        'INSERT INTO bed_allocations (member_id, room_id, bed_id, start_date, is_active, allocated_by) VALUES (?, ?, ?, ?, 1, ?)'
      ).run(memberId, room!.id, bed.id, d.joining_date, req.authUser!.id);

      // Initial month invoice
      const billingMonth = d.joining_date.slice(0, 7);
      const karachi = getKarachiDateParts();
      const dueDate = getDueDateForMonth(billingMonth, Number(getSetting('billing_due_day', '5')));
      let period = db.prepare('SELECT id FROM billing_periods WHERE billing_month = ?').get(billingMonth) as
        | { id: number }
        | undefined;
      if (!period) {
        const pInfo = db
          .prepare('INSERT INTO billing_periods (billing_month, label, due_date, generated_by) VALUES (?, ?, ?, ?)')
          .run(billingMonth, billingMonth, dueDate, req.authUser!.id);
        period = { id: Number(pInfo.lastInsertRowid) };
      }
      const invState = computeInvoiceState({
        amountDue: d.monthly_rent,
        paidAmount: 0,
        dueDate,
        currentDateIso: karachi.isoDate,
      });
      db.prepare(
        `INSERT INTO invoices (invoice_number, member_id, billing_period_id, billing_month, due_date, rent_snapshot, amount_due, paid_amount, remaining_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        `INV-${billingMonth.replace('-', '')}-${String(memberId).padStart(4, '0')}`,
        memberId,
        period.id,
        billingMonth,
        dueDate,
        d.monthly_rent,
        d.monthly_rent,
        invState.remainingAmount,
        invState.status
      );

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'member.registered',
        entityType: 'hostel_member',
        entityId: memberId,
        details: { member_code: memberCode, full_name: d.full_name, bed_id: bed.id },
      });

      return { id: memberId, member_code: memberCode };
    });
    res.status(201).json(out);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to register member' });
  }
});

adminCoreRouter.patch('/members/:id', requireAuth, requirePermission('members.manage'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const {
    full_name,
    phone,
    whatsapp_number,
    email,
    occupation,
    institution_or_company,
    monthly_rent,
    status,
    notes,
    expected_leaving_date,
    whatsapp_opt_in,
  } = req.body as Record<string, unknown>;

  db.prepare(
    `UPDATE hostel_members
     SET full_name = COALESCE(?, full_name),
         phone = COALESCE(?, phone),
         whatsapp_number = COALESCE(?, whatsapp_number),
         email = COALESCE(?, email),
         occupation = COALESCE(?, occupation),
         institution_or_company = COALESCE(?, institution_or_company),
         monthly_rent = COALESCE(?, monthly_rent),
         status = COALESCE(?, status),
         notes = COALESCE(?, notes),
         expected_leaving_date = COALESCE(?, expected_leaving_date),
         whatsapp_opt_in = COALESCE(?, whatsapp_opt_in),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    typeof full_name === 'string' ? full_name : null,
    typeof phone === 'string' ? phone : null,
    typeof whatsapp_number === 'string' ? whatsapp_number : null,
    typeof email === 'string' ? email : null,
    typeof occupation === 'string' ? occupation : null,
    typeof institution_or_company === 'string' ? institution_or_company : null,
    monthly_rent !== undefined && monthly_rent !== null ? Number(monthly_rent) : null,
    typeof status === 'string' ? status : null,
    typeof notes === 'string' ? notes : null,
    typeof expected_leaving_date === 'string' ? expected_leaving_date : null,
    whatsapp_opt_in !== undefined && whatsapp_opt_in !== null ? Number(whatsapp_opt_in) : null,
    id
  );

  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'member.updated',
    entityType: 'hostel_member',
    entityId: id,
    details: { monthly_rent, status },
  });

  res.json({ ok: true });
});

adminCoreRouter.post('/members/:id/transfer', requireAuth, requirePermission('rooms.manage'), (req: AuthedRequest, res) => {
  const memberId = Number(req.params.id);
  const { room_id, bed_id, new_monthly_rent, notes } = req.body as {
    room_id: number;
    bed_id: number;
    new_monthly_rent?: number;
    notes?: string;
  };

  try {
    withTransaction(() => {
      const member = db.prepare('SELECT id, full_name, status FROM hostel_members WHERE id = ?').get(memberId) as
        | { id: number; full_name: string; status: string }
        | undefined;
      if (!member || member.status === 'Checked Out') {
        throw new Error('Only active members can be transferred.');
      }

      const bed = db.prepare('SELECT id, room_id, status FROM beds WHERE id = ?').get(Number(bed_id)) as BedRecord | undefined;
      const room = db.prepare('SELECT id, category_id, max_occupancy, is_active FROM rooms WHERE id = ?').get(Number(room_id)) as
        | RoomRecord
        | undefined;
      if (!bed || bed.room_id !== Number(room_id)) throw new Error('Bed does not belong to target room.');
      const check = canClaimBed(bed, room);
      if (!check.ok) throw new Error(check.reason || 'Target bed is not available.');

      const currentAlloc = db
        .prepare('SELECT id, bed_id FROM bed_allocations WHERE member_id = ? AND is_active = 1')
        .get(memberId) as { id: number; bed_id: number } | undefined;

      const today = getKarachiDateParts().isoDate;
      if (currentAlloc) {
        db.prepare('UPDATE bed_allocations SET is_active = 0, end_date = ? WHERE id = ?').run(today, currentAlloc.id);
        db.prepare("UPDATE beds SET status = 'Available' WHERE id = ?").run(currentAlloc.bed_id);
      }

      db.prepare("UPDATE beds SET status = 'Occupied' WHERE id = ?").run(bed.id);
      db.prepare(
        'INSERT INTO bed_allocations (member_id, room_id, bed_id, start_date, is_active, notes, allocated_by) VALUES (?, ?, ?, ?, 1, ?, ?)'
      ).run(memberId, room!.id, bed.id, today, notes || 'Room transfer', req.authUser!.id);

      db.prepare(
        `UPDATE hostel_members
         SET room_category_id = ?,
             monthly_rent = COALESCE(?, monthly_rent),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(room!.category_id, new_monthly_rent ?? null, memberId);

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'member.transferred',
        entityType: 'hostel_member',
        entityId: memberId,
        details: { new_room_id: room!.id, new_bed_id: bed.id, new_monthly_rent },
      });
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Transfer failed' });
  }
});

adminCoreRouter.post('/members/:id/checkout', requireAuth, requirePermission('members.manage'), (req: AuthedRequest, res) => {
  const memberId = Number(req.params.id);
  const { leaving_date, deposit_refunded, notes } = req.body as {
    leaving_date: string;
    deposit_refunded?: number;
    notes?: string;
  };

  try {
    withTransaction(() => {
      const member = db.prepare('SELECT id, full_name, status FROM hostel_members WHERE id = ?').get(memberId) as
        | { id: number; full_name: string; status: string }
        | undefined;
      if (!member) throw new Error('Member not found');
      if (member.status === 'Checked Out') throw new Error('Member is already checked out');

      const leaveDate = leaving_date || getKarachiDateParts().isoDate;
      const alloc = db
        .prepare('SELECT id, bed_id FROM bed_allocations WHERE member_id = ? AND is_active = 1')
        .get(memberId) as { id: number; bed_id: number } | undefined;

      if (alloc) {
        db.prepare('UPDATE bed_allocations SET is_active = 0, end_date = ? WHERE id = ?').run(leaveDate, alloc.id);
        db.prepare("UPDATE beds SET status = 'Available' WHERE id = ?").run(alloc.bed_id);
      }

      db.prepare(
        `UPDATE hostel_members
         SET status = 'Checked Out',
             actual_leaving_date = ?,
             deposit_refunded = COALESCE(?, deposit_refunded),
             notes = CASE WHEN ? != '' THEN notes || '\n[Checkout] ' || ? ELSE notes END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(leaveDate, deposit_refunded ?? 0, notes || '', notes || '', memberId);

      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'member.checked_out',
        entityType: 'hostel_member',
        entityId: memberId,
        details: { leaving_date: leaveDate, deposit_refunded },
      });

      createNotification({
        title: 'Member Checked Out & Bed Released',
        message: `${member.full_name} checked out (${leaveDate}). Bed is now available.`,
        category: 'room',
        linkModule: 'rooms',
      });
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Checkout failed' });
  }
});

adminCoreRouter.post(
  '/members/:id/documents',
  requireAuth,
  requirePermission('members.manage'),
  uploadDoc.single('file'),
  (req: AuthedRequest, res) => {
    const memberId = Number(req.params.id);
    if (!req.file) {
      res.status(400).json({ error: 'Document file is required' });
      return;
    }
    const { doc_type, title } = req.body as { doc_type?: string; title?: string };
    const info = db
      .prepare(
        `INSERT INTO member_documents (member_id, doc_type, title, file_path, mime_type, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        memberId,
        doc_type || 'other',
        title || req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        req.authUser!.id
      );

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }
);

adminCoreRouter.get('/documents/:docId', requireAuth, requirePermission('members.view'), (req, res) => {
  const doc = db
    .prepare('SELECT file_path, mime_type, title FROM member_documents WHERE id = ?')
    .get(Number(req.params.docId)) as { file_path: string; mime_type: string; title: string } | undefined;
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const abs = path.join(process.cwd(), 'uploads', 'documents', path.basename(doc.file_path));
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: 'File missing on disk' });
    return;
  }
  res.setHeader('Content-Type', doc.mime_type);
  res.sendFile(abs);
});

// ================= ROOMS & VISUAL BED OCCUPANCY =================

adminCoreRouter.get('/rooms', requireAuth, requirePermission('dashboard.view'), (_req, res) => {
  const categories = getRoomCategoriesWithAvailability(true);
  const rooms = db
    .prepare(
      `SELECT r.*, rc.name as category_name, rc.monthly_rent as category_rent
       FROM rooms r
       JOIN room_categories rc ON rc.id = r.category_id
       ORDER BY r.room_number ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const beds = db
    .prepare(
      `SELECT b.*, ba.member_id, m.full_name as member_name, m.member_code,
              res.id as reservation_id, res.reference_code as reservation_ref
       FROM beds b
       LEFT JOIN bed_allocations ba ON ba.bed_id = b.id AND ba.is_active = 1
       LEFT JOIN hostel_members m ON m.id = ba.member_id
       LEFT JOIN reservations res ON res.bed_id = b.id AND res.status IN ('Approved', 'Awaiting Confirmation')
       ORDER BY b.bed_number ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const bedsByRoom: Record<number, Array<Record<string, unknown>>> = {};
  for (const b of beds) {
    const rid = Number(b.room_id);
    if (!bedsByRoom[rid]) bedsByRoom[rid] = [];
    bedsByRoom[rid].push(b);
  }

  const enrichedRooms = rooms.map((r) => ({
    ...r,
    effective_rent: r.monthly_rent_override ?? r.category_rent,
    beds: bedsByRoom[Number(r.id)] || [],
  }));

  res.json({ categories, rooms: enrichedRooms });
});

adminCoreRouter.post('/rooms', requireAuth, requirePermission('rooms.manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    category_id: z.coerce.number().int().positive(),
    room_number: z.string().trim().min(1),
    floor: z.string().trim().min(1),
    max_occupancy: z.coerce.number().int().min(1).max(10),
    monthly_rent_override: z.coerce.number().int().positive().nullable().optional(),
    description: z.string().optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid room data' });
    return;
  }

  try {
    const roomId = withTransaction(() => {
      const d = parsed.data;
      const info = db
        .prepare(
          'INSERT INTO rooms (category_id, room_number, floor, max_occupancy, monthly_rent_override, description) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(d.category_id, d.room_number, d.floor, d.max_occupancy, d.monthly_rent_override ?? null, d.description);
      const rid = Number(info.lastInsertRowid);
      const insBed = db.prepare("INSERT INTO beds (room_id, bed_number, status) VALUES (?, ?, 'Available')");
      for (let i = 1; i <= d.max_occupancy; i++) {
        insBed.run(rid, `B${i}`);
      }
      logAudit({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        action: 'room.created',
        entityType: 'room',
        entityId: rid,
        details: { room_number: d.room_number, max_occupancy: d.max_occupancy },
      });
      return rid;
    });
    res.status(201).json({ id: roomId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Room number may already exist' });
  }
});

adminCoreRouter.patch('/rooms/:id', requireAuth, requirePermission('rooms.manage'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { floor, description, is_active, monthly_rent_override } = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE rooms
     SET floor = COALESCE(?, floor),
         description = COALESCE(?, description),
         is_active = COALESCE(?, is_active),
         monthly_rent_override = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    typeof floor === 'string' ? floor : null,
    typeof description === 'string' ? description : null,
    is_active !== undefined && is_active !== null ? Number(is_active) : null,
    monthly_rent_override !== undefined && monthly_rent_override !== null && monthly_rent_override !== ''
      ? Number(monthly_rent_override)
      : null,
    id
  );
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'room.updated',
    entityType: 'room',
    entityId: id,
    details: { is_active, monthly_rent_override },
  });
  res.json({ ok: true });
});

adminCoreRouter.patch('/beds/:id', requireAuth, requirePermission('rooms.manage'), (req: AuthedRequest, res) => {
  const bedId = Number(req.params.id);
  const { status } = req.body as { status: 'Available' | 'Maintenance' };
  const bed = db.prepare('SELECT status FROM beds WHERE id = ?').get(bedId) as { status: string } | undefined;
  if (!bed) {
    res.status(404).json({ error: 'Bed not found' });
    return;
  }
  if (bed.status === 'Occupied') {
    res.status(400).json({ error: 'Cannot toggle status of an occupied bed. Transfer or checkout the member first.' });
    return;
  }
  if (!['Available', 'Maintenance'].includes(status)) {
    res.status(400).json({ error: 'Only Available or Maintenance status can be toggled manually.' });
    return;
  }
  db.prepare('UPDATE beds SET status = ? WHERE id = ?').run(status, bedId);
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'bed.status_changed',
    entityType: 'bed',
    entityId: bedId,
    details: { status },
  });
  res.json({ ok: true });
});

adminCoreRouter.patch('/room-categories/:id', requireAuth, requirePermission('rooms.manage'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { monthly_rent, promo_rent, promo_active, description, is_active, facilities_list } = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE room_categories
     SET monthly_rent = COALESCE(?, monthly_rent),
         promo_rent = ?,
         promo_active = COALESCE(?, promo_active),
         description = COALESCE(?, description),
         is_active = COALESCE(?, is_active),
         facilities_json = COALESCE(?, facilities_json),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    monthly_rent !== undefined && monthly_rent !== null ? Number(monthly_rent) : null,
    promo_rent !== undefined && promo_rent !== null && promo_rent !== '' ? Number(promo_rent) : null,
    promo_active !== undefined && promo_active !== null ? Number(promo_active) : null,
    typeof description === 'string' ? description : null,
    is_active !== undefined && is_active !== null ? Number(is_active) : null,
    Array.isArray(facilities_list) ? JSON.stringify(facilities_list) : null,
    id
  );
  logAudit({
    userId: req.authUser!.id,
    username: req.authUser!.username,
    action: 'room_category.updated',
    entityType: 'room_category',
    entityId: id,
    details: { monthly_rent, promo_rent, promo_active },
  });
  res.json({ ok: true });
});
