import React, { useState } from 'react';
import { Lock, ArrowLeft, ShieldAlert } from 'lucide-react';
import { apiFetch, setAuthToken } from '../../lib/api';
import { Link, useRouter } from '../../lib/router';
import { BrandLogoMark } from '../../components/BrandMark';

export interface LoggedInUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role_slug: string;
  role_name: string;
  must_change_password: boolean;
  permissions: string[];
}

export function AdminLoginPage({ onSuccess }: { onSuccess: (u: LoggedInUser) => void }) {
  const { navigate } = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: LoggedInUser }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuthToken(res.token);
      onSuccess(res.user);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <BrandLogoMark />
          <Link to="/" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#0B1F3A]">
            <ArrowLeft className="h-3.5 w-3.5" /> Public Site
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Administration Sign In</h1>
          <p className="text-sm text-slate-600 mt-1">
            Authorized hostel staff access only. All sessions and actions are logged.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-username" className="block text-sm font-medium text-slate-700 mb-1">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#132D52] disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <Lock className="h-4 w-4" />
            {loading ? 'Signing In...' : 'Sign In to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ForcePasswordChangeScreen({
  user,
  onUpdated,
  onLogout,
}: {
  user: LoggedInUser;
  onUpdated: (u: LoggedInUser) => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ user: LoggedInUser }>('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      onUpdated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">Update Temporary Password</h1>
            <p className="text-sm text-slate-600 mt-1">
              Signed in as <span className="font-semibold">{user.username}</span>. For security, you must set a new private password before accessing resident and financial records.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fp-cur" className="block text-sm font-medium text-slate-700 mb-1">
              Current Password
            </label>
            <input
              id="fp-cur"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="fp-new" className="block text-sm font-medium text-slate-700 mb-1">
              New Password (min 6 characters)
            </label>
            <input
              id="fp-new"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="fp-conf" className="block text-sm font-medium text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              id="fp-conf"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#132D52] disabled:opacity-60"
            >
              {saving ? 'Updating...' : 'Save Password & Continue'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2.5 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
