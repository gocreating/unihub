// Shared types for EntityToolbar — filter, sort, column, and pagination.

// ── Filter ────────────────────────────────────────────────────────────────────

export type FilterOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is'
  | 'is_not'
  | 'date_before'
  | 'date_after';

export type AttributeDataType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'single_select';

export interface FilterableAttribute {
  key: string;
  label: string;
  dataType: AttributeDataType;
  /** Allowed values for single_select attributes. */
  options?: string[];
}

export interface FilterCondition {
  /** Client-side UUID — not sent to the backend. */
  id: string;
  attr: string;
  op: FilterOperator;
  val: string;
}

export type GroupLogic = 'and' | 'or';

export interface FilterGroup {
  /** Client-side UUID — not sent to the backend. */
  id: string;
  logic: GroupLogic;
  conditions: FilterCondition[];
}

// ── Filter tree (used by FilterPanel) ────────────────────────────────────────

/** A single condition rule inside a FilterGroupItem. */
export interface FilterRuleItem {
  id: string;
  attr: string;
  op: FilterOperator;
  val: string;
}

/** A nested group node inside the filter tree. */
export interface FilterGroupItem {
  id: string;
  type: 'group';
  logic: GroupLogic;
  rules: FilterItem[];
}

export type FilterItem = FilterRuleItem | FilterGroupItem;

export function isFilterGroup(item: FilterItem): item is FilterGroupItem {
  return (item as FilterGroupItem).type === 'group';
}

// ─────────────────────────────────────────────────────────────────────────────

/** Shape that is JSON-serialised into the `filters` query param. */
export interface FilterPayload {
  groups: Array<{
    logic: GroupLogic;
    conditions: Array<{ attr: string; op: FilterOperator; val: string }>;
  }>;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export type SortNulls = 'first' | 'last';

export interface SortRule {
  field: string;
  direction: SortDirection;
  nulls?: SortNulls;
}

/** Ordered list — index 0 is the highest-priority sort key. */
export type SortState = SortRule[];

// ── Column ────────────────────────────────────────────────────────────────────

/** Edge a column is pinned (fixed) to. */
export type PinSide = 'left' | 'right';

export interface ColumnDef {
  key: string;
  label: string;
  dataType: AttributeDataType;
  visible: boolean;
  /** Display position — lower numbers appear further left (within a pin group). */
  order: number;
  /**
   * Pinned edge; undefined = not pinned. At most one side per column.
   * On a page's initial columnDefs this seeds the DEFAULT pin (restored by Reset).
   */
  pin?: PinSide;
}

export interface ColumnState {
  columns: ColumnDef[];
}

// ── Entity views (016) ───────────────────────────────────────────────────────

/** One column entry inside a ViewConfig — key/visibility/position/pin only;
 *  labels and dataTypes are runtime concerns (localized, async-patched). */
export interface ViewColumn {
  key: string;
  visible: boolean;
  order: number;
  /** v2 — per-column pin, mirroring ColumnDef.pin (any number per side). */
  pin?: PinSide;
}

/** The serializable payload of an entity view: everything a table tab restores.
 *  Stored verbatim as EntityView.config and transported as per-facet
 *  `<tableKey>.<facet>` URL params (v2 — per-column pins; the view-wide
 *  stickyLeft/stickyRight booleans are gone, migrated by core/0006). */
export interface ViewConfig {
  filters: FilterPayload['groups'];
  sort: SortRule[];
  columns: ViewColumn[];
  pageSize: number;
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface OffsetPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  /** Footer totals over the filtered queryset (view-defined, iteration 15). */
  totals?: Record<string, number>;
  results: T[];
}

export interface CursorPaginatedResponse<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Service layer ─────────────────────────────────────────────────────────────

export interface EntityListParams {
  filters?: FilterPayload;
  /** DRF ordering string, e.g. `"name,-created_at"`. */
  ordering?: string;
  limit?: number;
  /** Offset-based pagination. */
  offset?: number;
  /** Cursor-based pagination. */
  cursor?: string;
  /** Quick search (019): free-text query matched against any searchable
   *  attribute server-side, ANDed with `filters`. Omit (never `''`) when no
   *  search is active. */
  search?: string;
}
