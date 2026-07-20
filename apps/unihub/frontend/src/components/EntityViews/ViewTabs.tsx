/**
 * ViewTabs — the view-control row above the entity toolbar (016):
 *
 *   [+]  _Tab1_  Tab2  Tab3 …            [View ▾]
 *
 * "+" is fixed at the left edge, the tab strip scrolls horizontally in the
 * middle (narrow screens — FR-020), and the View control is fixed at the
 * right edge. Rendered inside PageTable's `viewBar` slot.
 */
import { useState } from 'react';
import { Button, message } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
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
  addButton: {
    flex: 'none',
  },
  strip: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'stretch',
    overflowX: 'auto',
    scrollbarWidth: 'thin',
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

  const displayName = (tab: ViewTabState): string => {
    if (tab.kind === 'default') return t({ id: 'common.entityViews.tabular' });
    return tab.name || t({ id: 'common.entityViews.newViewName' });
  };

  return (
    <div className={styles.row} data-testid="view-tabs-row">
      <Button
        className={styles.addButton}
        type="text"
        size="small"
        icon={<PlusOutlined />}
        aria-label={t({ id: 'common.entityViews.newTab' })}
        onClick={views.addAnonymousTab}
      />

      <div className={styles.strip} role="tablist" data-testid="view-tabs-strip">
        {views.tabs.map((tab) => {
          const active = tab.tabId === views.activeTabId;
          return (
            <button
              key={tab.tabId}
              type="button"
              role="tab"
              aria-selected={active}
              className={cx(styles.tab, active && styles.tabActive)}
              onClick={() => views.switchTab(tab.tabId)}
            >
              <OverflowTooltip title={displayName(tab)} style={{ maxWidth: 160 }}>
                {displayName(tab)}
              </OverflowTooltip>
              {tab.dirty && (
                <span
                  className={styles.dirtyDot}
                  aria-label={t({ id: 'common.entityViews.unsaved' })}
                />
              )}
              {tab.closable && (
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

      <ManageViewsModal
        open={manageOpen}
        views={views}
        onClose={() => setManageOpen(false)}
      />
    </div>
  );
}
