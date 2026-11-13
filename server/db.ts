import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getKarachiDateParts, getDueDateForMonth } from '../src/lib/billing.ts';

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'dotboys.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHash] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHash, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

/**
 * Runs a synchronous atomic SQLite IMMEDIATE transaction to prevent race conditions
 * on bed allocations, reservations, and payment recording.
 */
export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      module TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      success INTEGER NOT NULL,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      capacity INTEGER NOT NULL,
      monthly_rent INTEGER NOT NULL,
      promo_rent INTEGER,
      promo_active INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      facilities_json TEXT NOT NULL DEFAULT '[]',
      cover_image TEXT NOT NULL DEFAULT '',
      video_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES room_categories(id),
      room_number TEXT NOT NULL UNIQUE,
      floor TEXT NOT NULL DEFAULT '1st Floor',
      max_occupancy INTEGER NOT NULL,
      monthly_rent_override INTEGER,
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS beds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      bed_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Occupied', 'Reserved', 'Maintenance')),
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE (room_id, bed_number)
    );

    CREATE TABLE IF NOT EXISTS hostel_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      father_name TEXT NOT NULL DEFAULT '',
      cnic TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      occupation TEXT NOT NULL DEFAULT 'Student',
      institution_or_company TEXT NOT NULL DEFAULT '',
      permanent_address TEXT NOT NULL DEFAULT '',
      emergency_contact TEXT NOT NULL DEFAULT '',
      guardian_contact TEXT NOT NULL DEFAULT '',
      room_category_id INTEGER REFERENCES room_categories(id),
      monthly_rent INTEGER NOT NULL,
      joining_date TEXT NOT NULL,
      expected_leaving_date TEXT,
      actual_leaving_date TEXT,
      deposit_amount INTEGER NOT NULL DEFAULT 0,
      deposit_refunded INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Pending Registration', 'Notice Given', 'Leaving', 'Checked Out', 'Suspended')),
      whatsapp_opt_in INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS member_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES hostel_members(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('profile_photo', 'cnic', 'other')),
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      father_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      occupation TEXT NOT NULL DEFAULT 'Student',
      institution_or_company TEXT NOT NULL DEFAULT '',
      category_id INTEGER NOT NULL REFERENCES room_categories(id),
      bed_id INTEGER REFERENCES beds(id),
      preferred_move_in TEXT NOT NULL,
      duration_months INTEGER NOT NULL DEFAULT 6,
      occupants_count INTEGER NOT NULL DEFAULT 1,
      requirements TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Under Review', 'Approved', 'Awaiting Confirmation', 'Confirmed', 'Rejected', 'Cancelled', 'Expired')),
      hold_expires_at TEXT,
      internal_notes TEXT NOT NULL DEFAULT '',
      converted_member_id INTEGER REFERENCES hostel_members(id),
      reviewed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bed_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES hostel_members(id),
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      bed_id INTEGER NOT NULL REFERENCES beds(id),
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      allocated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS billing_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billing_month TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      due_date TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      generated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      member_id INTEGER NOT NULL REFERENCES hostel_members(id),
      billing_period_id INTEGER NOT NULL REFERENCES billing_periods(id),
      billing_month TEXT NOT NULL,
      due_date TEXT NOT NULL,
      rent_snapshot INTEGER NOT NULL,
      amount_due INTEGER NOT NULL,
      adjustment_net INTEGER NOT NULL DEFAULT 0,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      remaining_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Unpaid', 'Pending Verification', 'Partially Paid', 'Overdue', 'Waived')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (member_id, billing_month)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      member_id INTEGER NOT NULL REFERENCES hostel_members(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Bank Transfer', 'JazzCash', 'Easypaisa', 'Other')),
      reference_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      recorded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      member_id INTEGER NOT NULL REFERENCES hostel_members(id),
      adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('Discount', 'Refund', 'Penalty', 'Correction', 'Waiver')),
      amount_delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      recorded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL REFERENCES payments(id),
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      member_id INTEGER NOT NULL REFERENCES hostel_members(id),
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      stage TEXT NOT NULL,
      body_template TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER REFERENCES hostel_members(id),
      invoice_id INTEGER REFERENCES invoices(id),
      billing_month TEXT,
      recipient_phone TEXT NOT NULL,
      message_type TEXT NOT NULL,
      message_content TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      channel TEXT NOT NULL DEFAULT 'cloud_api' CHECK (channel IN ('cloud_api', 'manual_link')),
      wa_message_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'manual_opened')),
      failure_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon_name TEXT NOT NULL DEFAULT 'CheckCircle2',
      image_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mess_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL,
      effective_date TEXT,
      is_special INTEGER NOT NULL DEFAULT 0,
      special_title TEXT,
      breakfast TEXT NOT NULL,
      lunch TEXT NOT NULL,
      dinner TEXT NOT NULL,
      image_url TEXT,
      is_published INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mess_menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mess_menu_id INTEGER NOT NULL REFERENCES mess_menus(id) ON DELETE CASCADE,
      meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
      item_name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS media_gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      room_category_id INTEGER REFERENCES room_categories(id),
      is_published INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT,
      publish_date TEXT NOT NULL,
      expiry_date TEXT,
      status TEXT NOT NULL DEFAULT 'Published' CHECK (status IN ('Published', 'Draft', 'Expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS website_content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      section TEXT NOT NULL DEFAULT 'general',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Resolved', 'Archived')),
      internal_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hostel_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      email_on_booking INTEGER NOT NULL DEFAULT 1,
      email_on_inquiry INTEGER NOT NULL DEFAULT 1,
      email_on_overdue INTEGER NOT NULL DEFAULT 1,
      whatsapp_auto_reminders INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'system',
      link_module TEXT NOT NULL DEFAULT 'dashboard',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_members_status ON hostel_members(status);
    CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_month ON invoices(billing_month, status);
    CREATE INDEX IF NOT EXISTS idx_beds_room_status ON beds(room_id, status);
    CREATE INDEX IF NOT EXISTS idx_allocations_active ON bed_allocations(member_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  `);
}

export function seedInitialData(): void {
  const roleCount = (db.prepare('SELECT COUNT(*) as cnt FROM roles').get() as { cnt: number }).cnt;
  if (roleCount > 0) return;

  withTransaction(() => {
    // 1. Roles & Permissions
    const roles = [
      ['super_admin', 'Super Admin', 'Full unrestricted access across all hostel, financial, staff, and CMS modules.'],
      ['hostel_manager', 'Hostel Manager', 'Manage members, rooms, beds, reservations, payments, and daily operations.'],
      ['accounts_manager', 'Accounts Manager', 'Manage monthly billing, payments, receipts, adjustments, and financial reports.'],
      ['content_manager', 'Content Manager', 'Manage website CMS, gallery, mess menu, facilities, and public announcements.'],
    ];
    const insertRole = db.prepare('INSERT INTO roles (slug, name, description) VALUES (?, ?, ?)');
    for (const r of roles) insertRole.run(r[0], r[1], r[2]);

    const permissions = [
      ['dashboard.view', 'View Admin Dashboard', 'dashboard'],
      ['bookings.manage', 'Manage Bookings & Reservations', 'bookings'],
      ['members.view', 'View Hostel Members', 'members'],
      ['members.manage', 'Register, Edit & Checkout Members', 'members'],
      ['rooms.manage', 'Manage Rooms & Bed Allocations', 'rooms'],
      ['payments.view', 'View Billing & Invoices', 'payments'],
      ['payments.manage', 'Record Payments & Adjustments', 'payments'],
      ['whatsapp.manage', 'Configure & Send WhatsApp Reminders', 'whatsapp'],
      ['content.manage', 'Manage Website Content, Facilities, Mess & Gallery', 'content'],
      ['reports.view', 'View & Export Reports', 'reports'],
      ['staff.manage', 'Manage Staff & Permissions', 'staff'],
      ['settings.manage', 'Manage Hostel Settings & Backups', 'settings'],
    ];
    const insertPerm = db.prepare('INSERT INTO permissions (code, label, module) VALUES (?, ?, ?)');
    for (const p of permissions) insertPerm.run(p[0], p[1], p[2]);

    const allPerms = db.prepare('SELECT id, code FROM permissions').all() as { id: number; code: string }[];
    const allRoles = db.prepare('SELECT id, slug FROM roles').all() as { id: number; slug: string }[];
    const roleMap = Object.fromEntries(allRoles.map((r) => [r.slug, r.id]));
    const permMap = Object.fromEntries(allPerms.map((p) => [p.code, p.id]));
    const insertRP = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

    const grant = (roleSlug: string, codes: string[]) => {
      for (const code of codes) {
        insertRP.run(roleMap[roleSlug], permMap[code]);
      }
    };

    grant('super_admin', allPerms.map((p) => p.code));
    grant('hostel_manager', [
      'dashboard.view',
      'bookings.manage',
      'members.view',
      'members.manage',
      'rooms.manage',
      'payments.view',
      'payments.manage',
      'whatsapp.manage',
      'content.manage',
      'reports.view',
    ]);
    grant('accounts_manager', [
      'dashboard.view',
      'payments.view',
      'payments.manage',
      'reports.view',
      'members.view',
    ]);
    grant('content_manager', ['dashboard.view', 'content.manage']);

    // 2. Bootstrap Admin User from env (default dotboys / admin for first-login forced reset)
    const bootstrapUser = process.env.ADMIN_BOOTSTRAP_USERNAME || 'dotboys';
    const bootstrapPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin';
    db.prepare(
      `INSERT INTO users (username, full_name, email, phone, password_hash, role_id, is_active, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
    ).run(
      bootstrapUser,
      'Nawab Sarfaraz (Owner / Admin)',
      'management@dotboyshostel.pk',
      '+923059308333',
      hashPassword(bootstrapPass),
      roleMap['super_admin']
    );

    db.prepare(
      `INSERT INTO notification_preferences (user_id, email_on_booking, email_on_inquiry, email_on_overdue, whatsapp_auto_reminders)
       VALUES (1, 1, 1, 1, 1)`
    ).run();

    // 3. Room Categories (exact initial pricing + optional 2-seater promo rent inactive)
    const insertCat = db.prepare(
      `INSERT INTO room_categories
       (name, slug, capacity, monthly_rent, promo_rent, promo_active, description, facilities_json, cover_image, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertCat.run(
      '2 Seater',
      '2-seater',
      2,
      23000,
      22000,
      0,
      'Quiet, twin-sharing private room ideal for serious university students and working professionals seeking personal study space.',
      JSON.stringify(['Attached Washroom', 'Study Desk & Chair', 'Personal Wardrobe', 'High-Speed 5G Wi-Fi', '3 Meals Daily Mess', '24/7 Security']),
      '/images/room-2-seater.jpg',
      1
    );
    insertCat.run(
      '3 Seater',
      '3-seater',
      3,
      18000,
      null,
      0,
      'Well-ventilated triple-sharing room balancing comfortable personal space, dedicated study desks, and economical monthly rent.',
      JSON.stringify(['Attached Washroom', 'Study Table', 'Individual Locker', 'High-Speed 5G Wi-Fi', '3 Meals Daily Mess', 'UPS / Backup Power']),
      '/images/room-3-seater.jpg',
      2
    );
    insertCat.run(
      '4 Seater',
      '4-seater',
      4,
      16000,
      null,
      0,
      'Bright four-bed shared student room near Main 6th Road with organized storage, natural cross-ventilation, and full mess included.',
      JSON.stringify(['Shared Washroom', 'Study Area', 'Personal Cupboard', 'High-Speed 5G Wi-Fi', '3 Meals Daily Mess', 'Daily Housekeeping']),
      '/images/room-4-seater.jpg',
      3
    );
    insertCat.run(
      '5 Seater',
      '5-seater',
      5,
      15000,
      null,
      0,
      'Budget-friendly five-bed student dormitory with individual lockers, study workspace, high-speed internet, and full hostel facilities.',
      JSON.stringify(['Spacious Dorm Layout', 'Individual Locker', 'Study Desk', 'High-Speed 5G Wi-Fi', '3 Meals Daily Mess', 'CCTV Security']),
      '/images/room-5-seater.jpg',
      4
    );

    const cats = db.prepare('SELECT id, slug, capacity FROM room_categories').all() as {
      id: number;
      slug: string;
      capacity: number;
    }[];
    const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));

    // 4. Sample Room Inventory & Beds
    const insertRoom = db.prepare(
      'INSERT INTO rooms (category_id, room_number, floor, max_occupancy, description) VALUES (?, ?, ?, ?, ?)'
    );
    const insertBed = db.prepare('INSERT INTO beds (room_id, bed_number, status) VALUES (?, ?, ?)');

    const seedRooms: Array<{ cat: string; num: string; floor: string; cap: number }> = [
      { cat: '2-seater', num: '101', floor: '1st Floor', cap: 2 },
      { cat: '2-seater', num: '102', floor: '1st Floor', cap: 2 },
      { cat: '2-seater', num: '103', floor: '1st Floor', cap: 2 },
      { cat: '3-seater', num: '201', floor: '2nd Floor', cap: 3 },
      { cat: '3-seater', num: '202', floor: '2nd Floor', cap: 3 },
      { cat: '3-seater', num: '203', floor: '2nd Floor', cap: 3 },
      { cat: '4-seater', num: '301', floor: '3rd Floor', cap: 4 },
      { cat: '4-seater', num: '302', floor: '3rd Floor', cap: 4 },
      { cat: '5-seater', num: '401', floor: '4th Floor', cap: 5 },
      { cat: '5-seater', num: '402', floor: '4th Floor', cap: 5 },
    ];

    const roomIdByNum: Record<string, number> = {};
    for (const r of seedRooms) {
      const info = insertRoom.run(catBySlug[r.cat].id, r.num, r.floor, r.cap, `${r.cat.replace('-', ' ')} unit on ${r.floor}`);
      const roomId = Number(info.lastInsertRowid);
      roomIdByNum[r.num] = roomId;
      for (let b = 1; b <= r.cap; b++) {
        insertBed.run(roomId, `B${b}`, 'Available');
      }
    }

    // 5. Fictional Sample Hostel Members (clearly marked is_sample=1)
    const karachi = getKarachiDateParts();
    const currentMonth = karachi.billingMonth;
    const dueDate = getDueDateForMonth(currentMonth, 5);
    const prevDateObj = new Date(Date.UTC(karachi.year, karachi.month - 2, 15));
    const prevMonth = `${prevDateObj.getUTCFullYear()}-${String(prevDateObj.getUTCMonth() + 1).padStart(2, '0')}`;
    const prevDueDate = getDueDateForMonth(prevMonth, 5);

    db.prepare('INSERT INTO billing_periods (billing_month, label, due_date, generated_by) VALUES (?, ?, ?, 1)').run(
      prevMonth,
      prevMonth,
      prevDueDate
    );
    const curPeriodInfo = db
      .prepare('INSERT INTO billing_periods (billing_month, label, due_date, generated_by) VALUES (?, ?, ?, 1)')
      .run(currentMonth, currentMonth, dueDate);
    const curPeriodId = Number(curPeriodInfo.lastInsertRowid);
    const prevPeriodId = curPeriodId - 1;

    const sampleMembers = [
      {
        code: 'DBH-M-1001',
        name: 'Hamza Tariq (Sample)',
        father: 'Tariq Mahmood',
        cnic: '37405-0001111-1',
        phone: '0300-0001001',
        wa: '923000001001',
        occ: 'Student',
        inst: 'ARID Agriculture University',
        catSlug: '2-seater',
        room: '101',
        bed: 'B1',
        rent: 23000,
        paidCurrent: 23000,
      },
      {
        code: 'DBH-M-1002',
        name: 'Bilal Ahmed (Sample)',
        father: 'Nisar Ahmed',
        cnic: '37405-0002222-3',
        phone: '0300-0001002',
        wa: '923000001002',
        occ: 'Employee',
        inst: '6th Road IT Park',
        catSlug: '2-seater',
        room: '101',
        bed: 'B2',
        rent: 23000,
        paidCurrent: 15000, // Partial payment sample
      },
      {
        code: 'DBH-M-1003',
        name: 'Usman Farooq (Sample)',
        father: 'Farooq Khan',
        cnic: '37405-0003333-5',
        phone: '0300-0001003',
        wa: '923000001003',
        occ: 'Student',
        inst: 'COMSATS / Rawalpindi Campus',
        catSlug: '3-seater',
        room: '201',
        bed: 'B1',
        rent: 18000,
        paidCurrent: 18000,
      },
      {
        code: 'DBH-M-1004',
        name: 'Zain Raza (Sample)',
        father: 'Raza Hussain',
        cnic: '37405-0004444-7',
        phone: '0300-0001004',
        wa: '923000001004',
        occ: 'Student',
        inst: 'BIIT Rawalpindi',
        catSlug: '3-seater',
        room: '201',
        bed: 'B2',
        rent: 18000,
        paidCurrent: 0, // Unpaid / Overdue sample
      },
      {
        code: 'DBH-M-1005',
        name: 'Saad Malik (Sample)',
        father: 'Imran Malik',
        cnic: '37405-0005555-9',
        phone: '0300-0001005',
        wa: '923000001005',
        occ: 'Student',
        inst: 'NUML Rawalpindi',
        catSlug: '4-seater',
        room: '301',
        bed: 'B1',
        rent: 16000,
        paidCurrent: 16000,
      },
      {
        code: 'DBH-M-1006',
        name: 'Daniyal Qureshi (Sample)',
        father: 'Sajid Qureshi',
        cnic: '37405-0006666-1',
        phone: '0300-0001006',
        wa: '923000001006',
        occ: 'Student',
        inst: 'Riphah University',
        catSlug: '5-seater',
        room: '401',
        bed: 'B1',
        rent: 15000,
        paidCurrent: 0,
      },
    ];

    const insertMember = db.prepare(
      `INSERT INTO hostel_members
       (member_code, full_name, father_name, cnic, phone, whatsapp_number, occupation, institution_or_company,
        permanent_address, emergency_contact, guardian_contact, room_category_id, monthly_rent, joining_date, deposit_amount, status, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sample Address, Punjab', '0300-0009999', '0300-0008888', ?, ?, ?, ?, 'Active', 1)`
    );

    let invSeq = 1001;
    let recSeq = 5001;

    for (const m of sampleMembers) {
      const mInfo = insertMember.run(
        m.code,
        m.name,
        m.father,
        m.cnic,
        m.phone,
        m.wa,
        m.occ,
        m.inst,
        catBySlug[m.catSlug].id,
        m.rent,
        `${prevMonth}-01`,
        10000
      );
      const memberId = Number(mInfo.lastInsertRowid);
      const roomId = roomIdByNum[m.room];
      const bedRow = db
        .prepare('SELECT id FROM beds WHERE room_id = ? AND bed_number = ?')
        .get(roomId, m.bed) as { id: number };

      db.prepare("UPDATE beds SET status = 'Occupied' WHERE id = ?").run(bedRow.id);
      db.prepare(
        'INSERT INTO bed_allocations (member_id, room_id, bed_id, start_date, is_active, allocated_by) VALUES (?, ?, ?, ?, 1, 1)'
      ).run(memberId, roomId, bedRow.id, `${prevMonth}-01`);

      // Previous month fully paid invoice
      const prevInvInfo = db
        .prepare(
          `INSERT INTO invoices (invoice_number, member_id, billing_period_id, billing_month, due_date, rent_snapshot, amount_due, paid_amount, remaining_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'Paid')`
        )
        .run(`INV-${prevMonth.replace('-', '')}-${invSeq++}`, memberId, prevPeriodId, prevMonth, prevDueDate, m.rent, m.rent, m.rent);
      const prevPayInfo = db
        .prepare(
          `INSERT INTO payments (invoice_id, member_id, amount, payment_date, payment_method, reference_id, notes, recorded_by)
           VALUES (?, ?, ?, ?, 'Cash', ?, 'Sample seed payment', 1)`
        )
        .run(Number(prevInvInfo.lastInsertRowid), memberId, m.rent, `${prevMonth}-04`, `SEED-${recSeq}`);
      db.prepare(
        'INSERT INTO payment_receipts (receipt_number, payment_id, invoice_id, member_id, issued_by) VALUES (?, ?, ?, ?, 1)'
      ).run(`RCP-${recSeq++}`, Number(prevPayInfo.lastInsertRowid), Number(prevInvInfo.lastInsertRowid), memberId);

      // Current month invoice
      const rem = m.rent - m.paidCurrent;
      const curStatus =
        rem === 0
          ? 'Paid'
          : karachi.isoDate > dueDate
          ? 'Overdue'
          : m.paidCurrent > 0
          ? 'Partially Paid'
          : 'Unpaid';
      const curInvInfo = db
        .prepare(
          `INSERT INTO invoices (invoice_number, member_id, billing_period_id, billing_month, due_date, rent_snapshot, amount_due, paid_amount, remaining_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `INV-${currentMonth.replace('-', '')}-${invSeq++}`,
          memberId,
          curPeriodId,
          currentMonth,
          dueDate,
          m.rent,
          m.rent,
          m.paidCurrent,
          rem,
          curStatus
        );
      if (m.paidCurrent > 0) {
        const payInfo = db
          .prepare(
            `INSERT INTO payments (invoice_id, member_id, amount, payment_date, payment_method, reference_id, notes, recorded_by)
             VALUES (?, ?, ?, ?, 'Bank Transfer', ?, 'Sample seed payment', 1)`
          )
          .run(Number(curInvInfo.lastInsertRowid), memberId, m.paidCurrent, `${currentMonth}-03`, `TXN-${recSeq}`);
        db.prepare(
          'INSERT INTO payment_receipts (receipt_number, payment_id, invoice_id, member_id, issued_by) VALUES (?, ?, ?, ?, 1)'
        ).run(`RCP-${recSeq++}`, Number(payInfo.lastInsertRowid), Number(curInvInfo.lastInsertRowid), memberId);
      }
    }

    // 6. Sample Reservation
    db.prepare(
      `INSERT INTO reservations
       (reference_code, full_name, father_name, phone, whatsapp_number, email, occupation, institution_or_company,
        category_id, preferred_move_in, duration_months, occupants_count, requirements, message, status)
       VALUES ('DBH-202611-0101', 'Adeel Kamran (Sample)', 'Kamran Yousaf', '0311-0002020', '923110002020', 'adeel.sample@example.com',
       'Student', 'NUST / Rawalpindi', ?, ?, 12, 1, 'Upper floor quiet room', 'Looking for a 2-seater bed starting next week.', 'Pending')`
    ).run(catBySlug['2-seater'].id, karachi.isoDate);

    // 7. Facilities
    const facilities = [
      ['High-Speed 5G Wi-Fi', 'Dual-band fiber internet coverage on every floor for uninterrupted online classes and remote work.', 'Wifi', '/images/room-2-seater.jpg', 1],
      ['Hygienic Mess Facility', 'Three freshly prepared daily meals—Breakfast, Lunch, and Dinner—in our dedicated dining hall.', 'Utensils', '/images/facility-mess.jpg', 2],
      ['24/7 Security & CCTV', 'Round-the-clock warden supervision, controlled main gate entry, and CCTV monitoring of corridors.', 'ShieldCheck', '/images/hero-hostel.jpg', 3],
      ['Furnished Study Rooms', 'Comfortable beds with mattresses, personal storage lockers, ceiling fans, and study desks.', 'BedDouble', '/images/room-3-seater.jpg', 4],
      ['Shared & Twin Options', 'Flexible 2, 3, 4, and 5 seater rooms suited to both private study preferences and student budgets.', 'Users', '/images/room-4-seater.jpg', 5],
      ['Prime 6th Road Location', 'Situated on Main 6th Road opposite Noor Mobile Mall with instant metro bus, university, and market access.', 'MapPin', '/images/hero-hostel.jpg', 6],
    ];
    const insertFac = db.prepare(
      'INSERT INTO facilities (name, description, icon_name, image_url, is_active, display_order) VALUES (?, ?, ?, ?, 1, ?)'
    );
    for (const f of facilities) insertFac.run(f[0], f[1], f[2], f[3], f[4]);

    // 8. Weekly Mess Menu (fictional editable seed data)
    const weeklyMenu = [
      ['Monday', 'Paratha, Tea, Egg', 'Daal, Rice, Salad', 'Chicken Curry, Roti'],
      ['Tuesday', 'Bread, Omelette, Tea', 'Chicken Pulao, Raita', 'Mixed Vegetables, Roti'],
      ['Wednesday', 'Paratha, Chana, Tea', 'Daal Chawal', 'Chicken Karahi, Roti'],
      ['Thursday', 'Egg, Bread, Tea', 'Seasonal Vegetables, Roti', 'Chicken Biryani, Raita'],
      ['Friday', 'Halwa Puri, Tea', 'Chicken Curry, Roti', 'Daal, Rice, Salad'],
      ['Saturday', 'Paratha, Omelette, Tea', 'Vegetable Pulao', 'Chicken Handi, Roti'],
      ['Sunday', 'Chana, Paratha, Tea', 'Seasonal Special', 'Daal, Roti, Salad'],
    ];
    const insertMenu = db.prepare(
      `INSERT INTO mess_menus (day_of_week, effective_date, is_special, breakfast, lunch, dinner, image_url, is_published)
       VALUES (?, NULL, 0, ?, ?, ?, '/images/facility-mess.jpg', 1)`
    );
    for (const m of weeklyMenu) insertMenu.run(m[0], m[1], m[2], m[3]);

    // 9. Media Gallery
    const galleryItems = [
      ['DOT BOYS HOSTEL Exterior', 'Main facade located at D-399, Main 6th Road, Satellite Town, Rawalpindi.', 'Common areas', 'image', '/images/hero-hostel.jpg', null, 1],
      ['2 Seater Executive Room', 'Bright twin-sharing bedroom with dedicated study desks and wardrobes.', '2 Seater Rooms', 'image', '/images/room-2-seater.jpg', catBySlug['2-seater'].id, 2],
      ['3 Seater Student Room', 'Spacious triple-bed accommodation with individual lockers and natural light.', '3 Seater Rooms', 'image', '/images/room-3-seater.jpg', catBySlug['3-seater'].id, 3],
      ['4 Seater Shared Room', 'Clean four-bed room with organized study stations.', '4 Seater Rooms', 'image', '/images/room-4-seater.jpg', catBySlug['4-seater'].id, 4],
      ['5 Seater Dormitory', 'Economical five-bed student dormitory with individual storage.', '5 Seater Rooms', 'image', '/images/room-5-seater.jpg', catBySlug['5-seater'].id, 5],
      ['Dining & Mess Hall', 'Clean stainless-steel serving line and spacious dining tables.', 'Mess', 'image', '/images/facility-mess.jpg', null, 6],
    ];
    const insertMedia = db.prepare(
      `INSERT INTO media_gallery (title, description, category, media_type, url, thumbnail_url, room_category_id, is_published, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    for (const g of galleryItems) insertMedia.run(g[0], g[1], g[2], g[3], g[4], g[4], g[5], g[6]);

    // 10. Announcements
    db.prepare(
      `INSERT INTO announcements (title, description, publish_date, expiry_date, status)
       VALUES (?, ?, ?, NULL, 'Published')`
    ).run(
      'Admissions Open for New Semester — Limited 2 & 3 Seater Beds',
      'Students and job-holders looking for accommodation near Main 6th Road can reserve beds online or visit Building # D-399 between 9:00 AM and 9:00 PM.',
      karachi.isoDate
    );

    // 11. WhatsApp Message Templates
    const templates = [
      [
        'first_reminder',
        '1st of Month Friendly Reminder',
        'first_reminder',
        `Assalam-o-Alaikum {{member_name}},\n\nThis is a friendly reminder from DOT BOYS HOSTEL that your rent for {{billing_month}} is due.\n\nAmount: Rs. {{amount_due}}\n\nPlease make your payment by the 5th of this month.\n\nThank you.\nDOT BOYS HOSTEL`,
      ],
      [
        'final_reminder',
        '5th of Month Final Due-Date Reminder',
        'final_reminder',
        `Assalam-o-Alaikum {{member_name}},\n\nThis is a reminder that your hostel rent for {{billing_month}} is still outstanding.\n\nRemaining Amount: Rs. {{remaining_amount}}\n\nPlease complete your payment by today, the 5th, to avoid further delays.\n\nThank you,\nDOT BOYS HOSTEL`,
      ],
      [
        'overdue_reminder',
        '6th Onwards Overdue Reminder',
        'overdue_reminder',
        `Assalam-o-Alaikum {{member_name}},\n\nOur records show that your hostel rent for {{billing_month}} is still unpaid/partially paid.\n\nOutstanding Amount: Rs. {{remaining_amount}}\n\nYour payment is overdue. Kindly clear the outstanding balance as soon as possible.\n\nFor assistance, please contact hostel management.\nDOT BOYS HOSTEL`,
      ],
    ];
    const insertTpl = db.prepare(
      'INSERT INTO whatsapp_templates (code, name, stage, body_template, is_active) VALUES (?, ?, ?, ?, 1)'
    );
    for (const t of templates) insertTpl.run(t[0], t[1], t[2], t[3]);

    // 12. Website CMS Content
    const cmsEntries: Array<[string, string, string]> = [
      ['hero_title', 'Your Comfort. Your Space. Your Second Home.', 'hero'],
      ['hero_subtitle', 'Experience comfortable, secure, and affordable hostel living at DOT BOYS HOSTEL, Building # D-399, Main 6th Road, Satellite Town, Rawalpindi.', 'hero'],
      ['hero_image', '/images/hero-hostel.jpg', 'hero'],
      ['hero_primary_cta_label', 'Explore Rooms', 'hero'],
      ['hero_primary_cta_url', '/rooms', 'hero'],
      ['hero_secondary_cta_label', 'Contact Us', 'hero'],
      ['hero_secondary_cta_url', '/contact', 'hero'],
      ['promo_banner_enabled', '0', 'promo'],
      ['promo_banner_text', 'Special Semester Offer: 2-Seater Rooms available at Rs. 22,000/month for limited beds.', 'promo'],
      ['about_title', 'Managed Student & Working Professional Residence on Main 6th Road', 'about'],
      ['about_body', 'DOT BOYS HOSTEL provides clean, disciplined, and well-maintained accommodation in the heart of Satellite Town, Rawalpindi. Located opposite Noor Mobile Mall on Main 6th Road, residents benefit from immediate Metrobus access, proximity to major universities and IT offices, reliable 5G Wi-Fi, and three daily home-style meals.', 'about'],
      ['about_mission', 'Our commitment under Nawab Sarfaraz and the hostel management team is straightforward: transparent monthly billing, safe premises, clean rooms, and prompt support for residents and parents.', 'about'],
      ['business_name', 'DOT BOYS HOSTEL', 'business'],
      ['address', 'Building # D-399, Main 6th Road, Opposite Noor Mobile Mall, Satellite Town, Rawalpindi, Pakistan', 'business'],
      ['primary_phone', '+92 305 9308333', 'business'],
      ['secondary_phone', '0301-9308333', 'business'],
      ['whatsapp_number', '+923059308333', 'business'],
      ['contact_person', 'Nawab Sarfaraz', 'business'],
      ['instagram_handle', '@dotboyshostel', 'business'],
      ['instagram_url', 'https://instagram.com/dotboyshostel', 'business'],
      ['map_embed_query', 'Main 6th Road, Opposite Noor Mobile Mall, Satellite Town, Rawalpindi', 'business'],
      ['booking_instructions', 'Submit your room preference and move-in date online. Our management team reviews each request, verifies bed availability, and contacts you via WhatsApp or phone to confirm your room visit and registration.', 'booking'],
      ['footer_note', 'Comfortable, secure boys accommodation in Satellite Town, Rawalpindi.', 'footer'],
      ['seo_title', 'DOT BOYS HOSTEL — Satellite Town, Rawalpindi | Rooms, Mess & Online Booking', 'seo'],
      ['seo_description', '2, 3, 4 & 5 seater rooms with 5G Wi-Fi, 3 daily meals, and 24/7 security at Building # D-399, Main 6th Road, Satellite Town, Rawalpindi.', 'seo'],
      [
        'privacy_policy',
        'DOT BOYS HOSTEL collects resident and booking applicant information (name, guardian details, CNIC, phone/WhatsApp number, and university or employer information) solely for room allocation, hostel security verification, monthly rent billing, and official payment notifications. Personal identity documents are stored privately and accessed only by authorized hostel administrators.',
        'legal',
      ],
      [
        'terms_conditions',
        'Monthly rent is payable on or before the 5th of every month (Pakistan Standard Time). Residents must provide advance notice before checkout so deposit settlement and bed clearance can be completed accurately. Hostel quiet hours, visitor rules, and safety guidelines apply across all floors.',
        'legal',
      ],
    ];
    const insertCms = db.prepare('INSERT INTO website_content (key, value, section) VALUES (?, ?, ?)');
    for (const c of cmsEntries) insertCms.run(c[0], c[1], c[2]);

    // 13. Editable FAQs
    const faqs = [
      ['How do I book a room at DOT BOYS HOSTEL?', 'Fill out the online booking form on our website with your preferred room category and move-in date. You will receive a unique booking reference, and our manager will contact you on WhatsApp or phone to finalize room inspection and registration.', 1],
      ['What is the monthly rent payment deadline?', 'Every resident must clear their monthly rent by the 5th of each month. Automated WhatsApp reminders are sent on the 1st, 5th, and for overdue balances from the 6th onwards.', 2],
      ['Are meals and Wi-Fi included in the monthly rent?', 'Yes, high-speed 5G Wi-Fi and three daily meals (Breakfast, Lunch, and Dinner) per our weekly mess schedule are part of hostel living.', 3],
      ['Where exactly is DOT BOYS HOSTEL located?', 'We are located at Building # D-399, Main 6th Road, Opposite Noor Mobile Mall, Satellite Town, Rawalpindi—walking distance to 6th Road Metro Station and major academies.', 4],
      ['What documents are required at check-in?', 'A copy of your CNIC (or student card/B-Form for minors), guardian contact details, and a passport-size photograph are recorded during registration.', 5],
    ];
    const insertFaq = db.prepare('INSERT INTO faqs (question, answer, display_order, is_published) VALUES (?, ?, ?, 1)');
    for (const f of faqs) insertFaq.run(f[0], f[1], f[2]);

    // 14. Hostel Settings
    const settings: Array<[string, string]> = [
      ['currency', 'PKR'],
      ['timezone', 'Asia/Karachi'],
      ['billing_due_day', '5'],
      ['first_reminder_day', '1'],
      ['overdue_reminder_frequency_days', '3'],
      ['reservation_hold_hours', '48'],
      ['whatsapp_auto_enabled', '1'],
      ['whatsapp_phone_number_id', process.env.WHATSAPP_PHONE_NUMBER_ID || ''],
      ['whatsapp_waba_id', process.env.WHATSAPP_WABA_ID || ''],
      ['smtp_enabled', process.env.SMTP_HOST ? '1' : '0'],
    ];
    const insertSet = db.prepare('INSERT INTO hostel_settings (key, value) VALUES (?, ?)');
    for (const s of settings) insertSet.run(s[0], s[1]);

    // 15. Initial Admin Notification
    db.prepare(
      `INSERT INTO admin_notifications (title, message, category, link_module)
       VALUES ('System Initialized', 'DOT BOYS HOSTEL platform is ready. Remember to update your initial administrator password.', 'system', 'settings')`
    ).run();
  });
}

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM hostel_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO hostel_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function logAudit(params: {
  userId?: number | null;
  username?: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.userId ?? null,
    params.username ?? 'system',
    params.action,
    params.entityType,
    String(params.entityId ?? ''),
    JSON.stringify(params.details ?? {})
  );
}

export function createNotification(params: {
  title: string;
  message: string;
  category: string;
  linkModule: string;
}): void {
  db.prepare(
    'INSERT INTO admin_notifications (title, message, category, link_module) VALUES (?, ?, ?, ?)'
  ).run(params.title, params.message, params.category, params.linkModule);
}
