/**
 * API client.
 * - The access token lives only in memory (never localStorage).
 * - The refresh token is an HTTP-only cookie; refresh calls send the CSRF double-submit header.
 * - A 401 triggers one silent refresh (shared between concurrent requests), then a retry.
 */

const BASE = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[] | unknown,
  ) {
    super(message);
  }
  /** Field errors from a 422 response, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as { path: string; message: string }[]).filter((d) => d?.path).map((d) => [d.path, d.message]));
  }
}

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
  onExpired: (fn: () => void) => {
    onSessionExpired = fn;
  },
};

export const orgStore = {
  get: () => {
    try {
      return localStorage.getItem('sprasa-org');
    } catch {
      return null;
    }
  },
  set: (id: string | null) => {
    try {
      if (id) localStorage.setItem('sprasa-org', id);
      else localStorage.removeItem('sprasa-org');
    } catch {
      /* storage unavailable */
    }
  },
};

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];
}

async function ensureCsrf() {
  if (!readCookie('sprasa_csrf')) await fetch(`${BASE}/auth/csrf`, { credentials: 'include' });
  return readCookie('sprasa_csrf') ?? '';
}

export async function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const csrf = await ensureCsrf();
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
      if (!res.ok) return null;
      const body = await res.json();
      accessToken = body.data.accessToken;
      return accessToken;
    } catch {
      return null;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, query?: Query) {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

interface RequestOptions {
  method?: string;
  query?: Query;
  body?: unknown;
  /** Send multipart form data instead of JSON. */
  form?: FormData;
  headers?: Record<string, string>;
  csrf?: boolean;
  raw?: boolean;
}

async function send(path: string, opts: RequestOptions, retry = true): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const org = orgStore.get();
  if (org) headers['X-Organisation-Id'] = org;
  if (opts.csrf) headers['X-CSRF-Token'] = await ensureCsrf();
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body, credentials: 'include' });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const token = await refreshSession();
    if (token) return send(path, opts, false);
    onSessionExpired?.();
  }
  return res;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const b = await res.json();
    return new ApiError(res.status, b.code ?? 'ERROR', b.message ?? res.statusText, b.details);
  } catch {
    return new ApiError(res.status, 'NETWORK', res.status === 0 ? 'Cannot reach the server' : res.statusText || 'Request failed');
  }
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, opts);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) throw await parseError(res);
  if (opts.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const api = {
  get: <T>(path: string, query?: Query) => request<{ data: T }>(path, { query }).then((r) => r.data),
  list: <T>(path: string, query?: Query) => request<Paginated<T> & { meta?: Record<string, unknown> }>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<{ data: T; message?: string }>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<{ data: T; message?: string }>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<{ data: T; message?: string }>(path, { method: 'PATCH', body }),
  del: (path: string) => request<{ message?: string }>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<{ data: T; message?: string }>(path, { method: 'POST', form }),
};

/** Download a protected file (export, payslip, document) with the auth header, then save it. */
export async function download(path: string, query?: Query, fallbackName = 'download') {
  const res = await request<Response>(path, { query, raw: true });
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fetch a protected file as an object URL (for previews and images). Caller revokes it. */
export async function objectUrl(path: string, query?: Query) {
  const res = await request<Response>(path, { query, raw: true });
  return URL.createObjectURL(await res.blob());
}
