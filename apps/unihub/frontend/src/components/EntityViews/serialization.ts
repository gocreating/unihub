/**
 * View URL serialization v2 — readable per-facet params (016 round 2).
 *
 * Contract: specs/016-entity-views/contracts/view-url-serialization.md
 * One named query param per facet under the table's namespace:
 *
 *   <tableKey>.view = <saved-view NAME>            (reference; others = overrides)
 *   <tableKey>.f    = and(attr op val; …)          (ONE filter group; repeatable)
 *   <tableKey>.sort = -field__nullsfirst,other     (rulesToOrdering string)
 *   <tableKey>.cols = key~left,key,key~right       (visible keys + per-column pins)
 *   <tableKey>.size = 50
 *   <tableKey>.page = 2                            (transport only)
 *
 * A clean default tab emits NO params. Emission uses minimal percent-encoding
 * (buildSearchString) so URLs stay hand-readable; parsing goes through
 * URLSearchParams and accepts fully-encoded forms equivalently. The round-1
 * packed `view[<tableKey>]` format is NOT parsed (dropped).
 */
import { orderingToRules, rulesToOrdering } from '../EntityToolbar/hooks/useEntitySort';
import type { FilterOperator, PinSide, ViewColumn, ViewConfig } from '../EntityToolbar/types';

const FACETS = ['view', 'f', 'sort', 'cols', 'size', 'page'] as const;

export function facetParam(tableKey: string, facet: (typeof FACETS)[number]): string {
  return `${tableKey}.${facet}`;
}

export interface ParsedViewState {
  /** Saved-view reference by ID. Round 4: names are non-unique labels, so only
   *  the id identifies a view — and a rename never breaks an existing link. */
  viewId?: string;
  /** Facets present in the URL — absent facets fall back to defaults/stored. */
  config: Partial<ViewConfig>;
  /** The cols facet: visible columns in display order, pins included. */
  visibleColumns?: ViewColumn[];
  /** 1-based page position (transport only — never part of a stored config). */
  page?: number;
}

export type ViewParseResult =
  | { ok: true; present: true; view: ParsedViewState }
  | { ok: true; present: false }
  | { ok: false; reason: 'malformed' };

// ── Grammar-level escaping (survives ONE URL percent-decode) ────────────────

/** Escape grammar-significant characters inside a condition value. */
function gEsc(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/;/g, '%3B')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function gUnesc(value: string): string {
  return value
    .replace(/%3B/gi, ';')
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')')
    .replace(/%25/gi, '%');
}

// ── Facet token builders ────────────────────────────────────────────────────

function filterGroupToken(group: ViewConfig['filters'][number]): string {
  const conds = group.conditions.map((c) =>
    c.val !== '' ? `${c.attr} ${c.op} ${gEsc(c.val)}` : `${c.attr} ${c.op}`,
  );
  return `${group.logic}(${conds.join('; ')})`;
}

/** Signature of the visible columns (keys + pins, display order) — the cols
 *  facet token. Also used by callers to facet-diff column overrides. */
export function columnsToken(columns: ViewColumn[]): string {
  return [...columns]
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)
    .map((c) => (c.pin ? `${c.key}~${c.pin}` : c.key))
    .join(',');
}

const colsToken = columnsToken;

function nonEmptyGroups(filters: ViewConfig['filters']): ViewConfig['filters'] {
  return filters.filter((g) => g.conditions.length > 0);
}

function filterEntries(tableKey: string, filters: ViewConfig['filters']): [string, string][] {
  const groups = nonEmptyGroups(filters);
  // "Explicitly no filters" still needs a marker, else it reads as "defaults".
  if (groups.length === 0) return [[facetParam(tableKey, 'f'), 'and()']];
  return groups.map((g) => [facetParam(tableKey, 'f'), filterGroupToken(g)]);
}

// ── Serialization ───────────────────────────────────────────────────────────

/** Inline state: one entry per facet differing from the table defaults.
 *  Equal-to-defaults → [] (the clean default tab keeps a clean URL). */
export function serializeInlineEntries(
  tableKey: string,
  config: ViewConfig,
  defaults: ViewConfig,
  page?: number,
): [string, string][] {
  const entries: [string, string][] = [];

  if (JSON.stringify(config.filters) !== JSON.stringify(defaults.filters)) {
    entries.push(...filterEntries(tableKey, config.filters));
  }

  const ordering = rulesToOrdering(config.sort) ?? '';
  if (ordering !== (rulesToOrdering(defaults.sort) ?? '')) {
    entries.push([facetParam(tableKey, 'sort'), ordering]);
  }

  const cols = colsToken(config.columns);
  if (cols !== colsToken(defaults.columns)) entries.push([facetParam(tableKey, 'cols'), cols]);

  if (config.pageSize !== defaults.pageSize) {
    entries.push([facetParam(tableKey, 'size'), String(config.pageSize)]);
  }
  if (page !== undefined) entries.push([facetParam(tableKey, 'page'), String(page)]);

  return entries;
}

/** Saved-view reference by name, with override facets layered after it. */
export function serializeSavedEntries(
  tableKey: string,
  viewId: string,
  overrides: Partial<ViewConfig> = {},
  page?: number,
): [string, string][] {
  const entries: [string, string][] = [[facetParam(tableKey, 'view'), viewId]];
  if (overrides.filters !== undefined) entries.push(...filterEntries(tableKey, overrides.filters));
  if (overrides.sort !== undefined) {
    entries.push([facetParam(tableKey, 'sort'), rulesToOrdering(overrides.sort) ?? '']);
  }
  if (overrides.columns !== undefined) {
    entries.push([facetParam(tableKey, 'cols'), colsToken(overrides.columns)]);
  }
  if (overrides.pageSize !== undefined) {
    entries.push([facetParam(tableKey, 'size'), String(overrides.pageSize)]);
  }
  if (page !== undefined) entries.push([facetParam(tableKey, 'page'), String(page)]);
  return entries;
}

/** Build a query string with MINIMAL percent-encoding: only `& = # + %`,
 *  spaces (%20) and control characters are escaped — parens, semicolons,
 *  colons, commas, slashes and tildes stay literal for readability. */
export function buildSearchString(entries: [string, string][]): string {
  const esc = (s: string) =>
    encodeURIComponent(s)
      .replace(/%2C/gi, ',')
      .replace(/%3A/gi, ':')
      .replace(/%3B/gi, ';')
      .replace(/%2F/gi, '/')
      .replace(/%40/gi, '@')
      .replace(/%24/gi, '$');
  return entries.map(([k, v]) => `${esc(k)}=${esc(v)}`).join('&');
}

// ── Parsing ─────────────────────────────────────────────────────────────────

export function hasViewParams(params: URLSearchParams, tableKey: string): boolean {
  return FACETS.some((facet) => params.has(facetParam(tableKey, facet)));
}

function parseFilterGroup(token: string): ViewConfig['filters'][number] | null {
  const match = /^\s*(and|or)\s*\(([\s\S]*)\)\s*$/.exec(token);
  if (!match) return null;
  const logic = match[1] as 'and' | 'or';
  const inner = match[2]!.trim();
  const conditions: ViewConfig['filters'][number]['conditions'] = [];
  if (inner !== '') {
    for (const segment of inner.split(';')) {
      const seg = segment.trim();
      if (!seg) return null;
      const condMatch = /^(\S+)\s+([a-z_]+)(?:\s+([\s\S]*))?$/.exec(seg);
      if (!condMatch) return null;
      conditions.push({
        attr: condMatch[1]!,
        op: condMatch[2] as FilterOperator,
        val: gUnesc(condMatch[3] ?? ''),
      });
    }
  }
  return { logic, conditions };
}

function parseColsToken(value: string): ViewColumn[] | null {
  const tokens = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const columns: ViewColumn[] = [];
  for (const token of tokens) {
    const tilde = token.lastIndexOf('~');
    if (tilde === -1) {
      columns.push({ key: token, visible: true, order: columns.length });
      continue;
    }
    const key = token.slice(0, tilde);
    const side = token.slice(tilde + 1);
    if (!key || (side !== 'left' && side !== 'right')) return null;
    columns.push({ key, visible: true, order: columns.length, pin: side as PinSide });
  }
  return columns;
}

/** Parse the table's view params from a query string. Never throws — malformed
 *  facets yield `ok: false` so callers can fall back to the default view
 *  (FR-008); a namespace with no view params reports `present: false`. */
export function parseViewParams(params: URLSearchParams, tableKey: string): ViewParseResult {
  if (!hasViewParams(params, tableKey)) return { ok: true, present: false };
  const malformed = { ok: false, reason: 'malformed' } as const;

  const config: Partial<ViewConfig> = {};
  let visibleColumns: ViewColumn[] | undefined;
  let page: number | undefined;

  const viewRaw = params.get(facetParam(tableKey, 'view'));
  if (viewRaw === '') return malformed;
  const viewId = viewRaw ?? undefined;

  const fRaws = params.getAll(facetParam(tableKey, 'f'));
  if (fRaws.length > 0) {
    const groups: ViewConfig['filters'] = [];
    for (const raw of fRaws) {
      const group = parseFilterGroup(raw);
      if (group === null) return malformed;
      if (group.conditions.length > 0) groups.push(group);
    }
    config.filters = groups;
  }

  const sortRaw = params.get(facetParam(tableKey, 'sort'));
  if (sortRaw !== null) config.sort = sortRaw === '' ? [] : orderingToRules(sortRaw);

  const colsRaw = params.get(facetParam(tableKey, 'cols'));
  if (colsRaw !== null) {
    const cols = parseColsToken(colsRaw);
    if (cols === null) return malformed;
    visibleColumns = cols;
  }

  const sizeRaw = params.get(facetParam(tableKey, 'size'));
  if (sizeRaw !== null) {
    if (!/^\d+$/.test(sizeRaw) || Number(sizeRaw) <= 0) return malformed;
    config.pageSize = Number(sizeRaw);
  }

  const pageRaw = params.get(facetParam(tableKey, 'page'));
  if (pageRaw !== null) {
    if (!/^\d+$/.test(pageRaw) || Number(pageRaw) < 1) return malformed;
    page = Number(pageRaw);
  }

  return { ok: true, present: true, view: { viewId, config, visibleColumns, page } };
}

/** Rebuild a full column list from URL-transported visible columns: listed
 *  keys (that still exist) become the visible prefix in order with their URL
 *  pins; every other current column is appended hidden, keeping its default
 *  pin. Stale keys are dropped (FR-021). */
export function columnsFromVisibleKeys(
  listed: ViewColumn[],
  currentColumns: ViewColumn[],
): ViewColumn[] {
  const known = new Map(currentColumns.map((c) => [c.key, c]));
  const kept = listed.filter((c) => known.has(c.key));
  const keptKeys = new Set(kept.map((c) => c.key));
  const rest = [...currentColumns]
    .filter((c) => !keptKeys.has(c.key))
    .sort((a, b) => a.order - b.order);
  return [
    ...kept.map((c, i) => ({ key: c.key, visible: true, order: i, pin: c.pin })),
    ...rest.map((c, i) => ({ key: c.key, visible: false, order: kept.length + i, pin: c.pin })),
  ];
}

// ── Config shape upgrade (v1 → v2) ──────────────────────────────────────────

/** Upgrade a round-1 stored/session config (view-wide stickyLeft/stickyRight)
 *  to per-column pins. v2 and foreign shapes pass through unchanged (same
 *  reference). Mirrors backend migration core/0006. */
export function upgradeConfigShape(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if (!('stickyLeft' in record) && !('stickyRight' in record)) return raw;

  const { stickyLeft, stickyRight, ...rest } = record;
  const out: Record<string, unknown> = { ...rest };
  const columns = out.columns;
  if (Array.isArray(columns)) {
    const newColumns = columns.map((c) =>
      c !== null && typeof c === 'object' ? { ...(c as ViewColumn) } : c,
    );
    const visible = newColumns
      .filter((c): c is ViewColumn => c !== null && typeof c === 'object' && !!(c as ViewColumn).visible)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (stickyLeft === true && visible.length > 0) visible[0]!.pin = 'left';
    if (stickyRight === true && visible.length > 0) visible[visible.length - 1]!.pin = 'right';
    out.columns = newColumns;
  }
  return out;
}

// ── Equality / dirty comparison ─────────────────────────────────────────────

/** Canonical string form of a config for equality/dirty checks (R7): fixed
 *  key order, empty condition groups dropped, columns normalized to
 *  (order-sorted) key/visibility/pin triples. */
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
    .map((c) => ({ key: c.key, visible: c.visible, pin: c.pin ?? null }));
  return JSON.stringify({ filters, sort, columns, pageSize: config.pageSize });
}

export function configsEqual(a: ViewConfig, b: ViewConfig): boolean {
  return normalizeConfig(a) === normalizeConfig(b);
}
