import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench, Archive, Edit2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import type { RoomCategorySummary, RoomItem } from '../../types';

export function RoomsModule() {
  const qc = useQueryClient();
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingCat, setEditingCat] = useState<RoomCategorySummary | null>(null);
  const [newRoom, setNewRoom] = useState({
    category_id: 1,
    room_number: '',
    floor: '1st Floor',
    max_occupancy: 2,
    description: '',
  });
  const [catRent, setCatRent] = useState('');
  const [catPromoRent, setCatPromoRent] = useState('');
  const [catPromoActive, setCatPromoActive] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    categories: RoomCategorySummary[];
    rooms: RoomItem[];
  }>({
    queryKey: ['admin-rooms'],
    queryFn: () => apiFetch('/api/admin/rooms'),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-rooms'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['public-rooms'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    try {
      await apiFetch('/api/admin/rooms', {
        method: 'POST',
        body: JSON.stringify(newRoom),
      });
      setShowAddRoom(false);
      setNewRoom({ ...newRoom, room_number: '' });
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to add room');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    await apiFetch(`/api/admin/room-categories/${editingCat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        monthly_rent: Number(catRent),
        promo_rent: catPromoRent ? Number(catPromoRent) : null,
        promo_active: catPromoActive ? 1 : 0,
      }),
    });
    setEditingCat(null);
    refreshAll();
  };

  const toggleBedMaintenance = async (bedId: number, currentStatus: string) => {
    setErrMsg(null);
    try {
      const next = currentStatus === 'Maintenance' ? 'Available' : 'Maintenance';
      await apiFetch(`/api/admin/beds/${bedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      refreshAll();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to update bed');
    }
  };

  const toggleArchiveRoom = async (room: RoomItem) => {
    await apiFetch(`/api/admin/rooms/${room.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: room.is_active === 1 ? 0 : 1 }),
    });
    refreshAll();
  };

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading room inventory...</div>;

  return (
    <div className="space-y-6">
      {errMsg && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {/* Room Categories & Pricing Control */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B1F3A]">Room Categories &amp; Configurable Pricing</h2>
            <p className="text-xs text-slate-500">Changes sync directly to the public Rooms &amp; Pricing page.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddRoom(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52]"
          >
            <Plus className="h-4 w-4" /> Add Room
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(data?.categories || []).map((cat) => (
            <div key={cat.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0B1F3A]">{cat.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCat(cat);
                    setCatRent(String(cat.monthly_rent));
                    setCatPromoRent(cat.promo_rent ? String(cat.promo_rent) : '');
                    setCatPromoActive(cat.promo_active === 1);
                  }}
                  aria-label={`Edit ${cat.name} pricing`}
                  className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="font-mono text-lg font-bold text-[#0B1F3A] tabular-nums">
                {formatPkr(cat.monthly_rent)}
              </div>
              {cat.promo_rent && (
                <div className="text-xs text-slate-500">
                  Promo: <span className="font-mono">{formatPkr(cat.promo_rent)}</span> ({cat.promo_active ? 'Active' : 'Inactive'})
                </div>
              )}
              <div className="text-xs text-slate-600 font-mono tabular-nums pt-1 border-t border-slate-200">
                {cat.total_rooms} rooms · {cat.occupied_beds}/{cat.total_beds} occ · {cat.available_beds} free
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Visual Room & Bed Occupancy Grid */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#0B1F3A]">Visual Room &amp; Bed Occupancy Matrix</h2>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="font-medium text-emerald-700">Available</span>
            <span className="font-medium text-[#0B1F3A]">Occupied</span>
            <span className="font-medium text-blue-700">Reserved</span>
            <span className="font-medium text-amber-700">Maintenance</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.rooms || []).map((room) => (
            <div
              key={room.id}
              className={`bg-white border rounded-xl p-5 space-y-3 ${
                room.is_active === 1 ? 'border-slate-200' : 'border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-[#0B1F3A]">
                    Room {room.room_number} — {room.category_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {room.floor} · {formatPkr(room.effective_rent)}/mo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleArchiveRoom(room)}
                  title={room.is_active === 1 ? 'Archive room' : 'Restore room'}
                  className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                {room.beds.map((bed) => (
                  <div
                    key={bed.id}
                    className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      bed.status === 'Occupied'
                        ? 'bg-slate-100 border-slate-300 text-slate-900'
                        : bed.status === 'Reserved'
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : bed.status === 'Maintenance'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold">{bed.bed_number}:</span>{' '}
                      <span className="font-medium">
                        {bed.status === 'Occupied'
                          ? `Occupied (${bed.member_name})`
                          : bed.status === 'Reserved'
                          ? `Reserved (${bed.reservation_ref})`
                          : bed.status}
                      </span>
                    </div>
                    {bed.status !== 'Occupied' && bed.status !== 'Reserved' && (
                      <button
                        type="button"
                        onClick={() => toggleBedMaintenance(bed.id, bed.status)}
                        title="Toggle maintenance status"
                        className="p-1 rounded hover:bg-white/70 shrink-0"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Room Modal */}
      {showAddRoom && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleAddRoom} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Add Hostel Room</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Category</label>
                <select
                  value={newRoom.category_id}
                  onChange={(e) => {
                    const cid = Number(e.target.value);
                    const cat = data?.categories.find((c) => c.id === cid);
                    setNewRoom({
                      ...newRoom,
                      category_id: cid,
                      max_occupancy: cat?.capacity || 2,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(data?.categories || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Room Number *</label>
                <input required value={newRoom.room_number} onChange={(e) => setNewRoom({ ...newRoom, room_number: e.target.value })} placeholder="e.g. 104" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Floor *</label>
                <input required value={newRoom.floor} onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Number of Beds *</label>
                <input type="number" min={1} max={10} required value={newRoom.max_occupancy} onChange={(e) => setNewRoom({ ...newRoom, max_occupancy: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddRoom(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Create Room &amp; Beds</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Category Rent Modal */}
      {editingCat && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleSaveCategory} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Update Pricing — {editingCat.name}</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Standard Monthly Rent (PKR)</label>
                <input type="number" required value={catRent} onChange={(e) => setCatRent(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Promotional Rent (Optional PKR)</label>
                <input type="number" value={catPromoRent} onChange={(e) => setCatPromoRent(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
              </div>
              <label className="flex items-center gap-2 font-medium text-slate-700">
                <input type="checkbox" checked={catPromoActive} onChange={(e) => setCatPromoActive(e.target.checked)} />
                Activate promotional rate on public website
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingCat(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Save Pricing</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
