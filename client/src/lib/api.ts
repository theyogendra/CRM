const TOKEN_KEY = 'dealstack_token';

/** The signed-in user as returned by /api/auth/me. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

export const auth = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
  },
  set(token: string) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public retryable = false) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !url.startsWith('/auth')) {
    auth.clear();
    window.location.href = '/login';
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok && !data) {
    // Vite's dev proxy answers with an empty 5xx when the API process isn't running
    throw new ApiError(res.status, res.status >= 500
      ? 'Cannot reach the API server on port 4000 — start it with "npm run dev" and check that PostgreSQL is running.'
      : res.statusText);
  }
  if (!res.ok) {
    const details = data?.details?.fieldErrors
      ? Object.entries(data.details.fieldErrors as Record<string, string[]>).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')
      : '';
    throw new ApiError(res.status, [data?.error ?? res.statusText, details].filter(Boolean).join(' — '), data?.code, Boolean(data?.retryable));
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: (url: string) => request<void>('DELETE', url),
};
