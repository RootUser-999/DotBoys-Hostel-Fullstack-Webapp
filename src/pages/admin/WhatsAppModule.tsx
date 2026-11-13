import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, RotateCw, Send, Save } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface WhatsAppResponse {
  status: {
    configured: boolean;
    phoneNumberId: string;
    wabaId: string;
    hasAccessToken: boolean;
  };
  templates: Array<{
    id: number;
    code: string;
    name: string;
    stage: string;
    body_template: string;
    is_active: number;
  }>;
  logs: Array<{
    id: number;
    member_name: string | null;
    recipient_phone: string;
    message_type: string;
    message_content: string;
    channel: string;
    wa_message_id: string | null;
    delivery_status: string;
    failure_reason: string | null;
    sent_at: string | null;
  }>;
  schedule: {
    whatsapp_auto_enabled: string;
    first_reminder_day: string;
    billing_due_day: string;
    overdue_reminder_frequency_days: string;
  };
}

export function WhatsAppModule() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<WhatsAppResponse>({
    queryKey: ['admin-whatsapp'],
    queryFn: () => apiFetch('/api/admin/whatsapp'),
  });

  const [phoneId, setPhoneId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [autoEnabled, setAutoEnabled] = useState('1');
  const [overdueFreq, setOverdueFreq] = useState('3');
  const [testPhone, setTestPhone] = useState('+923059308333');
  const [testMessage, setTestMessage] = useState('Test message from DOT BOYS HOSTEL Management System.');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingTemplates, setEditingTemplates] = useState<Record<number, string>>({});

  useEffect(() => {
    if (data) {
      setPhoneId(data.status.phoneNumberId || '');
      setWabaId(data.status.wabaId || '');
      setAutoEnabled(data.schedule.whatsapp_auto_enabled || '1');
      setOverdueFreq(data.schedule.overdue_reminder_frequency_days || '3');
      const map: Record<number, string> = {};
      for (const t of data.templates) map[t.id] = t.body_template;
      setEditingTemplates(map);
    }
  }, [data]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/whatsapp/config', {
      method: 'PATCH',
      body: JSON.stringify({
        whatsapp_phone_number_id: phoneId,
        whatsapp_waba_id: wabaId,
        whatsapp_auto_enabled: autoEnabled,
        overdue_reminder_frequency_days: overdueFreq,
      }),
    });
    setFeedback('WhatsApp configuration saved.');
    qc.invalidateQueries({ queryKey: ['admin-whatsapp'] });
  };

  const saveTemplate = async (id: number) => {
    await apiFetch(`/api/admin/whatsapp/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body_template: editingTemplates[id] }),
    });
    setFeedback('Message template updated.');
    qc.invalidateQueries({ queryKey: ['admin-whatsapp'] });
  };

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ delivery_status: string; failure_reason?: string }>('/api/admin/whatsapp/send-test', {
      method: 'POST',
      body: JSON.stringify({ phone: testPhone, message: testMessage }),
    });
    setFeedback(
      res.delivery_status === 'accepted'
        ? 'Message accepted by WhatsApp Business Cloud API.'
        : `Logged as ${res.delivery_status}: ${res.failure_reason || ''}`
    );
    qc.invalidateQueries({ queryKey: ['admin-whatsapp'] });
  };

  const runBatch = async (forceDay?: number) => {
    const res = await apiFetch<{
      evaluated: number;
      queued: number;
      skippedPaidOrExcluded: number;
      accepted: number;
      failed: number;
    }>('/api/admin/whatsapp/run-reminders', {
      method: 'POST',
      body: JSON.stringify(forceDay ? { force_day: forceDay } : {}),
    });
    setFeedback(
      `Evaluated ${res.evaluated} invoices · Skipped ${res.skippedPaidOrExcluded} paid/excluded · Queued ${res.queued} (${res.accepted} accepted, ${res.failed} failed).`
    );
    qc.invalidateQueries({ queryKey: ['admin-whatsapp'] });
  };

  const retryMessage = async (id: number) => {
    await apiFetch(`/api/admin/whatsapp/messages/${id}/retry`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['admin-whatsapp'] });
  };

  if (isLoading || !data) return <div className="p-8 text-sm text-slate-500">Loading WhatsApp integration...</div>;

  return (
    <div className="space-y-6">
      {/* Integration Status Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">Official WhatsApp Business Cloud API (Meta Graph v21.0)</div>
          <div className="text-base font-bold text-[#0B1F3A] mt-0.5">
            {data.status.configured
              ? 'Cloud API Credentials Active (Server-side Environment)'
              : 'Credentials Pending — Manual WhatsApp Links Active'}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Access tokens are stored exclusively in server environment variables (`WHATSAPP_ACCESS_TOKEN`). Paid and checked-out members are strictly excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runBatch()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52]"
          >
            <Play className="h-3.5 w-3.5" /> Run Today&apos;s Reminders
          </button>
          <button
            type="button"
            onClick={() => runBatch(1)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Trigger 1st-of-Month Batch
          </button>
          <button
            type="button"
            onClick={() => runBatch(5)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Trigger 5th Final Batch
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-slate-900 text-white rounded-lg text-xs font-medium">{feedback}</div>
      )}

      {/* Config & Test Send */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={saveConfig} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <h2 className="text-sm font-bold text-[#0B1F3A]">Cloud API IDs &amp; Reminder Schedule (PKT)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Phone Number ID</label>
              <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="e.g. 102938475610293" className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">WhatsApp Business Account ID</label>
              <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WABA ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Automated Reminders</label>
              <select value={autoEnabled} onChange={(e) => setAutoEnabled(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                <option value="1">Enabled (1st, 5th, 6th+ PKT)</option>
                <option value="0">Paused (Manual Only)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Overdue Frequency (Days)</label>
              <input type="number" min={1} max={15} value={overdueFreq} onChange={(e) => setOverdueFreq(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
            </div>
          </div>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
            <Save className="h-3.5 w-3.5" /> Save Configuration
          </button>
        </form>

        <form onSubmit={sendTest} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <h2 className="text-sm font-bold text-[#0B1F3A]">Send Test WhatsApp Message</h2>
          <div>
            <label className="block font-medium text-slate-600 mb-1">Recipient WhatsApp Number</label>
            <input required value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block font-medium text-slate-600 mb-1">Message Text</label>
            <textarea rows={2} required value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800">
            <Send className="h-3.5 w-3.5" /> Dispatch Test Message
          </button>
        </form>
      </div>

      {/* Templates */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-[#0B1F3A]">Automated Payment Reminder Templates</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {data.templates.map((tpl) => (
            <div key={tpl.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
              <div className="font-bold text-[#0B1F3A]">{tpl.name}</div>
              <textarea
                rows={7}
                value={editingTemplates[tpl.id] || ''}
                onChange={(e) => setEditingTemplates({ ...editingTemplates, [tpl.id]: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-sans text-xs"
              />
              <button
                type="button"
                onClick={() => saveTemplate(tpl.id)}
                className="px-3 py-1.5 bg-[#0B1F3A] text-white font-semibold rounded-md"
              >
                Save Template
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Logs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-[#0B1F3A]">Delivery Logs &amp; Failed Queue</h2>
        </div>
        {data.logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No WhatsApp messages logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Recipient</th>
                  <th className="py-2.5 px-4 font-semibold">Type</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Details / Failure Reason</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{log.member_name || 'Manual / Test'}</div>
                      <div className="font-mono text-slate-500">{log.recipient_phone}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono">{log.message_type}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`font-semibold ${
                          log.delivery_status === 'delivered' || log.delivery_status === 'read'
                            ? 'text-emerald-700'
                            : log.delivery_status === 'accepted' || log.delivery_status === 'sent'
                            ? 'text-blue-700'
                            : 'text-red-700'
                        }`}
                      >
                        {log.delivery_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                      {log.failure_reason || log.wa_message_id || 'Recorded'}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                      {log.delivery_status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => retryMessage(log.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded-md hover:bg-slate-100"
                        >
                          <RotateCw className="h-3 w-3" /> Retry
                        </button>
                      )}
                      <a
                        href={`https://wa.me/${log.recipient_phone.replace(/\D/g, '')}?text=${encodeURIComponent(log.message_content)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center px-2.5 py-1 bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
                      >
                        Open Link
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
