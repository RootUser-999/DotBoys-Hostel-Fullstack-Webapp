import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, PlusCircle, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import { downloadPaymentReceiptPdf, type ReceiptPayload } from '../../lib/pdf';

interface InvoiceRow {
  id: number;
  invoice_number: string;
  member_id: number;
  member_code: string;
  full_name: string;
  phone: string;
  category_name: string;
  room_number: string | null;
  billing_month: string;
  due_date: string;
  amount_due: number;
  adjustment_net: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
}

interface PaymentRow {
  id: number;
  member_name: string;
  member_code: string;
  billing_month: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_id: string;
  receipt_number: string;
}

export function PaymentsModule() {
  const qc = useQueryClient();
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [payModal, setPayModal] = useState<InvoiceRow | null>(null);
  const [adjModal, setAdjModal] = useState<InvoiceRow | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const [adjType, setAdjType] = useState('Discount');
  const [adjDelta, setAdjDelta] = useState('-1000');
  const [adjReason, setAdjReason] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    billingMonth: string;
    invoices: InvoiceRow[];
    summary: {
      expected: number;
      collected: number;
      remaining: number;
      paidCount: number;
      overdueCount: number;
      unpaidOrPartialCount: number;
    };
    recentPayments: PaymentRow[];
    periods: Array<{ billing_month: string }>;
  }>({
    queryKey: ['admin-payments', monthFilter, statusFilter, search],
    queryFn: () =>
      apiFetch(
        `/api/admin/payments?month=${encodeURIComponent(monthFilter)}&status=${encodeURIComponent(
          statusFilter
        )}&q=${encodeURIComponent(search)}`
      ),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-payments'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['admin-members'] });
  };

  const handleGenerateBilling = async () => {
    setErrMsg(null);
    setFeedback(null);
    const res = await apiFetch<{ createdCount: number; skippedCount: number }>(
      '/api/admin/payments/generate-billing',
      {
        method: 'POST',
        body: JSON.stringify({ billing_month: monthFilter === 'All' ? undefined : monthFilter }),
      }
    );
    setFeedback(`Billing cycle processed: ${res.createdCount} invoices generated, ${res.skippedCount} skipped.`);
    refreshAll();
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    setErrMsg(null);
    try {
      const res = await apiFetch<{ receiptNumber: string; status: string }>('/api/admin/payments/record', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: payModal.id,
          amount: Number(payAmount),
          payment_date: payDate,
          payment_method: payMethod,
          reference_id: payRef,
          notes: payNotes,
        }),
      });
      setPayModal(null);
      setPayRef('');
      setPayNotes('');
      setFeedback(`Payment recorded (${res.receiptNumber}). Invoice status: ${res.status}.`);
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to record payment');
    }
  };

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjModal) return;
    setErrMsg(null);
    try {
      await apiFetch('/api/admin/payments/adjust', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: adjModal.id,
          adjustment_type: adjType,
          amount_delta: Number(adjDelta),
          reason: adjReason,
        }),
      });
      setAdjModal(null);
      setAdjReason('');
      setFeedback('Financial adjustment recorded in audit log.');
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to save adjustment');
    }
  };

  const handleDownloadReceipt = async (paymentId: number) => {
    const res = await apiFetch<{ receipt: ReceiptPayload }>(`/api/admin/receipts/${paymentId}`);
    downloadPaymentReceiptPdf(res.receipt);
  };

  const sum = data?.summary;

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      {sum && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Expected Billing</div>
            <div className="font-mono text-xl font-bold text-[#0B1F3A] tabular-nums mt-1">{formatPkr(sum.expected)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Collected Amount</div>
            <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums mt-1">{formatPkr(sum.collected)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sum.paidCount} paid invoices</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Pending &amp; Overdue Balance</div>
            <div className="font-mono text-xl font-bold text-red-700 tabular-nums mt-1">{formatPkr(sum.remaining)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sum.overdueCount} overdue · {sum.unpaidOrPartialCount} open</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs text-slate-500">Monthly Billing Action</div>
            <button
              type="button"
              onClick={handleGenerateBilling}
              className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Generate Invoices ({monthFilter})
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">{feedback}</div>
      )}
      {errMsg && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errMsg}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={monthFilter === 'All' ? '' : monthFilter}
          onChange={(e) => setMonthFilter(e.target.value || 'All')}
          aria-label="Filter by billing month"
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by payment status"
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
        >
          <option value="All">All Statuses</option>
          <option value="Paid">Paid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Overdue">Overdue</option>
          <option value="Waived">Waived</option>
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search member or invoice..."
          className="w-60 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
        />
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">Loading billing ledger...</div>
        ) : (data?.invoices || []).length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No invoices found for the selected filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Invoice / Month</th>
                  <th className="py-3 px-4 font-semibold">Member</th>
                  <th className="py-3 px-4 font-semibold text-right">Due</th>
                  <th className="py-3 px-4 font-semibold text-right">Paid</th>
                  <th className="py-3 px-4 font-semibold text-right">Remaining</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.invoices || []).map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-[#0B1F3A]">{inv.invoice_number}</div>
                      <div className="text-slate-500 font-mono">Due {inv.due_date}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inv.full_name}</div>
                      <div className="text-slate-500">Rm {inv.room_number || '-'} · {inv.member_code}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-right tabular-nums">
                      {formatPkr(inv.amount_due + (inv.adjustment_net || 0))}
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-emerald-700 tabular-nums">
                      {formatPkr(inv.paid_amount)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right tabular-nums">
                      {formatPkr(inv.remaining_amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          inv.status === 'Paid' || inv.status === 'Waived'
                            ? 'text-emerald-700'
                            : inv.status === 'Overdue'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {inv.status}
                      </span>
                      {inv.status === 'Overdue' && inv.paid_amount > 0 && (
                        <div className="text-[11px] text-amber-700 font-medium">Part-paid</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {inv.remaining_amount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayModal(inv);
                            setPayAmount(String(inv.remaining_amount));
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0B1F3A] text-white rounded-md hover:bg-[#132D52] font-medium"
                        >
                          <PlusCircle className="h-3.5 w-3.5" /> Record Payment
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAdjModal(inv)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-md hover:bg-slate-100"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Payments & PDF Receipts */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-[#0B1F3A]">Recent Payment Transactions &amp; PDF Receipts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Receipt</th>
                <th className="py-2.5 px-4 font-semibold">Member</th>
                <th className="py-2.5 px-4 font-semibold">Method &amp; Ref</th>
                <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                <th className="py-2.5 px-4 font-semibold text-right">Receipt PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.recentPayments || []).map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-4 font-mono">{p.receipt_number || `PAY-${p.id}`}</td>
                  <td className="py-2.5 px-4 font-semibold">{p.member_name} ({p.billing_month})</td>
                  <td className="py-2.5 px-4">{p.payment_method} {p.reference_id ? `· ${p.reference_id}` : ''}</td>
                  <td className="py-2.5 px-4 font-mono font-semibold text-right tabular-nums text-emerald-700">{formatPkr(p.amount)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDownloadReceipt(p.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-md hover:bg-slate-100 font-medium"
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {payModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleRecordPayment} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Record Payment — {payModal.full_name}</h2>
            <div className="text-xs text-slate-600 font-mono">
              Invoice {payModal.invoice_number} · Remaining: {formatPkr(payModal.remaining_amount)}
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Amount Paid (PKR, supports partial) *</label>
                <input
                  type="number"
                  min={1}
                  max={payModal.remaining_amount}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Payment Date *</label>
                <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Payment Method *</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="JazzCash">JazzCash</option>
                  <option value="Easypaisa">Easypaisa</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Transaction / Reference ID</label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional bank/wallet ref" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Notes</label>
                <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayModal(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Save Payment &amp; Issue Receipt</button>
            </div>
          </form>
        </div>
      )}

      {/* Adjustment Modal */}
      {adjModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleAdjustment} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Financial Adjustment — {adjModal.full_name}</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Adjustment Type</label>
                <select value={adjType} onChange={(e) => setAdjType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  <option value="Discount">Discount (use negative delta e.g. -1000)</option>
                  <option value="Waiver">Full Waiver</option>
                  <option value="Penalty">Late Fee / Extra Charge (positive delta)</option>
                  <option value="Correction">Audit Correction</option>
                  <option value="Refund">Refund</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Amount Delta (PKR)</label>
                <input type="number" required value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Audit Reason *</label>
                <input required value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Mandatory explanation" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAdjModal(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Record Adjustment</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
