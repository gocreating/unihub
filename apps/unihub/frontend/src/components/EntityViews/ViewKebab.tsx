/**
 * ViewKebab — the single control at the right edge of the view row (016
 * round 3). It replaces BOTH the round-2 "+" button and the "View ▾" dropdown:
 *
 *   Add empty view
 *   Open              ▸  (saved views not currently open as tabs)
 *
 * EVERY per-view action (save, pin, set as default, rename, delete, reorder)
 * lives on the view's own tab — see ViewTabMenu. A view that is not open is
 * managed by opening it from "Open" first; round 4 removed the separate
 * management modal (FR-017). The dropdown right-aligns to the trigger and
 * scrolls internally so it never overflows the viewport (constitution VI).
 */
import { useMemo } from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntityViewsReturn } from './useEntityViews';

export interface ViewKebabProps {
  views: UseEntityViewsReturn;
}

export function ViewKebab({ views }: ViewKebabProps) {
  const { formatMessage: t } = useIntl();

  const items = useMemo<NonNullable<MenuProps['items']>>(() => {
    const openViewIds = new Set(
      views.tabs.map((tab) => tab.viewId).filter((id): id is string => !!id),
    );
    const notOpen = views.savedViews.filter((view) => !openViewIds.has(view.id));
    const children =
      notOpen.length > 0
        ? notOpen.map((view) => ({ key: `open:${view.id}`, label: view.name }))
        : [
            {
              key: 'none',
              label: t({ id: 'common.entityViews.noViewsToOpen' }),
              disabled: true,
            },
          ];
    return [
      { key: 'add', label: t({ id: 'common.entityViews.addEmptyView' }) },
      { key: 'open', label: t({ id: 'common.entityViews.open' }), children },
    ];
  }, [views.tabs, views.savedViews, t]);

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('open:')) {
      views.openView(key.slice('open:'.length));
      return;
    }
    if (key === 'add') views.addBlankTab();
  };

  return (
    <Dropdown
      trigger={['click']}
      menu={{ items, onClick, style: { maxHeight: '60vh', overflowY: 'auto' } }}
      placement="bottomRight"
    >
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined />}
        aria-label={t({ id: 'common.entityViews.viewMenu' })}
      />
    </Dropdown>
  );
}
