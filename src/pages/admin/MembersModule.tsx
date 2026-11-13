import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, Search, LogOut as CheckoutIcon, ArrowLeftRight, Printer } from 'lucide-react';
import { apiFetch, getAuthToken } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import type { RoomItem } from '../../types';

interface MemberRow {
  id: number;
  member_code: string;
  full_name: string;
  father_name: string;
  cnic: string;
  phone: string;
  whatsapp_number: string;
  occupation: string;
  institution_or_company: string;
  category_name: string;
  current_room_id: number | null;
  room_number: string | null;
  bed_number: string | null;
  monthly_rent: number;
  joining_date: string;
  status: string;
  current_payment_status: string | null;
  current_remaining_amount: number | null;
  deposit_amount: number;
  is_sample: number;
}

export function MembersModule() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showRegister, setShowRegister] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<MemberRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<MemberRow | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Registration form state
  const [regForm, setRegForm] = useState({
    full_name: '',
    father_name: '',
    cnic: '',
    phone: '',
    whatsapp_number: '',
    email: '',
    occupation: 'Student',
    institution_or_company: '',
    permanent_address: '',
    emergency_contact: '',
    guardian_contact: '',
    room_id: 0,
    bed_id: 0,
    monthly_rent: '18000',
    joining_date: new Date().toISOString().slice(0, 10),
    deposit_amount: '10000',
    notes: '',
  });

  // Checkout state
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [depositRefund, setDepositRefund] = useState('10000');
  const [leaveNotes, setLeaveNotes] = useState('');

  // Transfer state
  const [txRoomId, setTxRoomId] = useState(0);
  const [txBedId, setTxBedId] = useState(0);
  const [txRent, setTxRent] = useState('');

  const { data, isLoading } = useQuery<{ items: MemberRow[] }>({
    queryKey: ['admin-members', statusFilter, search],
    queryFn: () =>
      apiFetch(
        `/api/admin/members?status=${encodeURIComponent(statusFilter)}&q=${encodeURIComponent(search)}`
      ),
  });

  const { data: roomsData } = useQuery<{ rooms: RoomItem[] }>({
    queryKey: ['admin-rooms'],
    queryFn: () => apiFetch('/api/admin/rooms'),
  });

  const { data: detailData } = useQuery<{
    member: MemberRow & { notes: string; permanent_address: string; guardian_contact: string; actual_leaving_date: string | null };
    invoices: Array<{ id: number; billing_month: string; amount_due: number; paid_amount: number; remaining_amount: number; status: string }>;
    documents: Array<{ id: number; doc_type: string; title: string; created_at: string }>;
  }>({
    queryKey: ['admin-member-detail', detailId],
    queryFn: () => apiFetch(`/api/admin/members/${detailId}`),
    enabled: Boolean(detailId),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-members'] });
    qc.invalidateQueries({ queryKey: ['admin-member-detail'] });
    qc.invalidateQueries({ queryKey: ['admin-rooms'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['admin-payments'] });
    qc.invalidateQueries({ queryKey: ['public-rooms'] });
  };

  const roomsWithFreeBeds = (roomsData?.rooms || []).filter(
    (r) => r.is_active === 1 && r.beds.some((b) => b.status === 'Available')
  );

  const openRegModal = () => {
    setErrMsg(null);
    const first = roomsWithFreeBeds[0];
    setRegForm((prev) => ({
      ...prev,
      room_id: first?.id || 0,
      bed_id: first?.beds.find((b) => b.status === 'Available')?.id || 0,
      monthly_rent: String(first?.effective_rent || 18000),
    }));
    setShowRegister(true);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    try {
      await apiFetch('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          ...regForm,
          monthly_rent: Number(regForm.monthly_rent),
          deposit_amount: Number(regForm.deposit_amount),
        }),
      });
      setShowRegister(false);
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutTarget) return;
    setErrMsg(null);
    try {
      await apiFetch(`/api/admin/members/${checkoutTarget.id}/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          leaving_date: leaveDate,
          deposit_refunded: Number(depositRefund),
          notes: leaveNotes,
        }),
      });
      setCheckoutTarget(null);
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Checkout failed');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget) return;
    setErrMsg(null);
    try {
      await apiFetch(`/api/admin/members/${transferTarget.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          room_id: txRoomId,
          bed_id: txBedId,
          new_monthly_rent: txRent ? Number(txRent) : undefined,
        }),
      });
      setTransferTarget(null);
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Transfer failed');
    }
  };

  const handleUploadDocument = async (memberId: number, file: File, docType: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    fd.append('title', file.name);
    await apiFetch(`/api/admin/members/${memberId}/documents`, {
      method: 'POST',
      body: fd,
      isFormData: true,
    });
    qc.invalidateQueries({ queryKey: ['admin-member-detail', memberId] });
  };

  const viewPrivateDoc = async (docId: number) => {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/documents/${docId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    window.open(objUrl, '_blank', 'noopener,noreferrer');
  };

  const selectedRegRoom = (roomsData?.rooms || []).find((r) => r.id === regForm.room_id);
  const selectedTxRoom = (roomsData?.rooms || []).find((r) => r.id === txRoomId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member, CNIC, phone..."
              className="pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter members by status"
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="All">All Members</option>
            <option value="Active">Active</option>
            <option value="Notice Given">Notice Given</option>
            <option value="Checked Out">Checked Out</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openRegModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52]"
        >
          <Plus className="h-4 w-4" /> Register New Member
        </button>
      </div>

      {errMsg && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {errMsg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">Loading hostel members...</div>
        ) : (data?.items || []).length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No members found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Member</th>
                  <th className="py-3 px-4 font-semibold">Occupation</th>
                  <th className="py-3 px-4 font-semibold">Room / Bed</th>
                  <th className="py-3 px-4 font-semibold">Contact</th>
                  <th className="py-3 px-4 font-semibold text-right">Monthly Rent</th>
                  <th className="py-3 px-4 font-semibold">Payment Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.items || []).map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{m.full_name}</div>
                      <div className="text-slate-500 font-mono">
                        {m.member_code} · {m.status}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{m.occupation}</div>
                      <div className="text-slate-500 truncate max-w-[160px]">{m.institution_or_company}</div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {m.room_number ? `Rm ${m.room_number} · ${m.bed_number}` : 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">{m.phone}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-right tabular-nums">
                      {formatPkr(m.monthly_rent)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          m.current_payment_status === 'Paid'
                            ? 'text-emerald-700'
                            : m.current_payment_status === 'Overdue'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {m.current_payment_status || 'Unbilled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailId(m.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-md hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" /> Profile
                      </button>
                      {m.status !== 'Checked Out' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setTransferTarget(m);
                              const first = roomsWithFreeBeds[0];
                              setTxRoomId(first?.id || 0);
                              setTxBedId(first?.beds.find((b) => b.status === 'Available')?.id || 0);
                              setTxRent(String(first?.effective_rent || m.monthly_rent));
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-md hover:bg-slate-100"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCheckoutTarget(m);
                              setDepositRefund(String(m.deposit_amount || 0));
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-red-200 text-red-700 rounded-md hover:bg-red-50"
                          >
                            <CheckoutIcon className="h-3.5 w-3.5" /> Check Out
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Member Modal */}
      {showRegister && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleRegister} className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 my-8">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Register New Hostel Member</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Full Name *</label>
                <input required value={regForm.full_name} onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Father&apos;s Name</label>
                <input value={regForm.father_name} onChange={(e) => setRegForm({ ...regForm, father_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">CNIC Number *</label>
                <input required value={regForm.cnic} onChange={(e) => setRegForm({ ...regForm, cnic: e.target.value })} placeholder="37405-XXXXXXX-X" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Contact Phone *</label>
                <input required value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">WhatsApp Number *</label>
                <input required value={regForm.whatsapp_number} onChange={(e) => setRegForm({ ...regForm, whatsapp_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Occupation</label>
                <select value={regForm.occupation} onChange={(e) => setRegForm({ ...regForm, occupation: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  <option value="Student">Student</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">University / Company</label>
                <input value={regForm.institution_or_company} onChange={(e) => setRegForm({ ...regForm, institution_or_company: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Guardian Contact</label>
                <input value={regForm.guardian_contact} onChange={(e) => setRegForm({ ...regForm, guardian_contact: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Room *</label>
                <select
                  value={regForm.room_id}
                  onChange={(e) => {
                    const rid = Number(e.target.value);
                    const rm = roomsWithFreeBeds.find((r) => r.id === rid);
                    setRegForm({
                      ...regForm,
                      room_id: rid,
                      bed_id: rm?.beds.find((b) => b.status === 'Available')?.id || 0,
                      monthly_rent: String(rm?.effective_rent || regForm.monthly_rent),
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {roomsWithFreeBeds.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} ({r.category_name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Bed *</label>
                <select
                  value={regForm.bed_id}
                  onChange={(e) => setRegForm({ ...regForm, bed_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(selectedRegRoom?.beds || [])
                    .filter((b) => b.status === 'Available')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        Bed {b.bed_number}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Monthly Rent (PKR) *</label>
                <input type="number" required value={regForm.monthly_rent} onChange={(e) => setRegForm({ ...regForm, monthly_rent: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Joining Date *</label>
                <input type="date" required value={regForm.joining_date} onChange={(e) => setRegForm({ ...regForm, joining_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Deposit Amount (PKR)</label>
                <input type="number" value={regForm.deposit_amount} onChange={(e) => setRegForm({ ...regForm, deposit_amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Permanent Address</label>
                <input value={regForm.permanent_address} onChange={(e) => setRegForm({ ...regForm, permanent_address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setShowRegister(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Register Member</button>
            </div>
          </form>
        </div>
      )}

      {/* Member Profile Modal */}
      {detailId && detailData && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 space-y-5 my-8">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-mono text-slate-500">{detailData.member.member_code} · {detailData.member.status}</div>
                <h2 className="text-xl font-bold text-[#0B1F3A]">{detailData.member.full_name}</h2>
                <div className="text-xs text-slate-600 mt-0.5">
                  CNIC: <span className="font-mono">{detailData.member.cnic}</span> · Room {detailData.member.room_number || '-'} ({detailData.member.bed_number || '-'})
                </div>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div><span className="text-slate-500">Phone:</span> <span className="font-mono">{detailData.member.phone}</span></div>
                <div><span className="text-slate-500">WhatsApp:</span> <span className="font-mono">{detailData.member.whatsapp_number}</span></div>
                <div><span className="text-slate-500">Guardian:</span> <span className="font-mono">{detailData.member.guardian_contact}</span></div>
                <div><span className="text-slate-500">Address:</span> {detailData.member.permanent_address || '-'}</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-semibold text-[#0B1F3A]">Private Documents (CNIC / Photo)</div>
                {detailData.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between">
                    <span className="truncate">{doc.title}</span>
                    <button
                      type="button"
                      onClick={() => viewPrivateDoc(doc.id)}
                      className="text-xs font-semibold text-[#0B1F3A] hover:underline"
                    >
                      View Securely
                    </button>
                  </div>
                ))}
                <label className="inline-block cursor-pointer text-xs font-semibold text-blue-700 hover:underline pt-1">
                  + Upload CNIC / Photo
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadDocument(detailData.member.id, f, 'cnic');
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#0B1F3A]">Payment History</h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Paid</th>
                      <th className="py-2 px-3 text-right">Remaining</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailData.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2 px-3 font-mono">{inv.billing_month}</td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums">{formatPkr(inv.amount_due)}</td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums">{formatPkr(inv.paid_amount)}</td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums">{formatPkr(inv.remaining_amount)}</td>
                        <td className="py-2 px-3 font-semibold">{inv.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleTransfer} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Transfer Room — {transferTarget.full_name}</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Target Room</label>
                <select
                  value={txRoomId}
                  onChange={(e) => {
                    const rid = Number(e.target.value);
                    setTxRoomId(rid);
                    const rm = roomsWithFreeBeds.find((r) => r.id === rid);
                    setTxBedId(rm?.beds.find((b) => b.status === 'Available')?.id || 0);
                    if (rm) setTxRent(String(rm.effective_rent));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {roomsWithFreeBeds.map((r) => (
                    <option key={r.id} value={r.id}>Room {r.room_number} ({r.category_name})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Target Bed</label>
                <select value={txBedId} onChange={(e) => setTxBedId(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  {(selectedTxRoom?.beds || []).filter((b) => b.status === 'Available').map((b) => (
                    <option key={b.id} value={b.id}>Bed {b.bed_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Updated Monthly Rent (PKR)</label>
                <input type="number" value={txRent} onChange={(e) => setTxRent(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTransferTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Confirm Transfer</button>
            </div>
          </form>
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleCheckout} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Check Out Member — {checkoutTarget.full_name}</h2>
            <p className="text-xs text-slate-600">
              Checking out releases Bed {checkoutTarget.bed_number} in Room {checkoutTarget.room_number} while preserving all historical payment and allocation records.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Leaving Date *</label>
                <input type="date" required value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Deposit Refunded / Settled (PKR)</label>
                <input type="number" value={depositRefund} onChange={(e) => setDepositRefund(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Settlement Notes</label>
                <textarea rows={2} value={leaveNotes} onChange={(e) => setLeaveNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCheckoutTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg">Complete Check Out</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
