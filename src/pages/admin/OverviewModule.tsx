import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import type { AdminModuleKey } from './AdminShell';

interface DashboardData {
  billingMonth: string;
  metrics: {
    activeMembersCount: number;
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    reservedBeds: number;
    availableBeds: number;
    pendingReservations: number;
    expectedRevenue: number;
    collectedRevenue: number;
    outstandingAmount: number;
    overdueCount: number;
    paidCount: number;
  };
  categoryOccupancy: Array<{
    name: string;
    total_beds: number;
    occupied_beds: number;
    reserved_beds: number;
    available_beds: number;
  }>;
  monthlySeries: Array<{ billing_month: string; expected: number; collected: number }>;
  recentBookings: Array<{
    id: number;
    reference_code: string;
    full_name: string;
    category_name: string;
    status: string;
    preferred_move_in: string;
  }>;
  recentPayments: Array<{
    id: number;
    member_name: string;
    amount: number;
    payment_date: string;
    payment_method: string;
  }>;
  overdueAlerts: Array<{
    invoice_id: number;
    member_id: number;
    full_name: string;
    phone: string;
    remaining_amount: number;
    due_date: string;
    billing_month: string;
  }>;
  upcomingCheckouts: Array<{
    id: number;
    member_code: string;
    full_name: string;
    expected_leaving_date: string;
    status: string;
  }>;
}

export function OverviewModule({ onNavigate }: { onNavigate: (mod: AdminModuleKey) => void }) {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch('/api/admin/dashboard'),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        Failed to load dashboard metrics.
      </div>
    );
  }

  const { metrics, categoryOccupancy, monthlySeries, recentBookings, recentPayments, overdueAlerts, upcomingCheckouts } =
    data;

  const maxRev = Math.max(1, ...monthlySeries.map((m) => m.expected));

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Active Residents</div>
          <div className="font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums mt-1">
            {metrics.activeMembersCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">{metrics.totalRooms} active rooms</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Bed Inventory</div>
          <div className="font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums mt-1">
            {metrics.occupiedBeds} / {metrics.totalBeds} Occupied
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-1 tabular-nums">
            {metrics.availableBeds} available · {metrics.reservedBeds} reserved
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Expected Monthly Rent ({data.billingMonth})</div>
          <div className="font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums mt-1">
            {formatPkr(metrics.expectedRevenue)}
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-1 tabular-nums">
            Collected: {formatPkr(metrics.collectedRevenue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Outstanding &amp; Pending Bookings</div>
          <div className="font-mono text-2xl font-bold text-red-700 tabular-nums mt-1">
            {formatPkr(metrics.outstandingAmount)}
          </div>
          <div className="text-xs text-slate-600 mt-1 tabular-nums">
            {metrics.overdueCount} overdue · {metrics.pendingReservations} pending bookings
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0B1F3A]">Monthly Rent Collection</h2>
              <p className="text-xs text-slate-500">Expected vs Collected (PKR)</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-semibold text-[#0B1F3A] hover:underline"
            >
              Open Billing
            </button>
          </div>
          {monthlySeries.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No billing periods recorded yet.</div>
          ) : (
            <div className="space-y-3 pt-2">
              {monthlySeries.map((m) => {
                const expPct = Math.round((m.expected / maxRev) * 100);
                const colPct = Math.round((m.collected / maxRev) * 100);
                return (
                  <div key={m.billing_month} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-700">{m.billing_month}</span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {formatPkr(m.collected)} / {formatPkr(m.expected)}
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded overflow-hidden relative">
                      <div className="h-full bg-slate-300" style={{ width: `${expPct}%` }} />
                      <div className="h-full bg-[#0B1F3A] absolute top-0 left-0" style={{ width: `${colPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0B1F3A]">Occupancy by Room Category</h2>
              <p className="text-xs text-slate-500">Live bed allocation breakdown</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('rooms')}
              className="text-xs font-semibold text-[#0B1F3A] hover:underline"
            >
              Manage Rooms
            </button>
          </div>
          <div className="space-y-3 pt-2">
            {categoryOccupancy.map((cat) => {
              const total = Math.max(1, cat.total_beds);
              const occPct = Math.round((cat.occupied_beds / total) * 100);
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800">{cat.name}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {cat.occupied_beds}/{cat.total_beds} occupied · {cat.available_beds} free
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-[#C9972C]" style={{ width: `${occPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Operational Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Overdue &amp; Unpaid Alerts</h2>
            <button type="button" onClick={() => onNavigate('payments')} className="text-xs font-semibold text-[#0B1F3A] hover:underline">
              View All
            </button>
          </div>
          {overdueAlerts.length === 0 ? (
            <div className="text-xs text-slate-500 py-4">All active invoices are settled.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {overdueAlerts.slice(0, 5).map((a) => (
                <div key={a.invoice_id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{a.full_name}</div>
                    <div className="text-slate-500 font-mono">Due {a.due_date}</div>
                  </div>
                  <div className="font-mono font-bold text-red-700 tabular-nums shrink-0">
                    {formatPkr(a.remaining_amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Recent Booking Requests</h2>
            <button type="button" onClick={() => onNavigate('bookings')} className="text-xs font-semibold text-[#0B1F3A] hover:underline">
              Review
            </button>
          </div>
          {recentBookings.length === 0 ? (
            <div className="text-xs text-slate-500 py-4">No recent bookings.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentBookings.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{b.full_name}</div>
                    <div className="text-slate-500 truncate">{b.category_name} · {b.reference_code}</div>
                  </div>
                  <span className="font-semibold text-slate-700 shrink-0">{b.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Recent Payments &amp; Checkouts</h2>
            <button type="button" onClick={() => onNavigate('members')} className="text-xs font-semibold text-[#0B1F3A] hover:underline">
              Members
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentPayments.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{p.member_name}</div>
                  <div className="text-slate-500">{p.payment_method} · {p.payment_date}</div>
                </div>
                <div className="font-mono font-bold text-emerald-700 tabular-nums shrink-0">
                  {formatPkr(p.amount)}
                </div>
              </div>
            ))}
            {upcomingCheckouts.map((c) => (
              <div key={`co-${c.id}`} className="py-2 flex items-center justify-between gap-2 text-xs text-amber-800">
                <span className="truncate">Leaving: {c.full_name}</span>
                <span className="font-mono shrink-0">{c.expected_leaving_date || c.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
