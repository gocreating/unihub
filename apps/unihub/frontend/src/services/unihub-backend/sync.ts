import { API_BASE_URL } from './index';

// ── Types ────────────────────────────────────────────────────────────

export interface SyncConfigRead {
  is_configured: boolean;
  repo_url?: string;
  pat?: string;
  last_published_at?: string | null;
  last_published_commit?: string | null;
  last_applied_at?: string | null;
  last_applied_commit?: string | null;
}

export interface SyncConfigWrite {
  repo_url: string;
  pat: string;
}

export interface SyncStatus {
  status: 'in_sync' | 'ahead' | 'behind' | 'diverged' | 'no_remote' | 'error';
  ahead_count: number;
  behind_count: number;
  remote_commit: string | null;
  error_message: string | null;
}

export interface SyncPublishResult {
  status: 'published' | 'up_to_date';
  commit_sha?: string;
  tables_exported?: string[];
}

export interface SyncApplyChange {
  table: string;
  display_name: string;
  added: number;
  modified: number;
  deleted: number;
  rows: unknown[];
}

export interface SyncApplyPreviewResult {
  status: 'up_to_date' | 'has_changes';
  changes?: SyncApplyChange[];
}

export interface SyncApplyConfirmResult {
  status: 'applied';
  results: Array<{ table: string; display_name: string; applied: number }>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match?.[1] ?? '';
}

// ── API calls ────────────────────────────────────────────────────────

export async function getSyncConfig(): Promise<SyncConfigRead> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/config/`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch sync config');
  return res.json() as Promise<SyncConfigRead>;
}

export async function saveSyncConfig(data: SyncConfigWrite): Promise<SyncConfigRead> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/config/`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save sync config');
  return res.json() as Promise<SyncConfigRead>;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/status/`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch sync status');
  return res.json() as Promise<SyncStatus>;
}

export async function publishSync(): Promise<SyncPublishResult> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/publish/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    body: '{}',
  });
  if (res.status === 409) {
    const body = (await res.json()) as { error: string };
    throw Object.assign(new Error('diverged'), { code: body.error });
  }
  if (!res.ok) throw new Error('Publish failed');
  return res.json() as Promise<SyncPublishResult>;
}

export async function forcePublishSync(): Promise<SyncPublishResult> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/force-publish/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    body: '{}',
  });
  if (!res.ok) throw new Error('Force publish failed');
  return res.json() as Promise<SyncPublishResult>;
}

export async function getApplyPreview(): Promise<SyncApplyPreviewResult> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/apply/preview/`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch apply preview');
  return res.json() as Promise<SyncApplyPreviewResult>;
}

export async function confirmApply(): Promise<SyncApplyConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sync/apply/confirm/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    body: '{}',
  });
  if (!res.ok) throw new Error('Apply failed');
  return res.json() as Promise<SyncApplyConfirmResult>;
}
