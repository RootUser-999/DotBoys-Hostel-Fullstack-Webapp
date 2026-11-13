import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Search, UserPlus, Check, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import type { RoomCategorySummary, RoomItem } from '../../types';

interface BookingRow {
  id: number;
  reference_code: string;
  full_name: string;
  father_name: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  occupation: string;
  institution_or_company: string;
  category_id: number;
  category_name: string;
  bed_id: number | null;
  bed_number: string | null;
  room_number: string | null;
  preferred_move_in: string;
  duration_months: number;
  occupants_count: number;
  requirements: string;
  message: string;
  status: string;
  hold_expires_at: string | null;
  internal_notes: string;
  converted_member_id: number | null;
  created_at: string;
}

interface InquiryRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  internal_notes: string;
  created_at: string;
}

export function BookingsModule() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'bookings' | 'inquiries'>('bookings');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [converting, setConverting] = useState<BookingRow | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(0);
  const [selectedBedId, setSelectedBedId] = useState<number>(0);
  const [cnic, setCnic] = useState('');
  const [deposit, setDeposit] = useState('10000');
  const [rent, setRent] = useState('18000');
  const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery<{ items: BookingRow[]; inquiries: InquiryRow[] }>({
    queryKey: ['admin-bookings', statusFilter, search],
    queryFn: () =>
      apiFetch(
        `/api/admin/bookings?status=${encodeURIComponent(statusFilter)}&q=${encodeURIComponent(search)}`
      ),
  });

  const { data: roomsData } = useQuery<{
    categories: RoomCategorySummary[];
    rooms: RoomItem[];
  }>({
    queryKey: ['admin-rooms'],
    queryFn: () => apiFetch('/api/admin/rooms'),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin-rooms'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['admin-members'] });
    qc.invalidateQueries({ queryKey: ['public-rooms'] });
  };

  const updateBookingStatus = async (id: number, status: string, notes?: string) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, internal_notes: notes }),
      });
      refreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update booking');
    }
  };

  const openConvertModal = (b: BookingRow) => {
    setErrorMsg(null);
    setConverting(b);
    const matchingRooms = (roomsData?.rooms || []).filter(
      (r) => r.is_active === 1 && r.beds.some((bd) => bd.status === 'Available')
    );
    const preferredRoom =
      matchingRooms.find((r) => r.category_id === b.category_id) || matchingRooms[0];
    if (preferredRoom) {
      setSelectedRoomId(preferredRoom.id);
      const availBed = preferredRoom.beds.find((bd) => bd.status === 'Available');
      setSelectedBedId(availBed?.id || 0);
      setRent(String(preferredRoom.effective_rent));
    } else {
      setSelectedRoomId(0);
      setSelectedBedId(0);
    }
    setJoiningDate(b.preferred_move_in || new Date().toISOString().slice(0, 10));
    setCnic('');
  };

  const handleConvertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!converting) return;
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/bookings/${converting.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          room_id: selectedRoomId,
          bed_id: selectedBedId,
          cnic,
          monthly_rent: Number(rent),
          deposit_amount: Number(deposit),
          joining_date: joiningDate,
        }),
      });
      setConverting(null);
      refreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Conversion failed');
    }
  };

  const updateInquiryStatus = async (id: number, status: string) => {
    await apiFetch(`/api/admin/inquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    qc.invalidateQueries({ queryKey: ['admin-bookings'] });
  };

  const availableRooms = (roomsData?.rooms || []).filter((r) => r.is_active === 1);
  const currentRoom = availableRooms.find((r) => r.id === selectedRoomId);
  const availableBedsForRoom = (currentRoom?.beds || []).filter((b) => b.status === 'Available');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTab('bookings')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'bookings' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Room Bookings ({data?.items.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setTab('inquiries')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'inquiries' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Contact Inquiries ({data?.inquiries.length || 0})
          </button>
        </div>

        {tab === 'bookings' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, ref..."
                className="w-60 pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter bookings by status"
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Expired">Expired</option>
            </select>
          </div>
        )}
      </div>

      {errorMsg && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {tab === 'bookings' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-sm text-slate-500">Loading booking requests...</div>
          ) : (data?.items || []).length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No bookings match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Reference</th>
                    <th className="py-3 px-4 font-semibold">Applicant</th>
                    <th className="py-3 px-4 font-semibold">Category &amp; Move-in</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.items || []).map((b) => {
                    const waDigits = b.whatsapp_number.replace(/\D/g, '');
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono font-semibold text-[#0B1F3A]">{b.reference_code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{b.full_name}</div>
                          <div className="text-slate-500 font-mono tabular-nums">
                            {b.phone} · {b.institution_or_company}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{b.category_name}</div>
                          <div className="text-slate-500 font-mono">Move-in: {b.preferred_move_in}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              b.status === 'Confirmed'
                                ? 'text-emerald-700'
                                : b.status === 'Approved'
                                ? 'text-blue-700'
                                : b.status === 'Rejected' || b.status === 'Cancelled' || b.status === 'Expired'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          <a
                            href={`https://wa.me/${waDigits}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                          {(b.status === 'Pending' || b.status === 'Under Review') && (
                            <>
                              <button
                                type="button"
                                onClick={() => updateBookingStatus(b.id, 'Approved')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => updateBookingStatus(b.id, 'Rejected')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-red-200 text-red-700 rounded-md hover:bg-red-50 font-medium"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          {!b.converted_member_id &&
                            ['Pending', 'Approved', 'Awaiting Confirmation'].includes(b.status) && (
                              <button
                                type="button"
                                onClick={() => openConvertModal(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0B1F3A] text-white rounded-md hover:bg-[#132D52] font-medium"
                              >
                                <UserPlus className="h-3.5 w-3.5" /> Convert to Member
                              </button>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {(data?.inquiries || []).length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No contact inquiries yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {(data?.inquiries || []).map((inq) => (
                <div key={inq.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-[#0B1F3A] text-sm">{inq.name}</span>
                      <span className="font-mono">{inq.phone}</span>
                      <span>· {inq.status}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{inq.subject}</div>
                    <p className="text-xs text-slate-600">{inq.message}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateInquiryStatus(inq.id, 'Resolved')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
                    >
                      Mark Resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => updateInquiryStatus(inq.id, 'Archived')}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Convert Booking to Member Modal */}
      {converting && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleConvertSubmit} className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              Convert Booking to Active Member — {converting.full_name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Assign Room *</label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => {
                    const rid = Number(e.target.value);
                    setSelectedRoomId(rid);
                    const rm = availableRooms.find((r) => r.id === rid);
                    const firstFree = rm?.beds.find((bd) => bd.status === 'Available');
                    setSelectedBedId(firstFree?.id || 0);
                    if (rm) setRent(String(rm.effective_rent));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  {availableRooms.map((r) => {
                    const freeCount = r.beds.filter((bd) => bd.status === 'Available').length;
                    return (
                      <option key={r.id} value={r.id} disabled={freeCount === 0}>
                        Room {r.room_number} ({r.category_name}) — {freeCount} free ({formatPkr(r.effective_rent)})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Assign Bed *</label>
                <select
                  value={selectedBedId}
                  onChange={(e) => setSelectedBedId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  {availableBedsForRoom.map((bd) => (
                    <option key={bd.id} value={bd.id}>
                      Bed {bd.bed_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">CNIC Number *</label>
                <input
                  required
                  value={cnic}
                  onChange={(e) => setCnic(e.target.value)}
                  placeholder="37405-XXXXXXX-X"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date *</label>
                <input
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Rent (PKR) *</label>
                <input
                  type="number"
                  required
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Security Deposit (PKR)</label>
                <input
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConverting(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedRoomId || !selectedBedId}
                className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52] disabled:opacity-50"
              >
                Confirm Registration &amp; Allocate Bed
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
