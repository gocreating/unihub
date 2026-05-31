import { useCallback, useState } from 'react';
import { Badge, Button, Dropdown, Space } from 'antd';
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

  // Controlled open state so we can block closing when a panel is dirty.
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);

  // Cancel + close: discard pending changes and hide the dropdown.
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

  // onOpenChange fires when the user clicks outside or presses Escape.
  // If the panel has unsaved changes, block the close so the user must
  // explicitly click the Cancel button.
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

  return (
    <Space size="small">
      {/* Filter dropdown */}
      <Dropdown
        open={filterOpen}
        onOpenChange={handleFilterOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <FilterPanel attrs={filterProps.attrs} hook={filterProps.hook} onClose={closeFilter} />
        )}
      >
        <Badge dot={filterProps.hook.isActive} offset={[-4, 4]}>
          <Button
            icon={<FilterOutlined />}
            type={filterProps.hook.isActive ? 'primary' : 'default'}
            onClick={() => setFilterOpen((v) => !v)}
          >
            {t({ id: 'common.entityOps.filter' })}
          </Button>
        </Badge>
      </Dropdown>

      {/* Sort dropdown */}
      <Dropdown
        open={sortOpen}
        onOpenChange={handleSortOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <SortPanel attrs={sortProps.attrs} hook={sortProps.hook} onClose={closeSort} />
        )}
      >
        <Badge dot={sortProps.hook.isActive} offset={[-4, 4]}>
          <Button
            icon={<SortAscendingOutlined />}
            type={sortProps.hook.isActive ? 'primary' : 'default'}
            onClick={() => setSortOpen((v) => !v)}
          >
            {t({ id: 'common.entityOps.sort' })}
          </Button>
        </Badge>
      </Dropdown>

      {/* Columns dropdown */}
      <Dropdown
        open={columnOpen}
        onOpenChange={handleColumnOpenChange}
        trigger={['click']}
        dropdownRender={() => (
          <ColumnPanel hook={columnProps.hook} onClose={closeColumn} />
        )}
      >
        <Badge dot={columnProps.hook.isCustomised} offset={[-4, 4]}>
          <Button
            icon={<TableOutlined />}
            onClick={() => setColumnOpen((v) => !v)}
          >
            {t({ id: 'common.entityOps.columns' })}
          </Button>
        </Badge>
      </Dropdown>
    </Space>
  );
}
