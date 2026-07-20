/**
 * ViewDropdown — the right-edge "View" control of the tab row (016).
 * Menu: saved views to open · Save (enabled while anything is dirty) ·
 * Duplicate · Edit… (manage modal). The list body constrains to the viewport
 * (maxHeight 60vh, internal scroll — constitution Principle VI).
 */
import { useMemo } from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntityViewsReturn } from './useEntityViews';

export interface ViewDropdownProps {
  views: UseEntityViewsReturn;
  /** Save chosen but the active tab has no name yet → open SaveViewModal. */
  onNeedsName: () => void;
  onOpenManage: () => void;
  /** The active tab's rendered display name (for duplicate suffixing). */
  activeDisplayName: string;
}

export function ViewDropdown({
  views,
  onNeedsName,
  onOpenManage,
  activeDisplayName,
}: ViewDropdownProps) {
  const { formatMessage: t } = useIntl();

  const items = useMemo<NonNullable<MenuProps['items']>>(() => {
    const savedItems =
      views.savedViews.length > 0
        ? views.savedViews.map((view) => ({
            key: `open:${view.id}`,
            label: view.name,
          }))
        : [{ key: 'none', label: t({ id: 'common.entityViews.noSaved' }), disabled: true }];
    return [
      {
        type: 'group' as const,
        label: t({ id: 'common.entityViews.savedList' }),
        children: savedItems,
      },
      { type: 'divider' as const },
      { key: 'save', label: t({ id: 'common.entityViews.save' }), disabled: !views.isAnyDirty },
      { key: 'duplicate', label: t({ id: 'common.entityViews.duplicate' }) },
      { key: 'edit', label: t({ id: 'common.entityViews.edit' }) },
    ];
  }, [views.savedViews, views.isAnyDirty, t]);

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('open:')) {
      views.openView(key.slice('open:'.length));
      return;
    }
    if (key === 'save') {
      void views.saveActiveTab().then((outcome) => {
        if (outcome === 'needs-name') onNeedsName();
      });
      return;
    }
    if (key === 'duplicate') {
      views.duplicateActiveTab(activeDisplayName);
      return;
    }
    if (key === 'edit') onOpenManage();
  };

  return (
    <Dropdown
      trigger={['click']}
      menu={{ items, onClick, style: { maxHeight: '60vh', overflowY: 'auto' } }}
      placement="bottomRight"
    >
      <Button size="small" type="text">
        {t({ id: 'common.entityViews.view' })} <DownOutlined />
      </Button>
    </Dropdown>
  );
}
