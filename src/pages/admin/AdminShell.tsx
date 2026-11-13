import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BedDouble,
  Grid,
  CreditCard,
  MessageSquare,
  Utensils,
  Sparkles,
  Image,
  Megaphone,
  FileEdit,
  BarChart3,
  UserCog,
  Settings,
  History,
  Bell,
  Search,
  LogOut,
  Menu,
  X,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Link } from '../../lib/router';
import { BrandLogoMark } from '../../components/BrandMark';
import type { LoggedInUser } from './AdminAuth';

export type AdminModuleKey =
  | 'dashboard'
  | 'bookings'
  | 'members'
  | 'rooms'
  | 'beds'
  | 'payments'
  | 'whatsapp'
  | 'mess'
  | 'facilities'
  | 'gallery'
  | 'announcements'
  | 'cms'
  | 'reports'
  | 'staff'
  | 'settings'
  | 'logs';

interface NavDef {
  key: AdminModuleKey;
  label: string;
  perm: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ADMIN_NAV_ITEMS: NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', perm: 'dashboard.view', icon: LayoutDashboard },
  { key: 'bookings', label: 'Bookings & Inquiries', perm: 'bookings.manage', icon: CalendarCheck },
  { key: 'members', label: 'Hostel Members', perm: 'members.view', icon: Users },
  { key: 'rooms', label: 'Room Management', perm: 'rooms.manage', icon: BedDouble },
  { key: 'beds', label: 'Bed Allocation', perm: 'rooms.manage', icon: Grid },
  { key: 'payments', label: 'Payments & Billing', perm: 'payments.view', icon: CreditCard },
  { key: 'whatsapp', label: 'WhatsApp Notifications', perm: 'whatsapp.manage', icon: MessageSquare },
  { key: 'mess', label: 'Mess Menu', perm: 'content.manage', icon: Utensils },
  { key: 'facilities', label: 'Facilities', perm: 'content.manage', icon: Sparkles },
  { key: 'gallery', label: 'Gallery & Media', perm: 'content.manage', icon: Image },
  { key: 'announcements', label: 'Announcements', perm: 'content.manage', icon: Megaphone },
  { key: 'cms', label: 'Website Content', perm: 'content.manage', icon: FileEdit },
  { key: 'reports', label: 'Reports & Analytics', perm: 'reports.view', icon: BarChart3 },
  { key: 'staff', label: 'Staff & Permissions', perm: 'staff.manage', icon: UserCog },
  { key: 'settings', label: 'Settings', perm: 'settings.manage', icon: Settings },
  { key: 'logs', label: 'Activity Logs', perm: 'dashboard.view', icon: History },
];

export function AdminShell({
  user,
  activeModule,
  onSelectModule,
  onLogout,
  children,
}: {
  user: LoggedInUser;
  activeModule: AdminModuleKey;
  onSelectModule: (key: AdminModuleKey) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const allowedItems = ADMIN_NAV_ITEMS.filter(
    (item) => user.role_slug === 'super_admin' || user.permissions.includes(item.perm)
  );

  const { data: notifData } = useQuery<{
    items: Array<{
      id: number;
      title: string;
      message: string;
      category: string;
      link_module: AdminModuleKey;
      is_read: number;
      created_at: string;
    }>;
  }>({
    queryKey: ['admin-notifications'],
    queryFn: () => apiFetch('/api/admin/notifications'),
    refetchInterval: 30_000,
  });

  const { data: searchResults } = useQuery<{
    members: Array<{ id: number; member_code: string; full_name: string; phone: string }>;
    rooms: Array<{ id: number; room_number: string; category_name: string }>;
    reservations: Array<{ id: number; reference_code: string; full_name: string; status: string }>;
    payments: Array<{ id: number; reference_id: string; amount: number; full_name: string }>;
  }>({
    queryKey: ['admin-search', searchQuery],
    queryFn: () => apiFetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.trim().length >= 2,
  });

  const notifications = notifData?.items || [];
  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  const markAllRead = async () => {
    await apiFetch('/api/admin/notifications/all/read', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['admin-notifications'] });
  };

  const activeDef = ADMIN_NAV_ITEMS.find((i) => i.key === activeModule) || ADMIN_NAV_ITEMS[0];

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-slate-200">
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
        {!collapsed && <BrandLogoMark dark />}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:inline-flex p-2 rounded-lg text-slate-300 hover:bg-white/10"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-0.5">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelectModule(item.key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
                active
                  ? 'bg-[#C9972C] text-[#0B1F3A] font-semibold'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-2.5 border-t border-white/10 space-y-1 shrink-0">
        {!collapsed && (
          <div className="px-2 py-1">
            <div className="text-xs font-semibold text-white truncate">{user.full_name}</div>
            <div className="text-[11px] text-slate-400 truncate">{user.role_name}</div>
          </div>
        )}
        <Link
          to="/"
          className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          {!collapsed && <span>View Public Site</span>}
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium text-red-300 hover:bg-red-500/15"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 h-full">{SidebarContent}</div>
          <div className="flex-1 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open admin menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">DOT BOYS HOSTEL · Admin</div>
              <h1 className="text-base sm:text-lg font-bold text-[#0B1F3A] truncate">{activeDef.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search */}
            <div className="relative hidden md:block w-72">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search members, rooms, bookings..."
                aria-label="Global admin search"
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
              />
              {searchQuery.trim().length >= 2 && searchResults && (
                <div className="absolute right-0 mt-1.5 w-96 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-2 z-50 max-h-80 overflow-y-auto text-xs">
                  {searchResults.members.map((m) => (
                    <button
                      key={`m-${m.id}`}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        onSelectModule('members');
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 flex justify-between"
                    >
                      <span className="font-semibold text-[#0B1F3A]">{m.full_name}</span>
                      <span className="text-slate-500 font-mono">{m.member_code}</span>
                    </button>
                  ))}
                  {searchResults.reservations.map((r) => (
                    <button
                      key={`res-${r.id}`}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        onSelectModule('bookings');
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 flex justify-between"
                    >
                      <span className="font-semibold text-slate-800">{r.full_name}</span>
                      <span className="text-slate-500 font-mono">{r.reference_code}</span>
                    </button>
                  ))}
                  {searchResults.rooms.map((rm) => (
                    <button
                      key={`rm-${rm.id}`}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        onSelectModule('rooms');
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 flex justify-between"
                    >
                      <span className="font-semibold text-slate-800">Room {rm.room_number}</span>
                      <span className="text-slate-500">{rm.category_name}</span>
                    </button>
                  ))}
                  {searchResults.members.length === 0 &&
                    searchResults.reservations.length === 0 &&
                    searchResults.rooms.length === 0 && (
                      <div className="text-slate-500 py-2 text-center">No matching records found.</div>
                    )}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Admin notifications"
                className="relative p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0B1F3A]">Notifications</span>
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs font-semibold text-[#0B1F3A] hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">No notifications yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onSelectModule(n.link_module || 'dashboard');
                          }}
                          className={`w-full text-left p-3.5 hover:bg-slate-50 space-y-1 ${
                            n.is_read === 0 ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          <div className="text-xs font-bold text-[#0B1F3A]">{n.title}</div>
                          <div className="text-xs text-slate-600">{n.message}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">{children}</main>
      </div>
    </div>
  );
}
