import React, { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { apiFetch, getAuthToken, queryClient, setAuthToken } from './lib/api';
import { RouterProvider, useRouter } from './lib/router';
import { HomePage } from './pages/public/HomePage';
import { RoomsPage, RoomDetailPage } from './pages/public/RoomsPages';
import {
  AboutPage,
  BookPage,
  ContactPage,
  FacilitiesPage,
  GalleryPage,
  LegalPage,
  MessMenuPage,
} from './pages/public/InfoPages';
import {
  AdminLoginPage,
  ForcePasswordChangeScreen,
  type LoggedInUser,
} from './pages/admin/AdminAuth';
import { AdminShell, type AdminModuleKey } from './pages/admin/AdminShell';
import { OverviewModule } from './pages/admin/OverviewModule';
import { BookingsModule } from './pages/admin/BookingsModule';
import { MembersModule } from './pages/admin/MembersModule';
import { RoomsModule } from './pages/admin/RoomsModule';
import { PaymentsModule } from './pages/admin/PaymentsModule';
import { WhatsAppModule } from './pages/admin/WhatsAppModule';
import {
  AnnouncementsAdminModule,
  CmsAdminModule,
  FacilitiesAdminModule,
  GalleryAdminModule,
  MessMenuAdminModule,
} from './pages/admin/ContentModules';
import {
  ActivityLogsModule,
  ReportsAdminModule,
  SettingsAdminModule,
  StaffAdminModule,
} from './pages/admin/SystemModules';

function AdminPortal({
  user,
  setUser,
}: {
  user: LoggedInUser | null;
  setUser: (u: LoggedInUser | null) => void;
}) {
  const { pathname, navigate } = useRouter();
  const [checking, setChecking] = useState(!user);
  const [activeModule, setActiveModule] = useState<AdminModuleKey>('dashboard');

  useEffect(() => {
    if (user) {
      setChecking(false);
      return;
    }
    if (pathname === '/admin/login' && !getAuthToken()) {
      setChecking(false);
      return;
    }
    apiFetch<{ user: LoggedInUser }>('/api/admin/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [user, setUser, pathname]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    navigate('/admin/login');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-600">
        Verifying administrator session...
      </div>
    );
  }

  if (!user || pathname === '/admin/login') {
    if (user && pathname === '/admin/login') {
      navigate('/admin/dashboard');
      return null;
    }
    return <AdminLoginPage onSuccess={(u) => setUser(u)} />;
  }

  if (user.must_change_password) {
    return (
      <ForcePasswordChangeScreen
        user={user}
        onUpdated={(u) => setUser(u)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <AdminShell
      user={user}
      activeModule={activeModule}
      onSelectModule={setActiveModule}
      onLogout={handleLogout}
    >
      {activeModule === 'dashboard' && <OverviewModule onNavigate={setActiveModule} />}
      {activeModule === 'bookings' && <BookingsModule />}
      {activeModule === 'members' && <MembersModule />}
      {(activeModule === 'rooms' || activeModule === 'beds') && <RoomsModule />}
      {activeModule === 'payments' && <PaymentsModule />}
      {activeModule === 'whatsapp' && <WhatsAppModule />}
      {activeModule === 'mess' && <MessMenuAdminModule />}
      {activeModule === 'facilities' && <FacilitiesAdminModule />}
      {activeModule === 'gallery' && <GalleryAdminModule />}
      {activeModule === 'announcements' && <AnnouncementsAdminModule />}
      {activeModule === 'cms' && <CmsAdminModule />}
      {activeModule === 'reports' && <ReportsAdminModule />}
      {activeModule === 'staff' && <StaffAdminModule />}
      {activeModule === 'settings' && <SettingsAdminModule />}
      {activeModule === 'logs' && <ActivityLogsModule />}
    </AdminShell>
  );
}

function AppRoutes() {
  const { pathname } = useRouter();
  const [adminUser, setAdminUser] = useState<LoggedInUser | null>(null);

  if (pathname.startsWith('/admin')) {
    return <AdminPortal user={adminUser} setUser={setAdminUser} />;
  }

  if (pathname === '/' || pathname === '') return <HomePage />;
  if (pathname === '/about') return <AboutPage />;
  if (pathname === '/rooms') return <RoomsPage />;
  if (pathname.startsWith('/rooms/')) {
    const slug = pathname.replace('/rooms/', '').split('/')[0];
    return <RoomDetailPage slug={slug} />;
  }
  if (pathname === '/facilities') return <FacilitiesPage />;
  if (pathname === '/mess-menu') return <MessMenuPage />;
  if (pathname === '/gallery') return <GalleryPage />;
  if (pathname === '/contact') return <ContactPage />;
  if (pathname === '/book') return <BookPage />;
  if (pathname === '/legal') return <LegalPage />;

  return <HomePage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider>
        <AppRoutes />
      </RouterProvider>
    </QueryClientProvider>
  );
}
