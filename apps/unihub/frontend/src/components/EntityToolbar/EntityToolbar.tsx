import { useCallback, useState } from 'react';
import { Button, Dropdown, Input } from 'antd';
import {
  FilterOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import type { FilterableAttribute } from './types';
import { FilterPanel } from './FilterPanel';
import { SortPanel } from './SortPanel';
import { ColumnPanel } from './ColumnPanel';

export interface EntityToolbarProps {
  filterProps: {
    attrs: FilterableAttribute[];
    hook: UseEntityFilterReturn;
  };
  sortProps: {
    attrs: FilterableAttribute[];
    hook: UseEntitySortReturn;
  };
  /** Optional — omit to hide the Columns button (e.g. pages that manage columns manually). */
  columnProps?: {
    hook: UseColumnConfigReturn;
  };
  /** Quick search (019) — omit to hide the search input. The input is live
   *  (no apply gate: constitution XII covers panels, not direct controls) and
   *  stretches to fill the toolbar row's remaining width. */
  searchProps?: {
    value: string;
    onChange: (value: string) => void;
  };
}

export function EntityToolbar({
  filterProps,
  sortProps,
  columnProps,
  searchProps,
}: EntityToolbarProps) {
  const { formatMessage: t } = useIntl();

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);
  const [filterCancelToken, setFilterCancelToken] = useState(0);
  const [sortCancelToken, setSortCancelToken] = useState(0);
  const [columnCancelToken, setColumnCancelToken] = useState(0);

  // onApply: just close the dropdown — no cancel. Called after apply() commits state.
  const applyAndCloseFilter = useCallback(() => {
    setFilterOpen(false);
  }, []);

  const applyAndCloseSort = useCallback(() => {
    setSortOpen(false);
  }, []);

  const applyAndCloseColumn = useCallback(() => {
    setColumnOpen(false);
  }, []);

  // onClose: cancel pending changes then close. Called by Cancel button.
  const closeFilter = useCallback(() => {
    filterProps.hook.cancel();
    setFilterOpen(false);
  }, [filterProps.hook]);

  const closeSort = useCallback(() => {
    sortProps.hook.cancel();
    setSortOpen(false);
  }, [sortProps.hook]);

  const closeColumn = useCallback(() => {
    columnProps?.hook.cancel();
    setColumnOpen(false);
  }, [columnProps]);

  const handleFilterOpenChange = (open: boolean) => {
    if (open && (sortProps.hook.isDirty || columnProps?.hook.isDirty)) return;
    if (!open && filterProps.hook.isDirty) { setFilterCancelToken((n) => n + 1); return; }
    setFilterOpen(open);
    if (!open) filterProps.hook.cancel();
  };

  const handleSortOpenChange = (open: boolean) => {
    if (open && (filterProps.hook.isDirty || columnProps?.hook.isDirty)) return;
    if (!open && sortProps.hook.isDirty) { setSortCancelToken((n) => n + 1); return; }
    setSortOpen(open);
    if (!open) sortProps.hook.cancel();
  };

  const handleColumnOpenChange = (open: boolean) => {
    if (open && (filterProps.hook.isDirty || sortProps.hook.isDirty)) return;
    if (!open && columnProps?.hook.isDirty) { setColumnCancelToken((n) => n + 1); return; }
    setColumnOpen(open);
    if (!open) columnProps?.hook.cancel();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      {/* Filter */}
      <Dropdown
        open={filterOpen}
        onOpenChange={handleFilterOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <FilterPanel
            attrs={filterProps.attrs}
            hook={filterProps.hook}
            onApply={applyAndCloseFilter}
            onClose={closeFilter}
            focusCancelOn={filterCancelToken}
          />
        )}
      >
        <Button
          icon={<FilterOutlined />}
          type={filterProps.hook.isActive ? 'primary' : 'default'}
        >
          {t({ id: 'common.entityOps.filter' })}
        </Button>
      </Dropdown>

      {/* Sort */}
      <Dropdown
        open={sortOpen}
        onOpenChange={handleSortOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <SortPanel
            attrs={sortProps.attrs}
            hook={sortProps.hook}
            onApply={applyAndCloseSort}
            onClose={closeSort}
            focusCancelOn={sortCancelToken}
          />
        )}
      >
        <Button
          icon={<SortAscendingOutlined />}
          // Active whenever ANY sort rule applies — including a page's seeded
          // default — matching the Filter button's isActive semantics.
          type={sortProps.hook.isActive ? 'primary' : 'default'}
        >
          {t({ id: 'common.entityOps.sort' })}
        </Button>
      </Dropdown>

      {/* Columns — only shown when columnProps is provided */}
      {columnProps && (
        <Dropdown
          open={columnOpen}
          onOpenChange={handleColumnOpenChange}
          trigger={['click']}
          dropdownRender={() => (
            <ColumnPanel
              hook={columnProps.hook}
              onApply={applyAndCloseColumn}
              onClose={closeColumn}
              focusCancelOn={columnCancelToken}
            />
          )}
        >
          <Button
            icon={<TableOutlined />}
            type={columnProps.hook.isCustomised ? 'primary' : 'default'}
          >
            {t({ id: 'common.entityOps.columns' })}
          </Button>
        </Dropdown>
      )}

      {/* Quick search (019) — next to the Columns dropdown, stretched to fill
          the remaining row width. Deliberately OUTSIDE the panel machinery:
          typing never closes or discards a dirty panel. */}
      {searchProps && (
        <div style={{ flex: '1 1 auto', minWidth: 160 }}>
          <Input
            prefix={<SearchOutlined />}
            allowClear
            placeholder={t({ id: 'common.entityOps.searchPlaceholder' })}
            value={searchProps.value}
            onChange={(e) => searchProps.onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
