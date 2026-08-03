/**
 * ViewTabs — the view-control row above the entity toolbar (016, round 3):
 *
 *   _Tab1_  Tab2  Tab3 …                                        [⋮]
 *
 * The tab strip scrolls horizontally with NO visible scrollbar; an edge shadow
 * appears on each side that has tabs scrolled out of view (FR-020/SC-009).
 * Tabs drag to reorder through the shared horizontal SortableList, and the
 * resulting order persists for saved views (FR-027). Every tab carries its own
 * menu — left-click when active, right-click always (FR-023) — which replaced
 * the round-2 per-tab close button and double-click rename. The kebab at the
 * row's right edge replaced the round-2 "+" and "View ▾" controls.
 *
 * When the table has only its default view the row auto-hides behind a compact
 * reveal affordance carrying the dirty dot (FR-025). Rendered inside
 * PageTable's `viewBar` slot.
 *
 * Round 4: naming happens ONLY in the Rename dialog (the round-3 inline input
 * and the "Save view" prompt are gone), and an open tab menu dismisses on an
 * outside click or Esc — the Dropdown is controlled with `trigger={[]}` so
 * rc-trigger wires no dismissal of its own (R36).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Tooltip, message } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useIntl } from 'react-intl';
import { OverflowTooltip } from '../OverflowTooltip';
import { SortableList } from '../EntityToolbar/SortableList';
import { RenameViewModal } from './RenameViewModal';
import { ViewKebab } from './ViewKebab';
import { ViewTabMenu } from './ViewTabMenu';
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
  stripWrap: {
    flex: '0 1 auto',
    minWidth: 0,
    position: 'relative',
  },
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    overflowX: 'auto',
    // The scrollbar is replaced by edge shadows (FR-020) — hide it everywhere.
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    '&::-webkit-scrollbar': {
      display: 'none',
    },
  },
  shadow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 16,
    pointerEvents: 'none',
  },
  shadowLeft: {
    left: 0,
    background: `linear-gradient(to right, ${token.colorSplit}, transparent)`,
  },
  shadowRight: {
    right: 0,
    background: `linear-gradient(to left, ${token.colorSplit}, transparent)`,
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
  kebab: {
    flex: 'none',
  },
}));

/** Which sides of a horizontally scrollable element have content out of view. */
// eslint-disable-next-line react-refresh/only-export-components
export function overflowSides(el: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): { left: boolean; right: boolean } {
  return {
    left: el.scrollLeft > 1,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
  };
}

export interface ViewTabsProps {
  views: UseEntityViewsReturn;
}

export function ViewTabs({ views }: ViewTabsProps) {
  const { styles, cx } = useStyles();
  const { formatMessage: t } = useIntl();
  /** The tab the Rename dialog targets (never assume the active one). */
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [menuTabId, setMenuTabId] = useState<string | null>(null);
  const [shadows, setShadows] = useState({ left: false, right: false });
  const stripRef = useRef<HTMLDivElement | null>(null);

  const displayName = useCallback(
    (tab: ViewTabState): string => {
      if (tab.kind === 'default') {
        return tab.name || t({ id: 'common.entityViews.defaultTable' });
      }
      return tab.name || t({ id: 'common.entityViews.newViewName' });
    },
    [t],
  );

  const syncShadows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setShadows((prev) => {
      const next = overflowSides(el);
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, []);

  useLayoutEffect(syncShadows, [syncShadows, views.tabs, views.collapsed]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncShadows);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncShadows, views.collapsed]);

  const renameTarget = views.tabs.find((tab) => tab.tabId === renameTabId);

  const commitRename = async (name: string) => {
    if (!renameTabId) return;
    try {
      await views.renameTab(renameTabId, name);
      setRenameTabId(null);
    } catch (err) {
      message.error(t({ id: 'common.entityViews.renameError' }));
      throw err; // keep the dialog open so the user can retry
    }
  };

  // Dismiss an open tab menu on an outside click or Esc (FR-023/R36).
  useEffect(() => {
    if (!menuTabId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.ant-dropdown') || target?.closest('[role="tab"]')) return;
      setMenuTabId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuTabId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuTabId]);

  const sortableItems = useMemo(
    () => views.tabs.map((tab) => ({ id: tab.tabId, tab })),
    [views.tabs],
  );

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
      <div className={styles.stripWrap}>
        <div
          className={styles.strip}
          role="tablist"
          data-testid="view-tabs-strip"
          ref={stripRef}
          onScroll={syncShadows}
        >
          <SortableList
            items={sortableItems}
            orientation="horizontal"
            onReorder={(next) => {
              void views.reorderTabs(next.map((item) => item.id));
            }}
            renderItem={({ tab }, handleProps) => {
              const active = tab.tabId === views.activeTabId;
              return (
                <ViewTabMenu
                  tab={tab}
                  views={views}
                  open={menuTabId === tab.tabId}
                  onOpenChange={(open) => setMenuTabId(open ? tab.tabId : null)}
                  displayName={displayName(tab)}
                  onRename={(target) => setRenameTabId(target.tabId)}
                >
                  <button
                    type="button"
                    // Drag props FIRST: dnd-kit sets role="button", which must
                    // not win over the tab semantics below.
                    {...handleProps}
                    role="tab"
                    aria-selected={active}
                    className={cx(styles.tab, active && styles.tabActive)}
                    onClick={() => {
                      // Left-click switches to an inactive tab; on the active
                      // tab it opens that tab's menu (FR-023).
                      if (active) setMenuTabId((prev) => (prev === tab.tabId ? null : tab.tabId));
                      else views.switchTab(tab.tabId);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuTabId(tab.tabId);
                    }}
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
                  </button>
                </ViewTabMenu>
              );
            }}
          />
        </div>
        {shadows.left && (
          <span
            className={cx(styles.shadow, styles.shadowLeft)}
            data-testid="view-tabs-shadow-left"
          />
        )}
        {shadows.right && (
          <span
            className={cx(styles.shadow, styles.shadowRight)}
            data-testid="view-tabs-shadow-right"
          />
        )}
      </div>

      <div className={styles.spacer} />

      <div className={styles.kebab}>
        <ViewKebab views={views} />
      </div>

      <RenameViewModal
        open={renameTabId !== null}
        currentName={renameTarget ? displayName(renameTarget) : ''}
        onCancel={() => setRenameTabId(null)}
        onRename={commitRename}
      />
    </div>
  );
}
