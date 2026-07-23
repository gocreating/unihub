/**
 * ViewTabs — the view-control row above the entity toolbar (016, round 2):
 *
 *   _Tab1_  Tab2  Tab3 … [+]                [View ▾]
 *
 * The tab strip scrolls horizontally when it overflows; the "+" button sits
 * immediately AFTER the rightmost tab and stays always visible (outside the
 * scrolling strip — FR-009/FR-020); the View control is fixed at the right
 * edge. When the table has only its default view, the row auto-hides behind a
 * compact reveal affordance carrying the dirty dot (FR-025). Double-clicking
 * a tab starts the edit-name flow (FR-023). Rendered inside PageTable's
 * `viewBar` slot.
 */
import { useState } from 'react';
import { Badge, Button, Input, Tooltip, message } from 'antd';
import { CloseOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useIntl } from 'react-intl';
import { OverflowTooltip } from '../OverflowTooltip';
import { SaveViewModal } from './SaveViewModal';
import { ViewDropdown } from './ViewDropdown';
import { ManageViewsModal } from './ManageViewsModal';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';

const useStyles = createStyles(({ token }) => ({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: token.marginXXS,
  },
  collapsedRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  strip: {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'stretch',
    overflowX: 'auto',
    scrollbarWidth: 'thin',
  },
  addButton: {
    flex: 'none',
  },
  spacer: {
    flex: 1,
  },
  tab: {
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.marginXXS,
    maxWidth: 220,
    padding: '8px 12px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    color: token.colorText,
    fontSize: token.fontSize,
  },
  tabActive: {
    color: token.colorPrimary,
    borderBottomColor: token.colorPrimary,
  },
  dirtyDot: {
    flex: 'none',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: token.colorPrimary,
  },
  closeButton: {
    flex: 'none',
    display: 'inline-flex',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: token.colorTextTertiary,
    fontSize: 10,
    '&:hover': {
      color: token.colorText,
    },
  },
  renameInput: {
    width: 140,
  },
  viewControl: {
    flex: 'none',
  },
}));

export interface ViewTabsProps {
  views: UseEntityViewsReturn;
}

export function ViewTabs({ views }: ViewTabsProps) {
  const { styles, cx } = useStyles();
  const { formatMessage: t } = useIntl();
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const displayName = (tab: ViewTabState): string => {
    if (tab.kind === 'default') {
      return tab.name || t({ id: 'common.entityViews.defaultTable' });
    }
    return tab.name || t({ id: 'common.entityViews.newViewName' });
  };

  const startRename = (tab: ViewTabState) => {
    if (tab.kind === 'anonymous') {
      // Naming an anonymous tab IS saving it (FR-014/FR-023).
      setSaveModalOpen(true);
      return;
    }
    setEditingTabId(tab.tabId);
    setEditingValue(displayName(tab));
  };

  const commitRename = async (tab: ViewTabState) => {
    const name = editingValue.trim();
    if (!name || name === displayName(tab)) {
      setEditingTabId(null);
      return;
    }
    try {
      await views.renameTab(tab.tabId, name);
      setEditingTabId(null);
    } catch (err) {
      const e = err as { status?: number; body?: { name?: unknown } };
      message.error(
        t({
          id:
            e.status === 400 && e.body?.name
              ? 'common.entityViews.duplicateName'
              : 'common.entityViews.renameError',
        }),
      );
      // Keep the input open so the user can adjust the name.
    }
  };

  if (views.collapsed) {
    return (
      <div className={styles.collapsedRow} data-testid="view-tabs-collapsed">
        <Tooltip title={t({ id: 'common.entityViews.showViews' })}>
          <Badge dot={views.activeTab.dirty} data-testid="view-reveal-badge">
            <Button
              type="text"
              size="small"
              icon={<TableOutlined />}
              aria-label={t({ id: 'common.entityViews.showViews' })}
              onClick={views.reveal}
            />
          </Badge>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={styles.row} data-testid="view-tabs-row">
      <div className={styles.strip} role="tablist" data-testid="view-tabs-strip">
        {views.tabs.map((tab) => {
          const active = tab.tabId === views.activeTabId;
          const editing = tab.tabId === editingTabId;
          return (
            <button
              key={tab.tabId}
              type="button"
              role="tab"
              aria-selected={active}
              className={cx(styles.tab, active && styles.tabActive)}
              onClick={() => {
                if (!editing) views.switchTab(tab.tabId);
              }}
              onDoubleClick={() => {
                if (!editing) startRename(tab);
              }}
            >
              {editing ? (
                <Input
                  className={styles.renameInput}
                  size="small"
                  autoFocus
                  value={editingValue}
                  aria-label={t({ id: 'common.entityViews.viewName' })}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onPressEnter={() => void commitRename(tab)}
                  onBlur={() => void commitRename(tab)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditingTabId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <OverflowTooltip title={displayName(tab)} style={{ maxWidth: 160 }}>
                  {displayName(tab)}
                </OverflowTooltip>
              )}
              {!editing && tab.dirty && (
                <span
                  className={styles.dirtyDot}
                  aria-label={t({ id: 'common.entityViews.unsaved' })}
                />
              )}
              {!editing && tab.closable && (
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.closeButton}
                  aria-label={t({ id: 'common.entityViews.close' })}
                  onClick={(e) => {
                    e.stopPropagation();
                    views.closeTab(tab.tabId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      views.closeTab(tab.tabId);
                    }
                  }}
                >
                  <CloseOutlined />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Button
        className={styles.addButton}
        type="text"
        size="small"
        icon={<PlusOutlined />}
        aria-label={t({ id: 'common.entityViews.newTab' })}
        onClick={views.addAnonymousTab}
      />

      <div className={styles.spacer} />

      <div className={styles.viewControl}>
        <ViewDropdown
          views={views}
          onNeedsName={() => setSaveModalOpen(true)}
          onOpenManage={() => setManageOpen(true)}
          activeDisplayName={displayName(views.activeTab)}
        />
      </div>

      <SaveViewModal
        open={saveModalOpen}
        onCancel={() => setSaveModalOpen(false)}
        onSave={async (name) => {
          try {
            await views.saveActiveTabAs(name);
          } catch (err) {
            const e = err as { status?: number; body?: { name?: unknown } };
            if (!(e.status === 400 && e.body?.name)) {
              message.error(t({ id: 'common.entityViews.saveError' }));
            }
            throw err;
          }
          setSaveModalOpen(false);
        }}
      />

      <ManageViewsModal open={manageOpen} views={views} onClose={() => setManageOpen(false)} />
    </div>
  );
}
