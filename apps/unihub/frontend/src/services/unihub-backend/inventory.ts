import { API_BASE_URL } from './index';
import type { EntityListParams, OffsetPaginatedResponse } from '@/components/EntityToolbar';

// ── Types ────────────────────────────────────────────────────────────

export type ItemStatus = 'active' | 'deprecated';
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
export type TemperatureUnit = '°C' | '°F';
export type TimeUnit = 's' | 'min' | 'h';
export type BatteryUnit = 'mAh' | 'Ah';
export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in'];
export const WEIGHT_UNITS: WeightUnit[] = ['g', 'kg', 'lb'];
export const VOLUME_UNITS: VolumeUnit[] = ['mL', 'L'];
export const TEMPERATURE_UNITS: TemperatureUnit[] = ['°C', '°F'];
export const TIME_UNITS: TimeUnit[] = ['s', 'min', 'h'];
export const BATTERY_UNITS: BatteryUnit[] = ['mAh', 'Ah'];

export type UnitFamily = 'length' | 'weight' | 'volume' | 'temperature' | 'time' | 'battery';
export const UNIT_FAMILY_OPTIONS: Record<UnitFamily, readonly string[]> = {
  length: LENGTH_UNITS,
  weight: WEIGHT_UNITS,
  volume: VOLUME_UNITS,
  temperature: TEMPERATURE_UNITS,
  time: TIME_UNITS,
  battery: BATTERY_UNITS,
};

// Entry default per family (018 US2): lengths default to cm — real-world
// entries are almost always centimetres — every other family keeps its first
// listed unit. Display order in the dropdowns stays UNIT_FAMILY_OPTIONS.
export const DEFAULT_FAMILY_UNIT: Record<UnitFamily, string> = {
  length: 'cm',
  weight: WEIGHT_UNITS[0]!,
  volume: VOLUME_UNITS[0]!,
  temperature: TEMPERATURE_UNITS[0]!,
  time: TIME_UNITS[0]!,
  battery: BATTERY_UNITS[0]!,
};

/** The unit pre-selected wherever a family unit has not been chosen yet. */
export function defaultUnitFor(family: UnitFamily): string {
  return DEFAULT_FAMILY_UNIT[family];
}

export interface Measurement {
  value: string;
  unit: string;
}

/** One parameter row on an item (shared AttributeDefinition/AttributeValue). */
export interface ItemParameter {
  definition_id: string;
  name: string;
  data_type: string; // text | long_text | number | single_select | dimension | …
  unit_family: UnitFamily | '';
  emoji: string;
  value: string;
  unit: string;
  value_number: string | null;
  value_number_max: string | null;
}

export interface ItemParameterWrite {
  definition_id: string;
  value: string;
  unit?: string;
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
  alias_name: string;
  quantity: number;
  spec: string;
  remark: string;
  sku_price: string | null;
  sku_price_currency: string;
  total_price: string | null;
  url: string;
  status: ItemStatus;
  deprecated: boolean;
  deprecate_time: string | null;
  parameters: ItemParameter[];
  acquisition: AcquisitionSummary | null;
  created_at: string;
  updated_at: string;
}

export interface ItemWrite {
  name: string;
  alias_name?: string;
  quantity?: number;
  spec?: string;
  remark?: string;
  sku_price?: string | null;
  sku_price_currency?: string;
  url?: string;
  deprecated?: boolean;
  deprecate_time?: string | null;
  parameters?: ItemParameterWrite[];
}

export interface CostFactor {
  id: string;
  value: string; // signed decimal
  currency: string;
  type: string; // free-form; CostFactorType values are suggestions
  display_order: number;
  // Accumulated rows only: true = the user manually set this amount and no
  // flow may auto-recalculate it (018 US1).
  user_managed: boolean;
}

export interface CostFactorWrite {
  value: string;
  currency?: string;
  type?: string; // free-form; sent in display order (server assigns display_order)
  user_managed?: boolean;
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
  description: string;
  item_count: number;
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
  display_order: number;
  organized: boolean;
  notes: string;
  created_at: string;
}

export interface ScenarioItemWrite {
  item_id?: string;
  container_id?: string | null;
  notes?: string;
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

export function createScenario(
  data: Pick<Scenario, 'name'> & { description?: string },
): Promise<Scenario> {
  return fetchJson<Scenario>(`${BASE}/scenarios/`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateScenario(
  id: string,
  data: Partial<Pick<Scenario, 'name' | 'description'>>,
): Promise<Scenario> {
  return fetchJson<Scenario>(`${BASE}/scenarios/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteScenario(id: string): Promise<void> {
  return fetchJson<void>(`${BASE}/scenarios/${id}/`, { method: 'DELETE' });
}

// ── Scenario items (packing tree / containment) ───────────────────────

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

/**
 * Drag-drop move: set a line's container and sibling position (dense order).
 * `organized: false` sends the line back to the unorganized pane (container/
 * index ignored; its children re-parent to the organized top level).
 */
export function moveScenarioItem(
  scenarioId: string,
  lineId: string,
  data: { container_id: string | null; index: number; organized?: boolean },
): Promise<ScenarioItem> {
  return fetchJson<ScenarioItem>(`${BASE}/scenarios/${scenarioId}/items/${lineId}/move/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
