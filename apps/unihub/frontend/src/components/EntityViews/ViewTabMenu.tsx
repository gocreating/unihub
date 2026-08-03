/**
 * ViewTabMenu — the per-tab dropdown of the view row (016 round 3, FR-023).
 *
 * Opened by left-clicking the tab while it is ACTIVE, or by right-clicking any
 * tab; `ViewTabs` owns the open state so only one menu shows at a time. Actions
 * that cannot apply to the tab render DISABLED rather than hidden, so the menu
 * keeps a stable shape and communicates why an action is unavailable
 * (data-model.md §7 carries the full matrix).
 *
 * Rename delegates back to the caller — the inline input lives on the tab —
 * and Save reports "needs a name" so the caller can open SaveViewModal for
 * THIS tab (never the active one).
 */
import { useMemo } from 'react';
import { Dropdown, Modal, message } from 'antd';
import type { MenuProps } from 'antd';
import { useIntl } from 'react-intl';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';

export interface ViewTabMenuProps {
  tab: ViewTabState;
  views: UseEntityViewsReturn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tab's rendered label (used for duplicate suffixing + confirmations). */
  displayName: string;
  /** Start the edit-name flow for this tab (inline input / name-and-save). */
  onRename: (tab: ViewTabState) => void;
  /** Save needs a name first — open SaveViewModal bound to this tab. */
  onNeedsName: (tabId: string) => void;
  children: React.ReactNode;
}

export function ViewTabMenu({
  tab,
  views,
  open,
  onOpenChange,
  displayName,
  onRename,
  onNeedsName,
  children,
}: ViewTabMenuProps) {
  const { formatMessage: t } = useIntl();
  const [modal, modalHolder] = Modal.useModal();

  const isSaved = tab.kind === 'saved' && !!tab.viewId;
  const canPin = isSaved && !tab.isDefault;
  const canDelete = isSaved && !tab.isDefault;

  const items = useMemo<NonNullable<MenuProps['items']>>(
    () => [
      { key: 'save', label: t({ id: 'common.entityViews.save' }), disabled: !tab.dirty },
      { type: 'divider' as const },
      { key: 'close', label: t({ id: 'common.entityViews.close' }), disabled: !tab.closable },
      { key: 'duplicate', label: t({ id: 'common.entityViews.duplicate' }) },
      {
        key: 'pin',
        label: t({ id: tab.pinned ? 'common.entityViews.unpin' : 'common.entityViews.pin' }),
        disabled: !canPin,
      },
      {
        key: 'set-default',
        label: t({ id: 'common.entityViews.setDefault' }),
        disabled: !isSaved || tab.isDefault,
      },
      { key: 'rename', label: t({ id: 'common.entityViews.rename' }) },
      { type: 'divider' as const },
      {
        key: 'delete',
        label: t({ id: 'common.entityViews.delete' }),
        danger: canDelete,
        disabled: !canDelete,
      },
    ],
    [tab.dirty, tab.closable, tab.pinned, tab.isDefault, isSaved, canPin, canDelete, t],
  );

  const confirmDelete = () => {
    modal.confirm({
      title: t({ id: 'common.entityViews.deleteConfirmTitle' }, { n: 1 }),
      content: t({ id: 'common.entityViews.deleteConfirmBody' }, { n: 1 }),
      okText: t({ id: 'common.entityViews.delete' }),
      okType: 'danger',
      onOk: () => views.deleteTab(tab.tabId),
    });
  };

  const onClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    onOpenChange(false);
    switch (key) {
      case 'save':
        void views.saveTab(tab.tabId).then((outcome) => {
          if (outcome === 'needs-name') onNeedsName(tab.tabId);
        });
        return;
      case 'close':
        views.closeTab(tab.tabId);
        return;
      case 'duplicate':
        views.duplicateTab(tab.tabId, displayName);
        return;
      case 'pin':
        void views.pinTab(tab.tabId, !tab.pinned);
        return;
      case 'set-default':
        void views.setDefaultTab(tab.tabId).catch(() => {
          // The hook already surfaced a translated error.
        });
        return;
      case 'rename':
        onRename(tab);
        return;
      case 'delete':
        confirmDelete();
        return;
      default:
        message.error(t({ id: 'common.entityViews.saveError' }));
    }
  };

  return (
    <>
      <Dropdown
        open={open}
        onOpenChange={onOpenChange}
        trigger={[]} // opening is driven by the tab's own click/contextmenu
        menu={{ items, onClick, style: { maxHeight: '60vh', overflowY: 'auto' } }}
        placement="bottomLeft"
      >
        {children}
      </Dropdown>
      {modalHolder}
    </>
  );
}
