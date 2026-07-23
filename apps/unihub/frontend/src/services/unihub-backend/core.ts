import { API_BASE_URL } from './index';

export interface AttributeDefinition {
  id: string;
  content_type: number;
  content_type_label: string;
  name: string;
  data_type: 'text' | 'long_text' | 'number' | 'date' | 'boolean' | 'single_select' | 'dimension';
  unit_family: 'length' | 'weight' | 'volume' | 'temperature' | 'time' | 'battery' | '';
  emoji: string;
  is_system: boolean;
  display_order: number;
  options: string[];
}

export interface AttributeValue {
  id: string;
  attribute_definition: string;
  content_type: number;
  object_id: string;
  value: string;
  value_unit: string;
  value_number: string | null;
  value_number_max: string | null;
}

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

export function listAttributeDefinitions(contentType?: string): Promise<AttributeDefinition[]> {
  const qs = contentType ? `?content_type=${contentType}` : '';
  return fetchJson<AttributeDefinition[]>(`/api/v1/core/attribute-definitions/${qs}`);
}

export function createAttributeDefinition(
  data: Pick<AttributeDefinition, 'content_type' | 'name' | 'data_type'> & {
    options?: string[];
    unit_family?: AttributeDefinition['unit_family'];
    emoji?: string;
  },
): Promise<AttributeDefinition> {
  return fetchJson<AttributeDefinition>('/api/v1/core/attribute-definitions/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteAttributeDefinition(id: string, confirm = false): Promise<void | { affected_entity_count: number; message: string }> {
  const qs = confirm ? '?confirm=true' : '';
  return fetchJson<void>(`/api/v1/core/attribute-definitions/${id}/${qs}`, { method: 'DELETE' });
}

// ── Entity views (016) ───────────────────────────────────────────────────────

/** A saved, per-user, per-table view (owner is implicit — never serialized). */
export interface EntityView {
  id: string;
  table_key: string;
  name: string;
  /** ViewConfig payload — typed loosely here; the canonical shape lives in
   *  components/EntityToolbar/types.ts (ViewConfig). */
  config: Record<string, unknown>;
  pinned: boolean;
  position: number;
  /** The table's materialized default view — create-only, undeletable (round 2). */
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntityViewCreatePayload {
  table_key: string;
  name: string;
  config: Record<string, unknown>;
  pinned?: boolean;
  position?: number;
  is_default?: boolean;
}

export type EntityViewPatch = Partial<Pick<EntityView, 'name' | 'config' | 'pinned' | 'position'>>;

export function listEntityViews(tableKey: string): Promise<EntityView[]> {
  return fetchJson<EntityView[]>(
    `/api/v1/core/entity-views/?table_key=${encodeURIComponent(tableKey)}`,
  );
}

export function createEntityView(payload: EntityViewCreatePayload): Promise<EntityView> {
  return fetchJson<EntityView>('/api/v1/core/entity-views/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateEntityView(id: string, patch: EntityViewPatch): Promise<EntityView> {
  return fetchJson<EntityView>(`/api/v1/core/entity-views/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteEntityView(id: string): Promise<void> {
  return fetchJson<void>(`/api/v1/core/entity-views/${id}/`, { method: 'DELETE' });
}

export function reorderEntityViews(tableKey: string, ids: string[]): Promise<EntityView[]> {
  return fetchJson<EntityView[]>('/api/v1/core/entity-views/reorder/', {
    method: 'POST',
    body: JSON.stringify({ table_key: tableKey, ids }),
  });
}

export function listAttributeValues(contentType: string, objectId: string): Promise<AttributeValue[]> {
  return fetchJson<AttributeValue[]>(
    `/api/v1/core/attribute-values/?content_type=${contentType}&object_id=${objectId}`,
  );
}

export function bulkUpsertAttributeValues(
  contentType: string,
  objectId: string,
  attributes: { attribute_definition_id: string; value: string }[],
): Promise<AttributeValue[]> {
  return fetchJson<AttributeValue[]>('/api/v1/core/attribute-values/bulk-upsert/', {
    method: 'POST',
    body: JSON.stringify({ content_type: contentType, object_id: objectId, attributes }),
  });
}
