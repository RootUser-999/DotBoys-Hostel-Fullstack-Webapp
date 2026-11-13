import { db, getSetting } from './db.ts';
import {
  evaluateReminderStage,
  formatBillingMonthLabel,
  getKarachiDateParts,
  renderWhatsAppTemplate,
} from '../src/lib/billing.ts';

export function normalizePakistaniPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('92')) return digits;
  if (digits.startsWith('03')) return '92' + digits.slice(1);
  if (digits.startsWith('3') && digits.length === 10) return '92' + digits;
  return digits;
}

export function getWhatsAppConfigStatus(): {
  configured: boolean;
  phoneNumberId: string;
  wabaId: string;
  hasAccessToken: boolean;
} {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId =
    getSetting('whatsapp_phone_number_id') || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const wabaId = getSetting('whatsapp_waba_id') || process.env.WHATSAPP_WABA_ID || '';
  return {
    configured: Boolean(accessToken && phoneNumberId),
    phoneNumberId,
    wabaId,
    hasAccessToken: Boolean(accessToken),
  };
}

export async function sendViaWhatsAppCloudApi(params: {
  toPhone: string;
  text: string;
  maxRetries?: number;
}): Promise<{
  ok: boolean;
  status: 'accepted' | 'failed';
  waMessageId?: string;
  error?: string;
}> {
  const config = getWhatsAppConfigStatus();
  if (!config.configured) {
    return {
      ok: false,
      status: 'failed',
      error: 'WhatsApp Business Cloud API credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.',
    };
  }

  const normalized = normalizePakistaniPhone(params.toPhone);
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
  const endpoint = `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`;
  const maxAttempts = params.maxRetries ?? 3;

  let lastError = 'Unknown error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalized,
          type: 'text',
          text: { body: params.text },
        }),
      });
      const json = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };
      if (res.ok && json.messages?.[0]?.id) {
        // Cloud API confirms acceptance; actual delivery arrives asynchronously via webhook
        return {
          ok: true,
          status: 'accepted',
          waMessageId: json.messages[0].id,
        };
      }
      lastError = json.error?.message || `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
    }
  }

  return { ok: false, status: 'failed', error: lastError };
}

export async function dispatchAndLogWhatsAppMessage(params: {
  memberId?: number | null;
  invoiceId?: number | null;
  billingMonth?: string | null;
  recipientPhone: string;
  messageType: string;
  messageContent: string;
  idempotencyKey?: string;
}): Promise<{
  id: number;
  delivery_status: string;
  wa_message_id: string | null;
  failure_reason: string | null;
}> {
  if (params.idempotencyKey) {
    const existing = db
      .prepare('SELECT id, delivery_status, wa_message_id, failure_reason FROM whatsapp_messages WHERE idempotency_key = ?')
      .get(params.idempotencyKey) as
      | { id: number; delivery_status: string; wa_message_id: string | null; failure_reason: string | null }
      | undefined;
    if (existing) {
      return existing;
    }
  }

  const normalized = normalizePakistaniPhone(params.recipientPhone);
  const insert = db
    .prepare(
      `INSERT INTO whatsapp_messages
       (member_id, invoice_id, billing_month, recipient_phone, message_type, message_content, idempotency_key, channel, delivery_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'cloud_api', 'queued')`
    )
    .run(
      params.memberId ?? null,
      params.invoiceId ?? null,
      params.billingMonth ?? null,
      normalized,
      params.messageType,
      params.messageContent,
      params.idempotencyKey ?? null
    );
  const msgRowId = Number(insert.lastInsertRowid);

  const result = await sendViaWhatsAppCloudApi({
    toPhone: normalized,
    text: params.messageContent,
  });

  if (result.ok) {
    db.prepare(
      `UPDATE whatsapp_messages
       SET delivery_status = 'accepted', wa_message_id = ?, sent_at = datetime('now'), failure_reason = NULL
       WHERE id = ?`
    ).run(result.waMessageId ?? null, msgRowId);
  } else {
    db.prepare(
      `UPDATE whatsapp_messages
       SET delivery_status = 'failed', failure_reason = ?, sent_at = datetime('now')
       WHERE id = ?`
    ).run(result.error ?? 'Failed', msgRowId);
  }

  return db
    .prepare('SELECT id, delivery_status, wa_message_id, failure_reason FROM whatsapp_messages WHERE id = ?')
    .get(msgRowId) as {
    id: number;
    delivery_status: string;
    wa_message_id: string | null;
    failure_reason: string | null;
  };
}

export async function runAutomatedWhatsAppReminders(options?: {
  forceDayOfMonth?: number;
}): Promise<{
  evaluated: number;
  queued: number;
  skippedPaidOrExcluded: number;
  accepted: number;
  failed: number;
}> {
  const karachi = getKarachiDateParts();
  const dayOfMonth = options?.forceDayOfMonth ?? karachi.day;
  const dueDay = Number(getSetting('billing_due_day', '5'));
  const firstDay = Number(getSetting('first_reminder_day', '1'));
  const freq = Number(getSetting('overdue_reminder_frequency_days', '3'));

  const templates = db
    .prepare('SELECT stage, body_template, is_active FROM whatsapp_templates')
    .all() as Array<{ stage: string; body_template: string; is_active: number }>;
  const tplMap = Object.fromEntries(templates.map((t) => [t.stage, t]));

  const rows = db
    .prepare(
      `SELECT i.id as invoice_id, i.billing_month, i.amount_due, i.remaining_amount, i.status as invoice_status,
              m.id as member_id, m.full_name, m.whatsapp_number, m.status as member_status, m.whatsapp_opt_in
       FROM invoices i
       JOIN hostel_members m ON m.id = i.member_id
       WHERE i.billing_month = ?`
    )
    .all(karachi.billingMonth) as Array<{
    invoice_id: number;
    billing_month: string;
    amount_due: number;
    remaining_amount: number;
    invoice_status: string;
    member_id: number;
    full_name: string;
    whatsapp_number: string;
    member_status: string;
    whatsapp_opt_in: number;
  }>;

  let queued = 0;
  let skippedPaidOrExcluded = 0;
  let accepted = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.whatsapp_opt_in !== 1) {
      skippedPaidOrExcluded += 1;
      continue;
    }
    const stage = evaluateReminderStage({
      dayOfMonth,
      invoiceStatus: row.invoice_status,
      memberStatus: row.member_status,
      remainingAmount: row.remaining_amount,
      overdueFrequencyDays: freq,
      dueDay,
      firstReminderDay: firstDay,
    });
    if (!stage) {
      skippedPaidOrExcluded += 1;
      continue;
    }
    const tpl = tplMap[stage];
    if (!tpl || tpl.is_active !== 1) {
      skippedPaidOrExcluded += 1;
      continue;
    }

    const idempotencyKey = `${row.invoice_id}:${karachi.isoDate}:${stage}`;
    const alreadySent = db
      .prepare('SELECT id FROM whatsapp_messages WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (alreadySent) {
      skippedPaidOrExcluded += 1;
      continue;
    }

    const messageContent = renderWhatsAppTemplate(tpl.body_template, {
      member_name: row.full_name,
      billing_month: formatBillingMonthLabel(row.billing_month),
      amount_due: row.amount_due.toLocaleString('en-PK'),
      remaining_amount: row.remaining_amount.toLocaleString('en-PK'),
    });

    queued += 1;
    const res = await dispatchAndLogWhatsAppMessage({
      memberId: row.member_id,
      invoiceId: row.invoice_id,
      billingMonth: row.billing_month,
      recipientPhone: row.whatsapp_number,
      messageType: stage,
      messageContent,
      idempotencyKey,
    });
    if (res.delivery_status === 'accepted') accepted += 1;
    else failed += 1;
  }

  return {
    evaluated: rows.length,
    queued,
    skippedPaidOrExcluded,
    accepted,
    failed,
  };
}
