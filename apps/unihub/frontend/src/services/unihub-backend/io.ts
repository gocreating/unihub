import { API_BASE_URL } from './index';

// ── Types ────────────────────────────────────────────────────────────

export interface FieldInfo {
  column_name: string;
  csv_header: string;
  data_type: string;
  is_pk: boolean;
  is_fk: boolean;
  nullable: boolean;
}

export interface TableInfo {
  content_type_label: string;
  display_name: string;
  fields: FieldInfo[];
}

export interface ChangeRecord {
  pk: string;
  operation: 'create' | 'update' | 'delete';
  before: Record<string, string> | null;
  after: Record<string, string> | null;
  changed_fields: string[];
}

export interface ValidationError {
  row: number;
  column: string | null;
  message: string;
}

export interface ImportPreviewResponse {
  creates: ChangeRecord[];
  updates: ChangeRecord[];
  deletes: ChangeRecord[];
  errors: ValidationError[];
}

export interface ImportConfirmResponse {
  created: number;
  updated: number;
  deleted: number;
}

// ── API calls ────────────────────────────────────────────────────────

export async function listTables(): Promise<TableInfo[]> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/io/tables/`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`listTables failed: ${resp.status}`);
  return resp.json() as Promise<TableInfo[]>;
}

export async function exportTables(tables: string[]): Promise<Blob> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/io/export/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tables }),
  });
  if (!resp.ok) throw new Error(`exportTables failed: ${resp.status}`);
  return resp.blob();
}

export async function importPreview(
  table: string,
  mode: 'upsert' | 'replace',
  csvText: string,
): Promise<ImportPreviewResponse> {
  const body = new URLSearchParams({ table, mode, csv_text: csvText });
  const resp = await fetch(`${API_BASE_URL}/api/v1/io/import/preview/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`importPreview failed: ${resp.status}`);
  return resp.json() as Promise<ImportPreviewResponse>;
}

export async function importConfirm(
  table: string,
  mode: 'upsert' | 'replace',
  csvText: string,
): Promise<ImportConfirmResponse> {
  const body = new URLSearchParams({ table, mode, csv_text: csvText });
  const resp = await fetch(`${API_BASE_URL}/api/v1/io/import/confirm/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`importConfirm failed: ${resp.status}`);
  return resp.json() as Promise<ImportConfirmResponse>;
}
