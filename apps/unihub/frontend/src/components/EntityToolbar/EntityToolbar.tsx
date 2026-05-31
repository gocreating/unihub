import { useCallback, useState } from 'react';
import { Button, Dropdown, Space, Tooltip } from 'antd';
import { FilterOutlined, SortAscendingOutlined, TableOutlined } from '@ant-design/icons';
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
  columnProps: {
    hook: UseColumnConfigReturn;
  };
}

export function EntityToolbar({ filterProps, sortProps, columnProps }: EntityToolbarProps) {
  const { formatMessage: t } = useIntl();

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);

  const closeFilter = useCallback(() => {
    filterProps.hook.cancel();
    setFilterOpen(false);
  }, [filterProps.hook]);

  const closeSort = useCallback(() => {
    sortProps.hook.cancel();
    setSortOpen(false);
  }, [sortProps.hook]);

  const closeColumn = useCallback(() => {
    columnProps.hook.cancel();
    setColumnOpen(false);
  }, [columnProps.hook]);

  const handleFilterOpenChange = (open: boolean) => {
    if (!open && filterProps.hook.isDirty) return;
    setFilterOpen(open);
    if (!open) filterProps.hook.cancel();
  };

  const handleSortOpenChange = (open: boolean) => {
    if (!open && sortProps.hook.isDirty) return;
    setSortOpen(open);
    if (!open) sortProps.hook.cancel();
  };

  const handleColumnOpenChange = (open: boolean) => {
    if (!open && columnProps.hook.isDirty) return;
    setColumnOpen(open);
    if (!open) columnProps.hook.cancel();
  };

  const filterTooltip =
    filterOpen && filterProps.hook.isDirty
      ? t({ id: 'common.entityOps.unsavedChanges' })
      : filterProps.hook.isActive
        ? t({ id: 'common.entityOps.filter.isActive' })
        : undefined;

  const sortTooltip =
    sortOpen && sortProps.hook.isDirty
      ? t({ id: 'common.entityOps.unsavedChanges' })
      : sortProps.hook.isActive
        ? t({ id: 'common.entityOps.sort.isActive' })
        : undefined;

  const columnTooltip =
    columnOpen && columnProps.hook.isDirty
      ? t({ id: 'common.entityOps.unsavedChanges' })
      : columnProps.hook.isCustomised
        ? t({ id: 'common.entityOps.columns.isCustomised' })
        : undefined;

  return (
    <Space size="small">
      {/* Filter */}
      <Dropdown
        open={filterOpen}
        onOpenChange={handleFilterOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <FilterPanel attrs={filterProps.attrs} hook={filterProps.hook} onClose={closeFilter} />
        )}
      >
        <Tooltip title={filterTooltip}>
          <Button
            icon={<FilterOutlined />}
            type={filterProps.hook.isActive || filterOpen ? 'primary' : 'default'}
            onClick={() => setFilterOpen((v) => !v)}
          >
            {t({ id: 'common.entityOps.filter' })}
          </Button>
        </Tooltip>
      </Dropdown>

      {/* Sort */}
      <Dropdown
        open={sortOpen}
        onOpenChange={handleSortOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <SortPanel attrs={sortProps.attrs} hook={sortProps.hook} onClose={closeSort} />
        )}
      >
        <Tooltip title={sortTooltip}>
          <Button
            icon={<SortAscendingOutlined />}
            type={sortProps.hook.isActive || sortOpen ? 'primary' : 'default'}
            onClick={() => setSortOpen((v) => !v)}
          >
            {t({ id: 'common.entityOps.sort' })}
          </Button>
        </Tooltip>
      </Dropdown>

      {/* Columns */}
      <Dropdown
        open={columnOpen}
        onOpenChange={handleColumnOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <ColumnPanel hook={columnProps.hook} onClose={closeColumn} />
        )}
      >
        <Tooltip title={columnTooltip}>
          <Button
            icon={<TableOutlined />}
            type={columnProps.hook.isCustomised || columnOpen ? 'primary' : 'default'}
            onClick={() => setColumnOpen((v) => !v)}
          >
            {t({ id: 'common.entityOps.columns' })}
          </Button>
        </Tooltip>
      </Dropdown>
    </Space>
  );
}
