/**
 * useEntityTable — combined hook for entity list pages.
 *
 * Wraps useEntityFilter, useEntitySort, useColumnConfig, and pagination state
 * into a single standardized interface so every entity list page uses the same
 * pattern and behavior without repeating boilerplate.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { SorterResult } from 'antd/es/table/interface';
import { useEntityFilter } from './hooks/useEntityFilter';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';
import { useEntitySort } from './hooks/useEntitySort';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import { useColumnConfig } from './hooks/useColumnConfig';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import type { ColumnDef, EntityListParams, FilterableAttribute } from './types';

export const ENTITY_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type EntityPageSize = (typeof ENTITY_PAGE_SIZE_OPTIONS)[number];

export interface UseEntityTableOptions {
  /** Unique key scoping URL state (e.g. 'accounts', 'currencies'). */
  key: string;
  filterableAttrs: FilterableAttribute[];
  columnDefs: ColumnDef[];
  defaultPageSize?: EntityPageSize;
}

export interface EntityPaginationProps {
  total: number | undefined;
  pageSize: number;
  current: number;
  showTotal: (n: number) => string;
  showSizeChanger: boolean;
  pageSizeOptions: readonly number[];
  onChange: (page: number, size?: number) => void;
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
}

export function useEntityTable({
  key,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  filterableAttrs: _filterableAttrs,
  columnDefs,
  defaultPageSize = 25,
}: UseEntityTableOptions): UseEntityTableReturn {
  const { formatMessage: t } = useIntl();

  const filter = useEntityFilter(key);
  const sort = useEntitySort(key);
  const cols = useColumnConfig(columnDefs);

  const [limit, setLimit] = useState<number>(defaultPageSize);
  const [offset, setOffset] = useState(0);

  // Reset to first page whenever the user applies a new filter or sort.
  useEffect(() => {
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
      const s = Array.isArray(sorter) ? sorter[0] : sorter;
      if (s?.field) sort.handleHeaderClick(String(s.field));
    },
    [sort],
  );

  const paginationProps = useCallback(
    (total: number | undefined): EntityPaginationProps => ({
      total,
      pageSize: limit,
      current: Math.floor(offset / limit) + 1,
      showTotal: (n: number) =>
        t({ id: 'common.entityOps.pagination.total' }, { total: n }),
      showSizeChanger: true,
      pageSizeOptions: ENTITY_PAGE_SIZE_OPTIONS,
      onChange: (page: number, size?: number) => {
        const newSize = size ?? limit;
        if (newSize !== limit) {
          setLimit(newSize);
          setOffset(0);
        } else {
          setOffset((page - 1) * newSize);
        }
      },
    }),
    [limit, offset, t],
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
  };
}
