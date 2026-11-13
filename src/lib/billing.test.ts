import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInvoiceState,
  evaluateReminderStage,
  formatBillingMonthLabel,
  getDueDateForMonth,
  isMemberBillableForMonth,
  renderWhatsAppTemplate,
} from './billing';

test('getDueDateForMonth defaults to 5th of billing month', () => {
  assert.equal(getDueDateForMonth('2026-11'), '2026-11-05');
  assert.equal(getDueDateForMonth('2026-12'), '2026-12-05');
  assert.equal(formatBillingMonthLabel('2026-11'), 'November 2026');
});

test('computeInvoiceState prevents partial payment from being marked Paid', () => {
  const partialBeforeDue = computeInvoiceState({
    amountDue: 18000,
    paidAmount: 10000,
    dueDate: '2026-11-05',
    currentDateIso: '2026-11-03',
  });
  assert.equal(partialBeforeDue.status, 'Partially Paid');
  assert.equal(partialBeforeDue.remainingAmount, 8000);

  const partialAfterDue = computeInvoiceState({
    amountDue: 18000,
    paidAmount: 10000,
    dueDate: '2026-11-05',
    currentDateIso: '2026-11-06',
  });
  assert.equal(partialAfterDue.status, 'Overdue');
  assert.equal(partialAfterDue.remainingAmount, 8000);

  const fullPaid = computeInvoiceState({
    amountDue: 18000,
    paidAmount: 18000,
    dueDate: '2026-11-05',
    currentDateIso: '2026-11-08',
  });
  assert.equal(fullPaid.status, 'Paid');
  assert.equal(fullPaid.remainingAmount, 0);
});

test('evaluateReminderStage follows 1st, 5th, 6th+ schedule and excludes Paid/Checked Out', () => {
  assert.equal(
    evaluateReminderStage({
      dayOfMonth: 1,
      invoiceStatus: 'Unpaid',
      memberStatus: 'Active',
      remainingAmount: 18000,
    }),
    'first_reminder'
  );
  assert.equal(
    evaluateReminderStage({
      dayOfMonth: 5,
      invoiceStatus: 'Partially Paid',
      memberStatus: 'Active',
      remainingAmount: 8000,
    }),
    'final_reminder'
  );
  assert.equal(
    evaluateReminderStage({
      dayOfMonth: 6,
      invoiceStatus: 'Overdue',
      memberStatus: 'Active',
      remainingAmount: 18000,
      overdueFrequencyDays: 3,
    }),
    'overdue_reminder'
  );
  assert.equal(
    evaluateReminderStage({
      dayOfMonth: 7,
      invoiceStatus: 'Overdue',
      memberStatus: 'Active',
      remainingAmount: 18000,
      overdueFrequencyDays: 3,
    }),
    null
  );
  // Paid member MUST NEVER receive reminders
  assert.equal(
    evaluateReminderStage({
      dayOfMonth: 1,
      invoiceStatus: 'Paid',
      memberStatus: 'Active',
      remainingAmount: 0,
    }),
    null
  );
  // Checked-out member MUST NEVER receive reminders
  assert.equal(
    evaluateReminderStage({
      dayOfMonth: 5,
      invoiceStatus: 'Unpaid',
      memberStatus: 'Checked Out',
      remainingAmount: 18000,
    }),
    null
  );
});

test('isMemberBillableForMonth excludes Checked Out and respects joining/leaving dates', () => {
  assert.equal(
    isMemberBillableForMonth({
      memberStatus: 'Active',
      joiningDate: '2026-11-10',
      leavingDate: null,
      billingMonth: '2026-11',
    }),
    true
  );
  assert.equal(
    isMemberBillableForMonth({
      memberStatus: 'Active',
      joiningDate: '2026-12-01',
      leavingDate: null,
      billingMonth: '2026-11',
    }),
    false
  );
  assert.equal(
    isMemberBillableForMonth({
      memberStatus: 'Checked Out',
      joiningDate: '2026-08-01',
      leavingDate: '2026-10-20',
      billingMonth: '2026-11',
    }),
    false
  );
});

test('renderWhatsAppTemplate interpolates variables cleanly', () => {
  const text = renderWhatsAppTemplate(
    'Assalam-o-Alaikum {{member_name}}, rent for {{billing_month}} is Rs. {{remaining_amount}}.',
    {
      member_name: 'Hamza Tariq',
      billing_month: 'November 2026',
      remaining_amount: '18,000',
    }
  );
  assert.equal(
    text,
    'Assalam-o-Alaikum Hamza Tariq, rent for November 2026 is Rs. 18,000.'
  );
});
