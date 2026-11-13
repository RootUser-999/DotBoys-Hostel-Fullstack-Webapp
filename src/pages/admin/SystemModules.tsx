import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Save } from 'lucide-react';
import { apiFetch, getAuthToken } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import { downloadSummaryReportPdf } from '../../lib/pdf';

export function ReportsAdminModule() {
  const [fromMonth, setFromMonth] = useState('2026-01');
  const [toMonth, setToMonth] = useState('2026-12');

  const { data, isLoading } = useQuery<{
    financialByMonth: Array<{
      billing_month: string;
      total_invoices: number;
      total_billed: number;
      total_collected: number;
      total_outstanding: number;
      paid_count: number;
      partial_count: number;
      unpaid_count: number;
    }>;
    revenueByCategory: Array<{
      category_name: string;
      expected: number;
      collected: number;
      outstanding: number;
    }>;
    occupancyByCategory: Array<{
      name: string;
      total_rooms: number;
      total_beds: number;
      occupied_beds: number;
      available_beds: number;
    }>;
    residentsDetail: Array<{
      member_code: string;
      full_name: string;
      occupation: string;
      monthly_rent: number;
      status: string;
      category_name: string;
      room_number: string | null;
    }>;
  }>({
    queryKey: ['admin-reports', fromMonth, toMonth],
    queryFn: () => apiFetch(`/api/admin/reports?from_month=${fromMonth}&to_month=${toMonth}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const headers = ['Month', 'Invoices', 'Billed PKR', 'Collected PKR', 'Outstanding PKR', 'Paid', 'Partial', 'Unpaid/Overdue'];
    const lines = [
      headers.join(','),
      ...data.financialByMonth.map((r) =>
        [r.billing_month, r.total_invoices, r.total_billed, r.total_collected, r.total_outstanding, r.paid_count, r.partial_count, r.unpaid_count].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dotboys-financial-report-${fromMonth}-to-${toMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!data) return;
    downloadSummaryReportPdf({
      title: `Financial & Occupancy Report (${fromMonth} to ${toMonth})`,
      headers: ['Month', 'Invoices', 'Expected PKR', 'Collected PKR', 'Outstanding PKR', 'Paid', 'Open'],
      rows: data.financialByMonth.map((r) => [
        r.billing_month,
        r.total_invoices,
        r.total_billed,
        r.total_collected,
        r.total_outstanding,
        r.paid_count,
        r.partial_count + r.unpaid_count,
      ]),
      filename: `dotboys-report-${fromMonth}-${toMonth}.pdf`,
    });
  };

  if (isLoading || !data) return <div className="p-8 text-sm text-slate-500">Generating reports...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <label className="font-medium text-slate-600">From:</label>
          <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded-lg" />
          <label className="font-medium text-slate-600">To:</label>
          <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button type="button" onClick={exportPdf} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52]">
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-[#0B1F3A]">Monthly Financial Report</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Month</th>
                <th className="py-2.5 px-4 text-right">Billed</th>
                <th className="py-2.5 px-4 text-right">Collected</th>
                <th className="py-2.5 px-4 text-right">Outstanding</th>
                <th className="py-2.5 px-4 text-right">Paid / Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.financialByMonth.map((r) => (
                <tr key={r.billing_month}>
                  <td className="py-2.5 px-4 font-mono font-semibold">{r.billing_month}</td>
                  <td className="py-2.5 px-4 font-mono text-right tabular-nums">{formatPkr(r.total_billed)}</td>
                  <td className="py-2.5 px-4 font-mono text-right text-emerald-700 tabular-nums">{formatPkr(r.total_collected)}</td>
                  <td className="py-2.5 px-4 font-mono text-right text-red-700 tabular-nums">{formatPkr(r.total_outstanding)}</td>
                  <td className="py-2.5 px-4 font-mono text-right tabular-nums">{r.paid_count} / {r.partial_count + r.unpaid_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-[#0B1F3A]">Occupancy Report</div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Rooms</th>
                <th className="py-2.5 px-4 text-right">Occupied / Total</th>
                <th className="py-2.5 px-4 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.occupancyByCategory.map((c) => (
                <tr key={c.name}>
                  <td className="py-2.5 px-4 font-semibold">{c.name}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{c.total_rooms}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{c.occupied_beds} / {c.total_beds}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {c.total_beds > 0 ? Math.round((c.occupied_beds / c.total_beds) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-[#0B1F3A]">Revenue by Room Category</div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Expected</th>
                <th className="py-2.5 px-4 text-right">Collected</th>
                <th className="py-2.5 px-4 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.revenueByCategory.map((c) => (
                <tr key={c.category_name}>
                  <td className="py-2.5 px-4 font-semibold">{c.category_name}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatPkr(c.expected)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-700 tabular-nums">{formatPkr(c.collected)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-red-700 tabular-nums">{formatPkr(c.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function StaffAdminModule() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    users: Array<{
      id: number;
      username: string;
      full_name: string;
      email: string;
      role_name: string;
      is_active: number;
      last_login_at: string | null;
    }>;
    roles: Array<{ id: number; name: string; description: string }>;
  }>({
    queryKey: ['admin-staff'],
    queryFn: () => apiFetch('/api/admin/staff'),
  });

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(2);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const createStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    try {
      await apiFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({ username, full_name: fullName, password, role_id: roleId }),
      });
      setUsername('');
      setFullName('');
      setPassword('');
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to create staff account');
    }
  };

  const toggleActive = async (id: number, current: number) => {
    setErrMsg(null);
    try {
      await apiFetch(`/api/admin/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: current === 1 ? 0 : 1 }),
      });
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Update failed');
    }
  };

  return (
    <div className="space-y-6">
      {errMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errMsg}</div>}
      <form onSubmit={createStaff} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-[#0B1F3A]">Create Staff Administrator</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input required placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <select value={roleId} onChange={(e) => setRoleId(Number(e.target.value))} className="px-3 py-2 border border-slate-300 rounded-lg bg-white">
            {(data?.roles || []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <input type="password" required minLength={6} placeholder="Temporary Password" value={password} onChange={(e) => setPassword(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
        </div>
        <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
          <Plus className="h-3.5 w-3.5" /> Add Staff Account
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">User</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Last Login</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.users || []).map((u) => (
              <tr key={u.id}>
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900">{u.full_name}</div>
                  <div className="font-mono text-slate-500">@{u.username}</div>
                </td>
                <td className="py-3 px-4 font-medium">{u.role_name}</td>
                <td className="py-3 px-4 font-mono text-slate-500">{u.last_login_at || 'Never'}</td>
                <td className="py-3 px-4 font-semibold">{u.is_active === 1 ? 'Active' : 'Disabled'}</td>
                <td className="py-3 px-4 text-right">
                  <button type="button" onClick={() => toggleActive(u.id, u.is_active)} className="px-3 py-1.5 border border-slate-200 rounded-md">
                    {u.is_active === 1 ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsAdminModule() {
  const { data } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch('/api/admin/settings'),
  });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) setSettings(data.settings);
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const downloadBackup = async () => {
    const token = getAuthToken();
    const res = await fetch('/api/admin/backup/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dotboys-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0B1F3A]">Hostel Operations &amp; Billing Settings</h2>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
            <Save className="h-3.5 w-3.5" /> Save Settings
          </button>
        </div>
        {saved && <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800">Settings saved.</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(settings).map(([k, v]) => (
            <div key={k}>
              <label className="block font-semibold text-slate-700 mb-1">{k.replace(/_/g, ' ')}</label>
              <input value={v} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
            </div>
          ))}
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#0B1F3A]">Database Backup Export</h3>
          <p className="text-xs text-slate-500 mt-0.5">Download a complete JSON snapshot of residents, rooms, invoices, payments, and CMS configuration.</p>
        </div>
        <button type="button" onClick={downloadBackup} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
          <Download className="h-3.5 w-3.5" /> Export Backup
        </button>
      </div>
    </div>
  );
}

export function ActivityLogsModule() {
  const { data, isLoading } = useQuery<{
    items: Array<{
      id: number;
      username: string;
      action: string;
      entity_type: string;
      entity_id: string;
      details_json: string;
      created_at: string;
    }>;
  }>({
    queryKey: ['admin-logs'],
    queryFn: () => apiFetch('/api/admin/audit-logs'),
  });

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading audit trail...</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-[#0B1F3A]">System &amp; Financial Audit Logs</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2.5 px-4">Timestamp</th>
              <th className="py-2.5 px-4">Actor</th>
              <th className="py-2.5 px-4">Action</th>
              <th className="py-2.5 px-4">Entity</th>
              <th className="py-2.5 px-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.items || []).map((l) => (
              <tr key={l.id}>
                <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{l.created_at}</td>
                <td className="py-2.5 px-4 font-semibold">{l.username}</td>
                <td className="py-2.5 px-4 font-mono text-[#0B1F3A]">{l.action}</td>
                <td className="py-2.5 px-4">{l.entity_type} #{l.entity_id}</td>
                <td className="py-2.5 px-4 font-mono text-slate-500 max-w-xs truncate">{l.details_json}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
