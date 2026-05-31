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

/** Shape that is JSON-serialised into the `filters` query param. */
export interface FilterPayload {
  groups: Array<{
    logic: GroupLogic;
    conditions: Array<{ attr: string; op: FilterOperator; val: string }>;
  }>;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  field: string;
  direction: SortDirection;
}

/** Ordered list — index 0 is the highest-priority sort key. */
export type SortState = SortRule[];

// ── Column ────────────────────────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  dataType: AttributeDataType;
  visible: boolean;
  /** Display position — lower numbers appear further left. */
  order: number;
}

export interface ColumnState {
  columns: ColumnDef[];
  /** When true the first visible column is pinned to the left edge. */
  stickyLeft: boolean;
  /** When true the last visible column is pinned to the right edge. */
  stickyRight: boolean;
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface OffsetPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
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
}
