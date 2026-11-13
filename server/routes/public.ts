import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, createNotification, logAudit } from '../db.ts';
import { getRoomCategoriesWithAvailability } from '../services/hostelLogic.ts';
import { getKarachiDateParts } from '../../src/lib/billing.ts';
import { sendAdminEmail } from '../email.ts';

export const publicRouter = Router();

function getWebsiteContentMap(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM website_content').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

publicRouter.get('/home', (_req, res) => {
  const karachi = getKarachiDateParts();
  const content = getWebsiteContentMap();
  const categories = getRoomCategoriesWithAvailability(false);
  const facilities = db
    .prepare('SELECT id, name, description, icon_name, image_url, display_order FROM facilities WHERE is_active = 1 ORDER BY display_order ASC, id ASC')
    .all();

  const specialToday = db
    .prepare(
      `SELECT * FROM mess_menus
       WHERE is_published = 1 AND effective_date = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(karachi.isoDate);

  const recurringToday = db
    .prepare(
      `SELECT * FROM mess_menus
       WHERE is_published = 1 AND effective_date IS NULL AND day_of_week = ?
       LIMIT 1`
    )
    .get(karachi.weekdayName);

  const gallery = db
    .prepare(
      `SELECT id, title, description, category, media_type, url, thumbnail_url, room_category_id
       FROM media_gallery
       WHERE is_published = 1
       ORDER BY display_order ASC, id DESC
       LIMIT 8`
    )
    .all();

  const announcements = db
    .prepare(
      `SELECT id, title, description, image_url, publish_date, expiry_date
       FROM announcements
       WHERE status = 'Published'
         AND publish_date <= ?
         AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= ?)
       ORDER BY publish_date DESC, id DESC`
    )
    .all(karachi.isoDate, karachi.isoDate);

  const faqs = db
    .prepare('SELECT id, question, answer, display_order FROM faqs WHERE is_published = 1 ORDER BY display_order ASC, id ASC')
    .all();

  res.json({
    content,
    categories,
    facilities,
    todayMenu: specialToday || recurringToday || null,
    todayDayName: karachi.weekdayName,
    todayDate: karachi.isoDate,
    gallery,
    announcements,
    faqs,
    mapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  });
});

publicRouter.get('/rooms', (_req, res) => {
  const categories = getRoomCategoriesWithAvailability(false);
  res.json({ categories });
});

publicRouter.get('/rooms/:slug', (req, res) => {
  const categories = getRoomCategoriesWithAvailability(false);
  const category = categories.find((c) => String((c as Record<string, unknown>).slug) === req.params.slug);
  if (!category) {
    res.status(404).json({ error: 'Room category not found' });
    return;
  }

  const rooms = db
    .prepare(
      `SELECT r.id, r.room_number, r.floor, r.max_occupancy, r.description,
              SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as available_beds,
              COUNT(b.id) as total_beds
       FROM rooms r
       LEFT JOIN beds b ON b.room_id = r.id
       WHERE r.category_id = ? AND r.is_active = 1
       GROUP BY r.id
       ORDER BY r.room_number ASC`
    )
    .all(Number((category as Record<string, unknown>).id));

  const media = db
    .prepare(
      `SELECT id, title, description, category, media_type, url, thumbnail_url
       FROM media_gallery
       WHERE is_published = 1 AND (room_category_id = ? OR category LIKE ?)
       ORDER BY display_order ASC, id DESC`
    )
    .all(Number((category as Record<string, unknown>).id), `%${String((category as Record<string, unknown>).name)}%`);

  res.json({ category, rooms, media });
});

publicRouter.get('/facilities', (_req, res) => {
  const facilities = db
    .prepare(
      'SELECT id, name, description, icon_name, image_url, display_order FROM facilities WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    )
    .all();
  res.json({ facilities });
});

publicRouter.get('/mess-menu', (_req, res) => {
  const karachi = getKarachiDateParts();
  const weekly = db
    .prepare(
      `SELECT * FROM mess_menus
       WHERE is_published = 1 AND effective_date IS NULL
       ORDER BY CASE day_of_week
         WHEN 'Monday' THEN 1
         WHEN 'Tuesday' THEN 2
         WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4
         WHEN 'Friday' THEN 5
         WHEN 'Saturday' THEN 6
         WHEN 'Sunday' THEN 7
       END`
    )
    .all();

  const overrides = db
    .prepare(
      `SELECT * FROM mess_menus
       WHERE is_published = 1 AND effective_date IS NOT NULL AND effective_date >= ?
       ORDER BY effective_date ASC`
    )
    .all(karachi.isoDate);

  const todayOverride = overrides.find(
    (o) => (o as { effective_date: string }).effective_date === karachi.isoDate
  );
  const todayRecurring = weekly.find(
    (w) => (w as { day_of_week: string }).day_of_week === karachi.weekdayName
  );

  res.json({
    todayMenu: todayOverride || todayRecurring || null,
    todayDate: karachi.isoDate,
    todayDayName: karachi.weekdayName,
    weekly,
    overrides,
  });
});

publicRouter.get('/gallery', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const items = category && category !== 'All'
    ? db
        .prepare(
          `SELECT id, title, description, category, media_type, url, thumbnail_url, room_category_id, created_at
           FROM media_gallery WHERE is_published = 1 AND category = ?
           ORDER BY display_order ASC, id DESC`
        )
        .all(category)
    : db
        .prepare(
          `SELECT id, title, description, category, media_type, url, thumbnail_url, room_category_id, created_at
           FROM media_gallery WHERE is_published = 1
           ORDER BY display_order ASC, id DESC`
        )
        .all();
  res.json({ items });
});

const bookingSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  father_name: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().min(7, 'Valid phone number is required').max(30),
  whatsapp_number: z.string().trim().min(7, 'Valid WhatsApp number is required').max(30),
  email: z.string().trim().email('Invalid email address').or(z.literal('')).optional().default(''),
  occupation: z.string().trim().min(2, 'Occupation is required').max(80),
  institution_or_company: z.string().trim().min(2, 'University or workplace is required').max(150),
  category_id: z.coerce.number().int().positive('Please select a room category'),
  preferred_move_in: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Preferred move-in date is required'),
  duration_months: z.coerce.number().int().min(1).max(60).default(6),
  occupants_count: z.coerce.number().int().min(1).max(5).default(1),
  requirements: z.string().trim().max(500).optional().default(''),
  message: z.string().trim().max(1000).optional().default(''),
});

publicRouter.post('/bookings', async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Validation failed',
      issues: parsed.error.issues,
    });
    return;
  }

  const data = parsed.data;
  const categories = getRoomCategoriesWithAvailability(false);
  const category = categories.find((c) => Number((c as Record<string, unknown>).id) === data.category_id) as
    | { id: number; name: string; available_beds: number }
    | undefined;

  if (!category) {
    res.status(404).json({ error: 'Selected room category is not available' });
    return;
  }

  // Note: Enquiries remain Pending even if low availability, unless category has 0 beds total & user asks for > remaining
  const karachi = getKarachiDateParts();
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const referenceCode = `DBH-${karachi.isoDate.replace(/-/g, '')}-${suffix}`;

  const info = db
    .prepare(
      `INSERT INTO reservations
       (reference_code, full_name, father_name, phone, whatsapp_number, email, occupation, institution_or_company,
        category_id, preferred_move_in, duration_months, occupants_count, requirements, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`
    )
    .run(
      referenceCode,
      data.full_name,
      data.father_name,
      data.phone,
      data.whatsapp_number,
      data.email,
      data.occupation,
      data.institution_or_company,
      data.category_id,
      data.preferred_move_in,
      data.duration_months,
      data.occupants_count,
      data.requirements,
      data.message
    );

  createNotification({
    title: 'New Room Booking Request',
    message: `${data.full_name} requested a ${category.name} bed (${referenceCode}) for move-in ${data.preferred_move_in}.`,
    category: 'booking',
    linkModule: 'bookings',
  });

  logAudit({
    username: 'public_visitor',
    action: 'booking.submitted',
    entityType: 'reservation',
    entityId: Number(info.lastInsertRowid),
    details: { reference_code: referenceCode, category: category.name },
  });

  await sendAdminEmail({
    to: process.env.SMTP_USER || 'management@dotboyshostel.pk',
    subject: `New Booking Request ${referenceCode} — ${data.full_name}`,
    text: `Applicant: ${data.full_name}\nPhone: ${data.phone}\nWhatsApp: ${data.whatsapp_number}\nCategory: ${category.name}\nMove-in: ${data.preferred_move_in}\nReference: ${referenceCode}`,
  });

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    reference_code: referenceCode,
    status: 'Pending',
    category_name: category.name,
    available_beds_in_category: category.available_beds,
    message: 'Your booking request has been submitted. Our hostel management team will review availability and contact you shortly.',
  });
});

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone: z.string().trim().min(7, 'Phone number is required').max(30),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional().default(''),
  subject: z.string().trim().min(2, 'Subject is required').max(150),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(2000),
});

publicRouter.post('/contact', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    return;
  }

  const data = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO contact_inquiries (name, phone, email, subject, message, status)
       VALUES (?, ?, ?, ?, ?, 'New')`
    )
    .run(data.name, data.phone, data.email, data.subject, data.message);

  createNotification({
    title: 'New Contact Inquiry',
    message: `${data.name} (${data.phone}): ${data.subject}`,
    category: 'inquiry',
    linkModule: 'bookings',
  });

  await sendAdminEmail({
    to: process.env.SMTP_USER || 'management@dotboyshostel.pk',
    subject: `Contact Inquiry: ${data.subject}`,
    text: `From: ${data.name}\nPhone: ${data.phone}\nEmail: ${data.email}\n\n${data.message}`,
  });

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    message: 'Thank you for contacting DOT BOYS HOSTEL. We have received your inquiry.',
  });
});
