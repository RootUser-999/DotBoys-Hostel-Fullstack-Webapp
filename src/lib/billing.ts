export interface KarachiDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  isoDate: string; // YYYY-MM-DD
  billingMonth: string; // YYYY-MM
  weekdayName: string; // Monday..Sunday
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Converts a Date (or current instant) into Pakistan Standard Time (Asia/Karachi, UTC+5).
 * Uses Intl.DateTimeFormat so it is immune to host server timezone settings.
 */
export function getKarachiDateParts(date: Date = new Date()): KarachiDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const isoDate = `${map.year}-${map.month}-${map.day}`;
  const billingMonth = `${map.year}-${map.month}`;
  const weekdayName = map.weekday || WEEKDAYS[date.getUTCDay()];
  return { year, month, day, isoDate, billingMonth, weekdayName };
}

/**
 * Formats YYYY-MM into human-readable label like "November 2026".
 */
export function formatBillingMonthLabel(billingMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth);
  if (!match) return billingMonth;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  return `${MONTH_NAMES[monthIdx] ?? match[2]} ${year}`;
}

/**
 * Computes the due date (5th day of the billing month by default).
 */
export function getDueDateForMonth(billingMonth: string, dueDay: number = 5): string {
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth);
  if (!match) throw new Error(`Invalid billingMonth format: ${billingMonth}`);
  const clampedDay = Math.max(1, Math.min(28, dueDay));
  return `${match[1]}-${match[2]}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Computes accurate remaining amount and invoice status.
 * Never marks an invoice as 'Paid' if paidAmount < netDue.
 */
export function computeInvoiceState(params: {
  amountDue: number;
  adjustmentNet?: number; // positive adds charge, negative discounts/waives
  paidAmount: number;
  dueDate: string; // YYYY-MM-DD
  currentDateIso: string; // YYYY-MM-DD (Asia/Karachi)
  isWaived?: boolean;
  isPendingVerification?: boolean;
}): {
  netDue: number;
  remainingAmount: number;
  status: 'Paid' | 'Unpaid' | 'Pending Verification' | 'Partially Paid' | 'Overdue' | 'Waived';
} {
  const netDue = Math.max(0, Math.round(params.amountDue + (params.adjustmentNet ?? 0)));
  const paid = Math.max(0, Math.round(params.paidAmount));
  const remainingAmount = Math.max(0, netDue - paid);

  if (params.isWaived || netDue === 0) {
    return { netDue, remainingAmount: 0, status: 'Waived' };
  }
  if (paid >= netDue) {
    return { netDue, remainingAmount: 0, status: 'Paid' };
  }
  if (params.isPendingVerification) {
    return { netDue, remainingAmount, status: 'Pending Verification' };
  }
  if (params.currentDateIso > params.dueDate) {
    return { netDue, remainingAmount, status: 'Overdue' };
  }
  if (paid > 0) {
    return { netDue, remainingAmount, status: 'Partially Paid' };
  }
  return { netDue, remainingAmount, status: 'Unpaid' };
}

/**
 * Determines whether a member should receive an invoice for a given billing month.
 * Accounts for joining_date and leaving_date so checked-out or future members aren't billed.
 */
export function isMemberBillableForMonth(params: {
  memberStatus: string;
  joiningDate: string; // YYYY-MM-DD
  leavingDate: string | null;
  billingMonth: string; // YYYY-MM
}): boolean {
  if (params.memberStatus === 'Checked Out' || params.memberStatus === 'Pending Registration') {
    return false;
  }
  const monthStart = `${params.billingMonth}-01`;
  const [y, m] = params.billingMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${params.billingMonth}-${String(lastDay).padStart(2, '0')}`;

  if (params.joiningDate > monthEnd) return false;
  if (params.leavingDate && params.leavingDate < monthStart) return false;
  return true;
}

export type ReminderStage = 'first_reminder' | 'final_reminder' | 'overdue_reminder';

/**
 * Evaluates which WhatsApp reminder stage (if any) applies on a given Asia/Karachi day.
 * Strictly excludes Paid, Waived, and Checked Out members.
 */
export function evaluateReminderStage(params: {
  dayOfMonth: number;
  invoiceStatus: string;
  memberStatus: string;
  remainingAmount: number;
  overdueFrequencyDays?: number; // default 3 (sends on 6th, 9th, 12th...)
  dueDay?: number; // default 5
  firstReminderDay?: number; // default 1
}): ReminderStage | null {
  if (params.memberStatus === 'Checked Out' || params.memberStatus === 'Suspended') {
    return null;
  }
  if (
    params.invoiceStatus === 'Paid' ||
    params.invoiceStatus === 'Waived' ||
    params.remainingAmount <= 0
  ) {
    return null;
  }

  const firstDay = params.firstReminderDay ?? 1;
  const dueDay = params.dueDay ?? 5;
  const freq = Math.max(1, params.overdueFrequencyDays ?? 3);

  if (params.dayOfMonth === firstDay) {
    return 'first_reminder';
  }
  if (params.dayOfMonth === dueDay) {
    return 'final_reminder';
  }
  if (params.dayOfMonth > dueDay) {
    const daysPastDue = params.dayOfMonth - (dueDay + 1);
    if (daysPastDue % freq === 0) {
      return 'overdue_reminder';
    }
  }
  return null;
}

/**
 * Interpolates {{variable}} placeholders in WhatsApp message templates.
 */
export function renderWhatsAppTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

/**
 * Formats integer PKR values consistently.
 */
export function formatPkr(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}
