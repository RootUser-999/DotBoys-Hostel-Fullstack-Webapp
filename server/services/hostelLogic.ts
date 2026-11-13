import { db, withTransaction, createNotification, logAudit, getSetting } from '../db.ts';
import {
  computeInvoiceState,
  getDueDateForMonth,
  getKarachiDateParts,
  isMemberBillableForMonth,
} from '../../src/lib/billing.ts';
import {
  calculateCategoryAvailability,
  type ActiveReservationHold,
  type BedRecord,
  type RoomRecord,
} from '../../src/lib/occupancy.ts';

/**
 * Releases reservation holds that have passed their hold_expires_at timestamp.
 * Marks them Expired and frees any held bed back to Available.
 */
export function releaseExpiredReservations(): number {
  const nowIso = new Date().toISOString();
  return withTransaction(() => {
    const expired = db
      .prepare(
        `SELECT id, bed_id, reference_code FROM reservations
         WHERE status IN ('Approved', 'Awaiting Confirmation')
           AND hold_expires_at IS NOT NULL
           AND hold_expires_at < ?`
      )
      .all(nowIso) as Array<{ id: number; bed_id: number | null; reference_code: string }>;

    for (const r of expired) {
      db.prepare("UPDATE reservations SET status = 'Expired', updated_at = datetime('now') WHERE id = ?").run(r.id);
      if (r.bed_id) {
        db.prepare("UPDATE beds SET status = 'Available' WHERE id = ? AND status = 'Reserved'").run(r.bed_id);
      }
      logAudit({
        username: 'system',
        action: 'reservation.expired',
        entityType: 'reservation',
        entityId: r.id,
        details: { reference_code: r.reference_code },
      });
    }
    return expired.length;
  });
}

export function getRoomCategoriesWithAvailability(includeInactive = false) {
  releaseExpiredReservations();
  const nowIso = new Date().toISOString();

  const categories = db
    .prepare(
      includeInactive
        ? 'SELECT * FROM room_categories ORDER BY display_order ASC, id ASC'
        : 'SELECT * FROM room_categories WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    )
    .all() as Array<Record<string, unknown>>;

  const rooms = db.prepare('SELECT id, category_id, max_occupancy, is_active FROM rooms').all() as unknown as RoomRecord[];
  const beds = db.prepare('SELECT id, room_id, status FROM beds').all() as unknown as BedRecord[];
  const reservations = db
    .prepare(
      `SELECT id, category_id, bed_id, status, hold_expires_at
       FROM reservations
       WHERE status IN ('Approved', 'Awaiting Confirmation', 'Confirmed')`
    )
    .all() as unknown as ActiveReservationHold[];

  return categories.map((cat) => {
    const avail = calculateCategoryAvailability({
      categoryId: Number(cat.id),
      rooms,
      beds,
      reservations,
      nowIso,
    });
    let facilitiesList: string[] = [];
    try {
      facilitiesList = JSON.parse(String(cat.facilities_json || '[]'));
    } catch {
      facilitiesList = [];
    }
    return {
      ...cat,
      facilities_list: facilitiesList,
      ...avail,
    };
  });
}

/**
 * Refreshes overdue statuses across unpaid/partially paid invoices based on Asia/Karachi date.
 */
export function refreshOverdueStatuses(): number {
  const karachi = getKarachiDateParts();
  const rows = db
    .prepare(
      `SELECT id, amount_due, adjustment_net, paid_amount, due_date, status
       FROM invoices
       WHERE status IN ('Unpaid', 'Partially Paid', 'Overdue')`
    )
    .all() as Array<{
    id: number;
    amount_due: number;
    adjustment_net: number;
    paid_amount: number;
    due_date: string;
    status: string;
  }>;

  let changed = 0;
  for (const inv of rows) {
    const computed = computeInvoiceState({
      amountDue: inv.amount_due,
      adjustmentNet: inv.adjustment_net,
      paidAmount: inv.paid_amount,
      dueDate: inv.due_date,
      currentDateIso: karachi.isoDate,
    });
    if (computed.status !== inv.status) {
      db.prepare(
        "UPDATE invoices SET status = ?, remaining_amount = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(computed.status, computed.remainingAmount, inv.id);
      changed += 1;
    }
  }
  return changed;
}

/**
 * Idempotently generates monthly invoices for all billable members in a billingMonth (YYYY-MM).
 * Never overwrites existing invoices or alters historical rent snapshots.
 */
export function generateBillingCycleForMonth(
  billingMonth: string,
  userId?: number
): { createdCount: number; skippedCount: number } {
  const dueDay = Number(getSetting('billing_due_day', '5'));
  const dueDate = getDueDateForMonth(billingMonth, dueDay);
  const karachi = getKarachiDateParts();

  return withTransaction(() => {
    let period = db
      .prepare('SELECT id FROM billing_periods WHERE billing_month = ?')
      .get(billingMonth) as { id: number } | undefined;

    if (!period) {
      const pInfo = db
        .prepare('INSERT INTO billing_periods (billing_month, label, due_date, generated_by) VALUES (?, ?, ?, ?)')
        .run(billingMonth, billingMonth, dueDate, userId ?? null);
      period = { id: Number(pInfo.lastInsertRowid) };
    }

    const members = db
      .prepare(
        `SELECT id, member_code, full_name, status, monthly_rent, joining_date, actual_leaving_date
         FROM hostel_members`
      )
      .all() as Array<{
      id: number;
      member_code: string;
      full_name: string;
      status: string;
      monthly_rent: number;
      joining_date: string;
      actual_leaving_date: string | null;
    }>;

    let createdCount = 0;
    let skippedCount = 0;

    for (const m of members) {
      if (
        !isMemberBillableForMonth({
          memberStatus: m.status,
          joiningDate: m.joining_date,
          leavingDate: m.actual_leaving_date,
          billingMonth,
        })
      ) {
        skippedCount += 1;
        continue;
      }

      const existing = db
        .prepare('SELECT id FROM invoices WHERE member_id = ? AND billing_month = ?')
        .get(m.id, billingMonth);
      if (existing) {
        skippedCount += 1;
        continue;
      }

      const state = computeInvoiceState({
        amountDue: m.monthly_rent,
        paidAmount: 0,
        dueDate,
        currentDateIso: karachi.isoDate,
      });

      const invNum = `INV-${billingMonth.replace('-', '')}-${String(m.id).padStart(4, '0')}`;
      db.prepare(
        `INSERT INTO invoices
         (invoice_number, member_id, billing_period_id, billing_month, due_date, rent_snapshot, amount_due, paid_amount, remaining_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(invNum, m.id, period.id, billingMonth, dueDate, m.monthly_rent, m.monthly_rent, state.remainingAmount, state.status);

      createdCount += 1;
    }

    if (createdCount > 0) {
      createNotification({
        title: `Billing Generated (${billingMonth})`,
        message: `Generated ${createdCount} monthly rent invoices due ${dueDate}.`,
        category: 'billing',
        linkModule: 'payments',
      });
    }

    return { createdCount, skippedCount };
  });
}
