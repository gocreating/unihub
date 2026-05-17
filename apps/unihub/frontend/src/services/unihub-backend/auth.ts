import { API_BASE_URL } from './index';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail ?? 'Request failed'), { status: resp.status, body });
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match?.[1] ?? '';
}

export async function login(username: string, password: string): Promise<AuthUser> {
  return fetchJson<AuthUser>('/api/v1/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  return fetchJson<void>('/api/v1/auth/logout/', { method: 'POST' });
}

export async function getMe(): Promise<AuthUser> {
  return fetchJson<AuthUser>('/api/v1/auth/me/');
}
