import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
});

let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return sessionStorage.getItem('dotboys_session_token');
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem('dotboys_session_token', token);
    else sessionStorage.removeItem('dotboys_session_token');
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit & { isFormData?: boolean }
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options?.headers || {});
  if (!options?.isFormData && !headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Invalid server response' };
  }

  if (!res.ok) {
    const errMsg =
      (data as { error?: string })?.error || `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}
