import { API_BASE_URL } from './index';
import type { EntityListParams, OffsetPaginatedResponse } from '@/components/EntityToolbar';

// ── Types ────────────────────────────────────────────────────────────

export type ItemStatus = 'active' | 'deprecated';
export type ConstraintType = 'mutual_exclusive' | 'required' | 'weight_limit';
export type CostFactorType =
  | 'accumulated'
  | 'shipping'
  | 'discount'
  | 'tax_refund'
  | 'paid_by_other'
  | 'other';
export const COST_FACTOR_TYPES: CostFactorType[] = [
  'accumulated',
  'shipping',
  'discount',
  'tax_refund',
  'paid_by_other',
  'other',
];

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in';
export type WeightUnit = 'g' | 'kg' | 'lb';
export type VolumeUnit = 'mL' | 'L';
export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in'];
export const WEIGHT_UNITS: WeightUnit[] = ['g', 'kg', 'lb'];
export const VOLUME_UNITS: VolumeUnit[] = ['mL', 'L'];

export interface Measurement {
  value: string;
  unit: string;
}

export interface AcquisitionSummary {
  id: string;
  source: string;
  request_time: string | null;
  obtained_at: string | null;
  net_cost: NetCostEntry[];
}

export interface Item {
  id: string;
  name: string;
  quantity: number;
  spec: string;
  remark: string;
  size: string;
  length: Measurement | null;
  width: Measurement | null;
  height: Measurement | null;
  weight: Measurement | null;
  volume: Measurement | null;
  sku_price: string | null;
  sku_price_currency: string;
  total_price: string | null;
  color: string;
  url: string;
  status: ItemStatus;
  deprecate_time: string | null;
  acquisition: AcquisitionSummary | null;
  created_at: string;
  updated_at: string;
}

export interface ItemWrite {
  name: string;
  quantity?: number;
  spec?: string;
  remark?: string;
  size?: string;
  length?: Measurement | null;
  width?: Measurement | null;
  height?: Measurement | null;
  weight?: Measurement | null;
  volume?: Measurement | null;
  sku_price?: string | null;
  sku_price_currency?: string;
  color?: string;
  url?: string;
  deprecate_time?: string | null;
}

export interface CostFactor {
  id: string;
  value: string; // signed decimal
  currency: string;
  type: string; // free-form; CostFactorType values are suggestions
  display_order: number;
}

export interface CostFactorWrite {
  value: string;
  currency?: string;
  type?: string; // free-form; sent in display order (server assigns display_order)
}

/** Per-currency net cost = sum of cost-factor values (value carries its sign). */
export interface NetCostEntry {
  currency: string;
  total: string;
}

export interface Acquisition {
  id: string;
  source: string;
  request_time: string | null;
  obtained_at: string | null;
  remark: string;
  cost_factors: CostFactor[];
  net_cost: NetCostEntry[];
  items: Item[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface AcquisitionWrite {
  source?: string;
  request_time?: string | null;
  obtained_at?: string | null;
  remark?: string;
  cost_factors?: CostFactorWrite[];
  items?: ItemWrite[];
}

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
  limit_value: string | null;
  created_at: string;
}

export interface ConstraintWrite {
  name?: string;
  constraint_type: ConstraintType;
  item_ids?: string[];
  limit_value?: string | null;
}

export interface ChecklistLine {
  id: string;
  item: { id: string; name: string };
  required_quantity: string;
  prepared: boolean;
  container: ContainerRef | null;
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
  progress: { prepared_count: number; outstanding_count: number; total: number; complete: boolean };
  lines: ChecklistLine[];
  violations: ChecklistViolation[];
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

// ── Items (read/edit only — creation via acquisitions) ────────────────

export function listItems(params?: EntityListParams): Promise<OffsetPaginatedResponse<Item>> {
  return fetchJson<OffsetPaginatedResponse<Item>>(`${BASE}/items/${buildEntityListQs(params)}`);
}

export function getItem(id: string): Promise<Item> {
  return fetchJson<Item>(`${BASE}/items/${id}/`);
}

export function updateItem(id: string, data: Partial<ItemWrite>): Promise<Item> {
  return fetchJson<Item>(`${BASE}/items/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteItem(id: string): Promise<void> {
  return fetchJson<void>(`${BASE}/items/${id}/`, { method: 'DELETE' });
}

// ── Acquisitions (creation entry point + payment) ─────────────────────

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

export function listSources(q?: string): Promise<string[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return fetchJson<string[]>(`${BASE}/acquisitions/sources/${qs}`);
}

// ── Scenarios ────────────────────────────────────────────────────────

export function listScenarios(params?: EntityListParams): Promise<OffsetPaginatedResponse<Scenario>> {
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
