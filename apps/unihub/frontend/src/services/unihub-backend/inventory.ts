import { API_BASE_URL } from './index';
import type { EntityListParams, OffsetPaginatedResponse } from '@/components/EntityToolbar';

// ── Types ────────────────────────────────────────────────────────────

export type ItemType = 'stockable' | 'consumable';
export type AcquisitionMethod = 'purchase' | 'gift' | 'transfer' | 'found' | 'other' | '';
export type ConstraintType = 'mutual_exclusive' | 'required' | 'weight_limit';

export interface AcquisitionSummary {
  id: string;
  source: string;
  method: AcquisitionMethod;
}

export interface Item {
  id: string;
  name: string;
  item_type: ItemType;
  category: string;
  model: string;
  serial_number: string;
  quantity: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  size: string;
  weight: string | null;
  price: string | null;
  cost: string | null;
  purchase_time: string | null;
  storage_location: string;
  status: string;
  acquisition: string | null;
  acquisition_detail: AcquisitionSummary | null;
  origin_known: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemWrite = Partial<
  Omit<Item, 'id' | 'acquisition_detail' | 'origin_known' | 'created_at' | 'updated_at'>
> & { name: string };

export interface Acquisition {
  id: string;
  source: string;
  method: AcquisitionMethod;
  obtained_at: string | null;
  arrived_at: string | null;
  cost: string | null;
  notes: string;
  items: Item[];
  item_count: number;
  total_item_cost: string;
  has_arrived: boolean;
  created_at: string;
  updated_at: string;
}

export type AcquisitionWrite = Partial<
  Pick<Acquisition, 'source' | 'method' | 'obtained_at' | 'arrived_at' | 'cost' | 'notes'>
> & { item_ids?: string[] };

export interface Scenario {
  id: string;
  name: string;
  notes: string;
  item_count: number;
  prepared_count: number;
  outstanding_count: number;
  complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContainerRef {
  id: string;
  item_name: string;
}

export interface ScenarioItem {
  id: string;
  item: Item;
  container: ContainerRef | null;
  required_quantity: string;
  prepared: boolean;
  notes: string;
  shortfall: string | null;
  created_at: string;
}

export interface ScenarioItemWrite {
  item_id?: string;
  container_id?: string | null;
  required_quantity?: string;
  prepared?: boolean;
  notes?: string;
}

export interface Constraint {
  id: string;
  name: string;
  constraint_type: ConstraintType;
  items: { id: string; name: string }[];
  target_category: string;
  limit_value: string | null;
  created_at: string;
}

export interface ConstraintWrite {
  name?: string;
  constraint_type: ConstraintType;
  item_ids?: string[];
  target_category?: string;
  limit_value?: string | null;
}

export interface ChecklistLine {
  id: string;
  item: { id: string; name: string; item_type: ItemType };
  required_quantity: string;
  prepared: boolean;
  container: ContainerRef | null;
  shortfall: string | null;
}

export interface ChecklistViolation {
  constraint_id: string;
  type: ConstraintType;
  message: string;
  offending_item_ids?: string[];
  overage?: string;
}

export interface Checklist {
  scenario_id: string;
  progress: {
    prepared_count: number;
    outstanding_count: number;
    total: number;
    complete: boolean;
  };
  lines: ChecklistLine[];
  violations: ChecklistViolation[];
}

export interface ItemReferenceError {
  reference_summary: { acquisitions: number; scenarios: number; containers: number };
  message: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match?.[1] ?? '';
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

function buildEntityListQs(params?: EntityListParams): string {
  if (!params) return '';
  const p = new URLSearchParams();
  if (params.filters) p.set('filters', JSON.stringify(params.filters));
  if (params.ordering) p.set('ordering', params.ordering);
  if (params.limit !== undefined) p.set('limit', String(params.limit));
  if (params.offset !== undefined) p.set('offset', String(params.offset));
  const knownKeys = new Set(['filters', 'ordering', 'limit', 'offset', 'cursor']);
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (!knownKeys.has(k) && v !== undefined) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

const BASE = '/api/v1/inventory';

// ── Items ────────────────────────────────────────────────────────────

export function listItems(
  params?: EntityListParams & { archived?: boolean },
): Promise<OffsetPaginatedResponse<Item>> {
  return fetchJson<OffsetPaginatedResponse<Item>>(`${BASE}/items/${buildEntityListQs(params)}`);
}

export function getItem(id: string): Promise<Item> {
  return fetchJson<Item>(`${BASE}/items/${id}/`);
}

export function createItem(data: ItemWrite): Promise<Item> {
  return fetchJson<Item>(`${BASE}/items/`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateItem(id: string, data: Partial<ItemWrite>): Promise<Item> {
  return fetchJson<Item>(`${BASE}/items/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteItem(id: string, confirm = false): Promise<void> {
  const qs = confirm ? '?confirm=true' : '';
  return fetchJson<void>(`${BASE}/items/${id}/${qs}`, { method: 'DELETE' });
}

// ── Acquisitions ─────────────────────────────────────────────────────

export function listAcquisitions(
  params?: EntityListParams,
): Promise<OffsetPaginatedResponse<Acquisition>> {
  return fetchJson<OffsetPaginatedResponse<Acquisition>>(
    `${BASE}/acquisitions/${buildEntityListQs(params)}`,
  );
}

export function getAcquisition(id: string): Promise<Acquisition> {
  return fetchJson<Acquisition>(`${BASE}/acquisitions/${id}/`);
}

export function createAcquisition(data: AcquisitionWrite): Promise<Acquisition> {
  return fetchJson<Acquisition>(`${BASE}/acquisitions/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAcquisition(id: string, data: AcquisitionWrite): Promise<Acquisition> {
  return fetchJson<Acquisition>(`${BASE}/acquisitions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteAcquisition(id: string): Promise<void> {
  return fetchJson<void>(`${BASE}/acquisitions/${id}/`, { method: 'DELETE' });
}

// ── Scenarios ────────────────────────────────────────────────────────

export function listScenarios(
  params?: EntityListParams,
): Promise<OffsetPaginatedResponse<Scenario>> {
  return fetchJson<OffsetPaginatedResponse<Scenario>>(
    `${BASE}/scenarios/${buildEntityListQs(params)}`,
  );
}

export function getScenario(id: string): Promise<Scenario> {
  return fetchJson<Scenario>(`${BASE}/scenarios/${id}/`);
}

export function createScenario(data: Pick<Scenario, 'name'> & { notes?: string }): Promise<Scenario> {
  return fetchJson<Scenario>(`${BASE}/scenarios/`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateScenario(
  id: string,
  data: Partial<Pick<Scenario, 'name' | 'notes'>>,
): Promise<Scenario> {
  return fetchJson<Scenario>(`${BASE}/scenarios/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteScenario(id: string): Promise<void> {
  return fetchJson<void>(`${BASE}/scenarios/${id}/`, { method: 'DELETE' });
}

export function getChecklist(scenarioId: string): Promise<Checklist> {
  return fetchJson<Checklist>(`${BASE}/scenarios/${scenarioId}/checklist/`);
}

// ── Scenario items (checklist lines / containment) ────────────────────

export function listScenarioItems(scenarioId: string): Promise<ScenarioItem[]> {
  return fetchJson<ScenarioItem[]>(`${BASE}/scenarios/${scenarioId}/items/`);
}

export function addScenarioItem(scenarioId: string, data: ScenarioItemWrite): Promise<ScenarioItem> {
  return fetchJson<ScenarioItem>(`${BASE}/scenarios/${scenarioId}/items/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateScenarioItem(
  scenarioId: string,
  lineId: string,
  data: ScenarioItemWrite,
): Promise<ScenarioItem> {
  return fetchJson<ScenarioItem>(`${BASE}/scenarios/${scenarioId}/items/${lineId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteScenarioItem(scenarioId: string, lineId: string): Promise<void> {
  return fetchJson<void>(`${BASE}/scenarios/${scenarioId}/items/${lineId}/`, { method: 'DELETE' });
}

// ── Constraints ──────────────────────────────────────────────────────

export function listConstraints(scenarioId: string): Promise<Constraint[]> {
  return fetchJson<Constraint[]>(`${BASE}/scenarios/${scenarioId}/constraints/`);
}

export function createConstraint(scenarioId: string, data: ConstraintWrite): Promise<Constraint> {
  return fetchJson<Constraint>(`${BASE}/scenarios/${scenarioId}/constraints/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteConstraint(scenarioId: string, constraintId: string): Promise<void> {
  return fetchJson<void>(`${BASE}/scenarios/${scenarioId}/constraints/${constraintId}/`, {
    method: 'DELETE',
  });
}
