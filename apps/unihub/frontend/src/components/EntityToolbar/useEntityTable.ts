/**
 * useEntityTable — combined hook for entity list pages.
 *
 * Wraps useEntityFilter, useEntitySort, useColumnConfig, and pagination state
 * into a single standardized interface so every entity list page uses the same
 * pattern and behavior without repeating boilerplate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SorterResult } from 'antd/es/table/interface';
import { useEntityFilter } from './hooks/useEntityFilter';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';
import { useEntitySort } from './hooks/useEntitySort';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import { useColumnConfig } from './hooks/useColumnConfig';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import type {
  ColumnDef,
  EntityListParams,
  FilterableAttribute,
  FilterPayload,
  SortRule,
  ViewConfig,
} from './types';

export const ENTITY_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type EntityPageSize = (typeof ENTITY_PAGE_SIZE_OPTIONS)[number];

export interface UseEntityTableOptions {
  /** Unique key scoping URL state (e.g. 'accounts', 'currencies'). */
  key: string;
  filterableAttrs: FilterableAttribute[];
  columnDefs: ColumnDef[];
  defaultPageSize?: EntityPageSize;
  /** Initial sort rules applied before any user interaction (e.g. a page's default sort). */
  defaultSortRules?: SortRule[];
  /** Seed a default filter applied before any user interaction (lit + clearable). */
  defaultFilterGroups?: FilterPayload['groups'];
}

export interface EntityPaginationProps {
  total: number | undefined;
  pageSize: number;
  current: number;
  onChange: (page: number, size: number) => void;
}

export interface UseEntityTableReturn {
  filter: UseEntityFilterReturn;
  sort: UseEntitySortReturn;
  cols: UseColumnConfigReturn;
  limit: number;
  setLimit: (n: number) => void;
  offset: number;
  setOffset: (n: number) => void;
  /** Ready-to-use params for the API query. */
  queryParams: EntityListParams;
  /** Wire to ProTable's onChange to sync column header sort clicks. */
  handleTableSorterChange: (sorter: SorterResult<unknown> | SorterResult<unknown>[]) => void;
  /** Build AntD pagination props from the API response total count. */
  paginationProps: (total: number | undefined) => EntityPaginationProps;
  /** The table's view namespace (the `key` option) — used by entity views (016). */
  tableKey: string;
  /** Capture the current active state as a serializable ViewConfig (016 views). */
  snapshotConfig: () => ViewConfig;
  /** Apply a whole ViewConfig: filter/sort/columns land clean (active+pending),
   *  page size applies, and the page resets to 0 unless an explicit offset is
   *  given (URL page transport). */
  loadConfig: (config: ViewConfig, options?: { offset?: number }) => void;
}

export function useEntityTable({
  key,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  filterableAttrs: _filterableAttrs,
  columnDefs,
  defaultPageSize = 25,
  defaultSortRules,
  defaultFilterGroups,
}: UseEntityTableOptions): UseEntityTableReturn {
  const filter = useEntityFilter(key, defaultFilterGroups);
  const sort = useEntitySort(key, defaultSortRules);
  const cols = useColumnConfig(columnDefs);

  const [limit, setLimit] = useState<number>(defaultPageSize);
  const [offset, setOffset] = useState(0);

  // loadConfig() may carry an explicit offset (URL page transport) that must
  // survive the filter/sort-change page reset below.
  const skipNextOffsetResetRef = useRef(false);

  // Reset to first page whenever the user applies a new filter or sort.
  useEffect(() => {
    if (skipNextOffsetResetRef.current) {
      skipNextOffsetResetRef.current = false;
      return;
    }
    setOffset(0);
  }, [filter.activeGroups, sort.activeRules]);

  const queryParams = useMemo<EntityListParams>(
    () => ({
      filters: filter.toApiParam(),
      ordering: sort.toOrderingParam(),
      limit,
      offset,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter.toApiParam, sort.toOrderingParam, limit, offset],
  );

  const handleTableSorterChange = useCallback(
    (sorter: SorterResult<unknown> | SorterResult<unknown>[]) => {
      // In multi-sort mode AntD passes the FULL array of all currently sorted
      // columns, not just the one that changed. Compare against activeRules to
      // identify which field was actually clicked, then delegate to handleHeaderClick
      // which implements the correct 3-state toggle (asc → desc → remove).
      const sorters = Array.isArray(sorter) ? sorter : sorter ? [sorter] : [];
      const newSortMap = new Map<string, 'ascend' | 'descend'>();
      for (const s of sorters) {
        if (s.field && s.order) newSortMap.set(String(s.field), s.order as 'ascend' | 'descend');
      }
      const activeFields = new Set(sort.activeRules.map((r) => r.field));

      // Field newly added (present in sorters but not in activeRules)
      const added = [...newSortMap.keys()].find((f) => !activeFields.has(f));
      if (added) { sort.handleHeaderClick(added); return; }

      // Field removed (was in activeRules, absent from sorters)
      const removed = [...activeFields].find((f) => !newSortMap.has(f));
      if (removed) { sort.handleHeaderClick(removed); return; }

      // Direction changed for an existing field
      for (const [field, newOrder] of newSortMap) {
        const rule = sort.activeRules.find((r) => r.field === field);
        if (rule && rule.direction !== (newOrder === 'ascend' ? 'asc' : 'desc')) {
          sort.handleHeaderClick(field);
          return;
        }
      }
    },
    [sort],
  );

  const paginationProps = useCallback(
    (total: number | undefined): EntityPaginationProps => ({
      total,
      pageSize: limit,
      current: Math.floor(offset / limit) + 1,
      onChange: (page: number, size: number) => {
        const newSize = size ?? limit;
        if (newSize !== limit) {
          setLimit(newSize);
          setOffset(0);
        } else {
          setOffset((page - 1) * newSize);
        }
      },
    }),
    [limit, offset],
  );

  const { toApiParam, loadGroups } = filter;
  const { activeRules, loadRules } = sort;
  const { activeState, loadState } = cols;

  const snapshotConfig = useCallback(
    (): ViewConfig => ({
      filters: toApiParam()?.groups ?? [],
      sort: activeRules,
      // v2 (016 round 2): per-column pins map 1:1 to ColumnDef.pin — no
      // projection, multi-pin layouts round-trip exactly.
      columns: activeState.columns.map((c) => ({
        key: c.key,
        visible: c.visible,
        order: c.order,
        pin: c.pin,
      })),
      pageSize: limit,
    }),
    [toApiParam, activeRules, activeState, limit],
  );
  const loadConfig = useCallback(
    (config: ViewConfig, options?: { offset?: number }) => {
      loadGroups(config.filters);
      loadRules(config.sort);
      loadState(config.columns);
      setLimit(config.pageSize);
      skipNextOffsetResetRef.current = true;
      setOffset(options?.offset ?? 0);
    },
    [loadGroups, loadRules, loadState],
  );

  return {
    filter,
    sort,
    cols,
    limit,
    setLimit,
    offset,
    setOffset,
    queryParams,
    handleTableSorterChange,
    paginationProps,
    tableKey: key,
    snapshotConfig,
    loadConfig,
  };
}
