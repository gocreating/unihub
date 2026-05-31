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

  return (
    <Space size="small">
      {/* Filter dropdown */}
      <Dropdown
        trigger={['click']}
        dropdownRender={() => (
          <FilterPanel attrs={filterProps.attrs} hook={filterProps.hook} />
        )}
        onOpenChange={(open) => {
          if (!open) filterProps.hook.cancel();
        }}
      >
        <Badge dot={filterProps.hook.isActive} offset={[-4, 4]}>
          <Button
            icon={<FilterOutlined />}
            type={filterProps.hook.isActive ? 'primary' : 'default'}
          >
            {t({ id: 'common.entityOps.filter' })}
          </Button>
        </Badge>
      </Dropdown>

      {/* Sort dropdown */}
      <Dropdown
        trigger={['click']}
        dropdownRender={() => (
          <SortPanel attrs={sortProps.attrs} hook={sortProps.hook} />
        )}
        onOpenChange={(open) => {
          if (!open) sortProps.hook.cancel();
        }}
      >
        <Badge dot={sortProps.hook.isActive} offset={[-4, 4]}>
          <Button
            icon={<SortAscendingOutlined />}
            type={sortProps.hook.isActive ? 'primary' : 'default'}
          >
            {t({ id: 'common.entityOps.sort' })}
          </Button>
        </Badge>
      </Dropdown>

      {/* Columns dropdown */}
      <Dropdown
        trigger={['click']}
        dropdownRender={() => (
          <ColumnPanel hook={columnProps.hook} />
        )}
        onOpenChange={(open) => {
          if (!open) columnProps.hook.cancel();
        }}
      >
        <Badge dot={columnProps.hook.isCustomised} offset={[-4, 4]}>
          <Button icon={<TableOutlined />}>
            {t({ id: 'common.entityOps.columns' })}
          </Button>
        </Badge>
      </Dropdown>
    </Space>
  );
}
