/**
 * View URL serialization — ViewConfig ↔ `view[<tableKey>]` inner mini-format.
 *
 * Contract: specs/016-entity-views/contracts/view-url-serialization.md
 * The inner string is a `key=value&…` mini query-string (built and parsed via
 * URLSearchParams, so outer percent-encoding is symmetric). For `type=inline`
 * absent keys mean "table default"; for `type=saved` the keys are overrides
 * layered facet-whole onto the stored config.
 */
import { orderingToRules, rulesToOrdering } from '../EntityToolbar/hooks/useEntitySort';
import type { ViewColumn, ViewConfig } from '../EntityToolbar/types';

export interface ParsedView {
  type: 'inline' | 'saved';
  /** Saved-view id (`type=saved` only). */
  id?: string;
  /** Facets present in the param — absent facets fall back to defaults/stored. */
  config: Partial<ViewConfig>;
  /** Visible column keys in display order (the `columns` key), when present. */
  visibleColumnKeys?: string[];
  /** 1-based page position (transport only — never part of a stored config). */
  page?: number;
}

export type ParseResult =
  | { ok: true; view: ParsedView }
  | { ok: false; reason: 'malformed' | 'unknown-type' | 'missing-id' };

export function viewParamName(tableKey: string): string {
  return `view[${tableKey}]`;
}

function visibleKeys(columns: ViewColumn[]): string[] {
  return [...columns]
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.key);
}

function pinString(stickyLeft: boolean, stickyRight: boolean): string {
  return [stickyLeft ? 'left' : null, stickyRight ? 'right' : null].filter(Boolean).join(',');
}

/** Serialize a full inline state, omitting facets equal to the table defaults. */
export function serializeInline(config: ViewConfig, defaults: ViewConfig, page?: number): string {
  const params = new URLSearchParams();
  params.set('type', 'inline');

  const filtersJson = JSON.stringify(config.filters);
  if (filtersJson !== JSON.stringify(defaults.filters)) params.set('filters', filtersJson);

  const ordering = rulesToOrdering(config.sort) ?? '';
  if (ordering !== (rulesToOrdering(defaults.sort) ?? '')) params.set('ordering', ordering);

  const cols = visibleKeys(config.columns).join(',');
  if (cols !== visibleKeys(defaults.columns).join(',')) params.set('columns', cols);

  const pin = pinString(config.stickyLeft, config.stickyRight);
  if (pin !== pinString(defaults.stickyLeft, defaults.stickyRight)) params.set('pin', pin);

  if (config.pageSize !== defaults.pageSize) params.set('page_size', String(config.pageSize));
  if (page !== undefined) params.set('page', String(page));

  return params.toString();
}

/** Serialize a saved-view reference with only the overridden facets. */
export function serializeSaved(
  id: string,
  overrides: Partial<ViewConfig> = {},
  page?: number,
): string {
  const params = new URLSearchParams();
  params.set('type', 'saved');
  params.set('id', id);

  if (overrides.filters !== undefined) params.set('filters', JSON.stringify(overrides.filters));
  if (overrides.sort !== undefined) params.set('ordering', rulesToOrdering(overrides.sort) ?? '');
  if (overrides.columns !== undefined) {
    params.set('columns', visibleKeys(overrides.columns).join(','));
  }
  if (overrides.stickyLeft !== undefined || overrides.stickyRight !== undefined) {
    params.set('pin', pinString(overrides.stickyLeft ?? false, overrides.stickyRight ?? false));
  }
  if (overrides.pageSize !== undefined) params.set('page_size', String(overrides.pageSize));
  if (page !== undefined) params.set('page', String(page));

  return params.toString();
}

/** Parse an inner string. Never throws — malformed input returns `ok: false`
 *  so callers can fall back to the default view (FR-008). Unknown keys are
 *  ignored (forward compatibility); unknown column/field keys are the
 *  caller's concern (dropped on hydration, FR-021). */
export function parseViewParam(inner: string): ParseResult {
  if (!inner) return { ok: false, reason: 'malformed' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(inner);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const type = params.get('type');
  if (type !== 'inline' && type !== 'saved') {
    return { ok: false, reason: type === null ? 'malformed' : 'unknown-type' };
  }

  const id = params.get('id') ?? undefined;
  if (type === 'saved' && !id) return { ok: false, reason: 'missing-id' };

  const config: Partial<ViewConfig> = {};
  let visibleColumnKeys: string[] | undefined;
  let page: number | undefined;

  const filtersRaw = params.get('filters');
  if (filtersRaw !== null) {
    try {
      const parsed: unknown = JSON.parse(filtersRaw);
      if (!Array.isArray(parsed)) return { ok: false, reason: 'malformed' };
      config.filters = parsed as ViewConfig['filters'];
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }

  const orderingRaw = params.get('ordering');
  if (orderingRaw !== null) config.sort = orderingToRules(orderingRaw);

  const columnsRaw = params.get('columns');
  if (columnsRaw !== null) visibleColumnKeys = columnsRaw.split(',').filter(Boolean);

  const pinRaw = params.get('pin');
  if (pinRaw !== null) {
    const parts = pinRaw.split(',');
    config.stickyLeft = parts.includes('left');
    config.stickyRight = parts.includes('right');
  }

  const pageSizeRaw = params.get('page_size');
  if (pageSizeRaw !== null) {
    const n = Number(pageSizeRaw);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'malformed' };
    config.pageSize = n;
  }

  const pageRaw = params.get('page');
  if (pageRaw !== null) {
    const n = Number(pageRaw);
    if (!Number.isInteger(n) || n < 1) return { ok: false, reason: 'malformed' };
    page = n;
  }

  return { ok: true, view: { type, id, config, visibleColumnKeys, page } };
}

/** Rebuild a full column list from URL-transported visible keys: listed keys
 *  (that still exist) become the visible prefix in order; every other current
 *  column is appended hidden. Stale keys are dropped (FR-021). */
export function columnsFromVisibleKeys(
  keys: string[],
  currentColumns: ViewColumn[],
): ViewColumn[] {
  const known = new Set(currentColumns.map((c) => c.key));
  const listed = keys.filter((k) => known.has(k));
  const listedSet = new Set(listed);
  const rest = [...currentColumns]
    .filter((c) => !listedSet.has(c.key))
    .sort((a, b) => a.order - b.order);
  return [
    ...listed.map((key, i) => ({ key, visible: true, order: i })),
    ...rest.map((c, i) => ({ key: c.key, visible: false, order: listed.length + i })),
  ];
}

/** Canonical string form of a config for equality/dirty checks (R7):
 *  fixed key order, empty condition groups dropped, column sequence
 *  normalized to (order-sorted) key/visibility pairs. */
export function normalizeConfig(config: ViewConfig): string {
  const filters = config.filters
    .map((g) => ({
      logic: g.logic,
      conditions: g.conditions.map((c) => ({ attr: c.attr, op: c.op, val: c.val })),
    }))
    .filter((g) => g.conditions.length > 0);
  const sort = config.sort.map((r) => ({
    field: r.field,
    direction: r.direction,
    nulls: r.nulls ?? null,
  }));
  const columns = [...config.columns]
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((c) => ({ key: c.key, visible: c.visible }));
  return JSON.stringify({
    filters,
    sort,
    columns,
    stickyLeft: config.stickyLeft,
    stickyRight: config.stickyRight,
    pageSize: config.pageSize,
  });
}

export function configsEqual(a: ViewConfig, b: ViewConfig): boolean {
  return normalizeConfig(a) === normalizeConfig(b);
}
