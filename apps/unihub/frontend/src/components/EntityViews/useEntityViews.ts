/**
 * useEntityViews — tab/view orchestration for entity tables (016, round 2).
 *
 * Owns: the open-tab list (default tab + saved + anonymous tabs), the active
 * tab, saved-view fetching, per-tab dirty computation, the view-row collapse
 * state (FR-025), and all view mutations. The ACTIVE tab's config is always
 * the table's live state (`table.snapshotConfig()`); inactive tabs hold their
 * last-known snapshot.
 *
 * Round 2: the default tab is a PLAIN view — its first save or rename
 * materializes an `is_default` EntityView row (page-provided initial name,
 * e.g. the catalog's "YTD"); once materialized, the stored row is the tab's
 * name/config/baseline. URL state uses the readable per-facet params
 * (`<tableKey>.view=<name>` / `.f` / `.sort` / `.cols` / `.size` / `.page`).
 *
 * Staged-mutation rule: nothing here writes to the API except the explicit
 * save/save-as/rename/duplicate-commit/manage-commit entry points.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { message } from 'antd';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEntityView,
  deleteEntityView,
  listEntityViews,
  reorderEntityViews,
  updateEntityView,
} from '@/services/unihub-backend/core';
import type { EntityView, EntityViewPatch } from '@/services/unihub-backend/core';
import type { UseEntityTableReturn } from '../EntityToolbar/useEntityTable';
import type { ViewConfig } from '../EntityToolbar/types';
import {
  buildSearchString,
  columnsFromVisibleKeys,
  columnsToken,
  configsEqual,
  facetParam,
  hasViewParams,
  parseViewParams,
  serializeInlineEntries,
  serializeSavedEntries,
  upgradeConfigShape,
} from './serialization';
import type { ParsedViewState } from './serialization';
import { DEFAULT_TAB_ID, useViewTabsState } from './useViewTabsState';
import type { InternalTab, InternalTabKind } from './useViewTabsState';

const uid = () => crypto.randomUUID();

const FACETS = ['view', 'f', 'sort', 'cols', 'size', 'page'] as const;

export { DEFAULT_TAB_ID };

export type TabKind = InternalTabKind;

export interface ViewTabState {
  tabId: string;
  kind: TabKind;
  viewId?: string;
  /** Display name — empty string means "unnamed" (render a localized fallback). */
  name: string;
  dirty: boolean;
  pinned: boolean;
  closable: boolean;
  /** True for the tab holding the table's default role — the guaranteed
   *  fallback: never closable, never deletable, always pinned (FR-003). */
  isDefault: boolean;
}

/** Staged output of the manage-views modal, committed in one call. */
export interface ManageChanges {
  /** Desired remaining views in final display order with staged name/pin. */
  items: { id: string; name: string; pinned: boolean }[];
  deletedIds: string[];
}

export interface UseEntityViewsOptions {
  tableKey: string;
  table: UseEntityTableReturn;
  /** The page's default config — the virtual default tab's baseline. */
  defaultConfig: ViewConfig;
  /** Page-provided initial name of the default view (e.g. catalog "YTD").
   *  Falls back to the localized generic "Table". */
  defaultViewName?: string;
}

export interface UseEntityViewsReturn {
  tabs: ViewTabState[];
  activeTabId: string;
  activeTab: ViewTabState;
  savedViews: EntityView[];
  /** True when any open view has unsaved changes (drives the Save action). */
  isAnyDirty: boolean;
  /** FR-025: the view row is auto-hidden (only the default view/tab exists). */
  collapsed: boolean;
  /** Reveal the auto-hidden view row for the rest of the session. */
  reveal: () => void;
  switchTab: (tabId: string) => void;
  addAnonymousTab: () => void;
  closeTab: (tabId: string) => void;
  openView: (viewId: string) => void;
  /** Persist ONE tab (round 3 — a right-click menu can target an inactive tab):
   *  saved views PATCH in place; the default tab materializes (or PATCHes) its
   *  `is_default` row; anonymous tabs need a name first (`'needs-name'` → open
   *  the SaveViewModal for THAT tab). */
  saveTab: (tabId: string) => Promise<'saved' | 'needs-name'>;
  /** Create a new saved view from the given tab's config under `name`. */
  saveTabAs: (tabId: string, name: string) => Promise<void>;
  /** Rename a saved or default tab in place (menu Rename, FR-023).
   *  Renaming the virtual default materializes it. Rejections rethrow. */
  renameTab: (tabId: string, name: string) => Promise<void>;
  /** Duplicate one tab into an unsaved tab named "X (1)", "X (2)", …
   *  `baseName` is the rendered display name (the hook doesn't localize). */
  duplicateTab: (tabId: string, baseName?: string) => void;
  /** Pin/unpin the saved view behind a tab (FR-017). */
  pinTab: (tabId: string, pinned: boolean) => Promise<void>;
  /** Transfer the table's default role to this tab's saved view (FR-026). */
  setDefaultTab: (tabId: string) => Promise<void>;
  /** Delete this tab's saved view; the tab lives on as anonymous (FR-019). */
  deleteTab: (tabId: string) => Promise<void>;
  /** Apply a dragged tab order and persist it for saved views (FR-027). */
  reorderTabs: (orderedTabIds: string[]) => Promise<void>;
  commitManageChanges: (changes: ManageChanges) => Promise<void>;
}

/** Coerce a server-stored (unknown-shaped) config into a full v2 ViewConfig,
 *  upgrading v1 shapes and falling back facet-wise to the table defaults. */
export function coerceConfig(raw: unknown, defaults: ViewConfig): ViewConfig {
  const r = (upgradeConfigShape(raw) ?? {}) as Partial<ViewConfig>;
  return {
    filters: Array.isArray(r.filters) ? r.filters : defaults.filters,
    sort: Array.isArray(r.sort) ? r.sort : defaults.sort,
    columns: Array.isArray(r.columns) && r.columns.length > 0 ? r.columns : defaults.columns,
    pageSize: typeof r.pageSize === 'number' ? r.pageSize : defaults.pageSize,
  };
}

/** Reconcile a stored config against the CURRENT column universe (FR-021):
 *  stale column keys dropped (their pins with them), missing runtime columns
 *  appended with their default visibility/pin. Keeps dirty comparisons
 *  drift-free (baseline and live snapshot pass through the same path). */
export function reconcileConfig(config: ViewConfig, defaults: ViewConfig): ViewConfig {
  const byKey = new Map(defaults.columns.map((c) => [c.key, c]));
  const listed = [...config.columns]
    .sort((a, b) => a.order - b.order)
    .filter((c) => byKey.has(c.key));
  const listedKeys = new Set(listed.map((c) => c.key));
  const appended = defaults.columns.filter((c) => !listedKeys.has(c.key));
  return {
    ...config,
    columns: [
      ...listed.map((c, i) => ({ key: c.key, visible: c.visible, order: i, pin: c.pin })),
      ...appended.map((c, i) => ({
        key: c.key,
        visible: c.visible,
        order: listed.length + i,
        pin: c.pin,
      })),
    ],
  };
}

/** Facet-whole differences of `current` against `baseline` (URL overrides). */
function facetOverrides(current: ViewConfig, baseline: ViewConfig): Partial<ViewConfig> {
  const overrides: Partial<ViewConfig> = {};
  if (JSON.stringify(current.filters) !== JSON.stringify(baseline.filters)) {
    overrides.filters = current.filters;
  }
  if (JSON.stringify(current.sort) !== JSON.stringify(baseline.sort)) {
    overrides.sort = current.sort;
  }
  if (columnsToken(current.columns) !== columnsToken(baseline.columns)) {
    overrides.columns = current.columns;
  }
  if (current.pageSize !== baseline.pageSize) overrides.pageSize = current.pageSize;
  return overrides;
}

export function useEntityViews({
  tableKey,
  table,
  defaultConfig,
  defaultViewName,
}: UseEntityViewsOptions): UseEntityViewsReturn {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const queryKey = ['core', 'entity-views', tableKey];
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isViewParamKey = useCallback(
    (key: string): boolean =>
      key === `view[${tableKey}]` || FACETS.some((facet) => key === facetParam(tableKey, facet)),
    [tableKey],
  );
  const viewEntriesOf = useCallback(
    (params: URLSearchParams): [string, string][] =>
      [...params.entries()].filter(([key]) => isViewParamKey(key) && !key.startsWith('view[')),
    [isViewParamKey],
  );

  // The entries last written by us — used to skip the echo of our own
  // outbound writes.
  const lastParamRef = useRef<string | null>(null);
  // The last inbound value fully processed (applied or rejected). Never reset
  // by outbound writes — otherwise clearing the params re-arms the inbound
  // effect for the same stale value and the two effects ping-pong forever.
  const lastProcessedRef = useRef<string | null>(null);
  // Outbound stays quiet until an inbound param (if any) has been applied.
  const inboundSettledRef = useRef(false);

  const { tabs, setTabs, activeTabId, setActiveTabId, revealed, setRevealed } = useViewTabsState(
    tableKey,
    defaultConfig,
  );

  const {
    data: savedViews = [],
    isError,
    isFetched,
  } = useQuery({
    queryKey,
    queryFn: () => listEntityViews(tableKey),
  });

  useEffect(() => {
    if (isError) message.error(t({ id: 'common.entityViews.loadError' }));
  }, [isError, t]);

  const viewById = useCallback(
    (viewId: string | undefined): EntityView | undefined =>
      viewId ? savedViews.find((v) => v.id === viewId) : undefined,
    [savedViews],
  );

  // The materialized default view, when one exists (round 2, FR-003).
  const defaultView = useMemo(() => savedViews.find((v) => v.is_default), [savedViews]);
  const defaultBaseline = useMemo(
    () =>
      defaultView
        ? reconcileConfig(coerceConfig(defaultView.config, defaultConfig), defaultConfig)
        : defaultConfig,
    [defaultView, defaultConfig],
  );
  /** The name the default tab renders and materializes under. */
  const defaultDisplayName =
    defaultView?.name ?? defaultViewName ?? t({ id: 'common.entityViews.defaultTable' });

  // Rehydrate the table ONCE from a session-restored active tab (US2): the
  // tab list survives in sessionStorage, but the table hooks boot from page
  // defaults — reload the restored tab's config on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // View params in the URL win over the session-restored tab (US3).
    if (hasViewParams(searchParams, tableKey)) return;
    const active = tabs.find((tab) => tab.tabId === activeTabId);
    if (!active) return;
    if (
      active.tabId !== DEFAULT_TAB_ID ||
      !configsEqual(reconcileConfig(active.config, defaultConfig), defaultConfig)
    ) {
      table.loadConfig(active.config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopt the materialized default view's stored config ONCE per mount when
  // the default tab still sits at pristine page defaults (fresh session): the
  // stored row IS the default tab's identity after materialization (US1).
  const defaultAdoptedRef = useRef(false);
  useEffect(() => {
    if (!isFetched || defaultAdoptedRef.current) return;
    defaultAdoptedRef.current = true;
    if (!defaultView) return;
    if (hasViewParams(searchParams, tableKey)) return; // URL wins
    const active = tabs.find((tab) => tab.tabId === activeTabId);
    if (!active || active.kind !== 'default') return; // session tab wins
    if (!configsEqual(reconcileConfig(active.config, defaultConfig), defaultConfig)) return;
    if (configsEqual(defaultBaseline, defaultConfig)) return; // nothing to adopt
    setTabs((prev) =>
      prev.map((tab) => (tab.tabId === DEFAULT_TAB_ID ? { ...tab, config: defaultBaseline } : tab)),
    );
    table.loadConfig(defaultBaseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, defaultView]);

  // Pinned tabs closed during this session must not bounce back on the next
  // refetch (round 3: every tab except the default holder is closable).
  const closedPinnedRef = useRef<Set<string>>(new Set());

  // Merge pinned views into the tab row (US2) in POSITION order — round 3
  // dropped the always-first default, so the default holder is ordered like
  // any other view; a still-virtual default keeps the leading slot.
  // Identity-stable when nothing changed so refetches don't churn renders.
  useEffect(() => {
    setTabs((prev) => {
      const virtualDefaultTab = savedViews.some((view) => view.is_default)
        ? undefined
        : prev.find((tab) => tab.kind === 'default');
      const byViewId = new Map(prev.filter((tab) => tab.viewId).map((tab) => [tab.viewId!, tab]));
      const defaultTabId =
        prev.find((tab) => tab.kind === 'default')?.tabId ?? DEFAULT_TAB_ID;
      const pinned = savedViews.filter(
        (view) => view.pinned && !closedPinnedRef.current.has(view.id),
      );
      const pinnedTabs = pinned.map((view) => {
        const existing = byViewId.get(view.id);
        if (existing) return existing;
        if (view.is_default) {
          // The materialized default binds to the default tab (round-2 identity).
          const current = prev.find((tab) => tab.tabId === defaultTabId);
          if (current) return current;
        }
        return {
          tabId: uid(),
          kind: 'saved' as const,
          viewId: view.id,
          name: view.name,
          config: reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig),
        };
      });
      const placedIds = new Set(pinnedTabs.map((tab) => tab.tabId));
      const others = prev.filter(
        (tab) => !placedIds.has(tab.tabId) && tab.tabId !== virtualDefaultTab?.tabId,
      );
      const next = virtualDefaultTab
        ? [virtualDefaultTab, ...pinnedTabs, ...others]
        : [...pinnedTabs, ...others];
      if (next.length === 0) return prev;
      const unchanged = next.length === prev.length && next.every((tab, i) => tab === prev[i]);
      return unchanged ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedViews, defaultConfig]);

  // ── Derived tab states ─────────────────────────────────────────────────────

  const currentConfigOf = (tab: InternalTab): ViewConfig =>
    tab.tabId === activeTabId ? table.snapshotConfig() : tab.config;

  const toTabState = (tab: InternalTab): ViewTabState => {
    const view = viewById(tab.viewId);
    let dirty: boolean;
    if (tab.kind === 'anonymous') {
      dirty = true; // inherently unsaved
    } else if (tab.kind === 'default') {
      // Baseline = the materialized default's stored config, else page
      // defaults. Reconcile before comparing — configs may predate async
      // runtime columns (e.g. attr:<id> definitions loading after mount).
      dirty = !configsEqual(
        reconcileConfig(currentConfigOf(tab), defaultConfig),
        reconcileConfig(defaultBaseline, defaultConfig),
      );
    } else if (view) {
      const baseline = reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig);
      dirty = !configsEqual(reconcileConfig(currentConfigOf(tab), defaultConfig), baseline);
    } else {
      dirty = false; // saved list not loaded yet — assume clean
    }
    if (tab.kind === 'default') {
      return {
        tabId: tab.tabId,
        kind: tab.kind,
        viewId: defaultView?.id,
        name: defaultView?.name ?? defaultViewName ?? '',
        dirty,
        pinned: defaultView?.pinned ?? true,
        closable: false,
        isDefault: true,
      };
    }
    const name = tab.kind === 'saved' ? (view?.name ?? tab.name) : tab.name;
    const pinned = view?.pinned ?? false;
    const isDefault = view?.is_default ?? false;
    return {
      tabId: tab.tabId,
      kind: tab.kind,
      viewId: tab.viewId,
      name,
      dirty,
      pinned,
      // FR-018 (round 3): every tab except the default holder is closable —
      // pinned views simply come back next session.
      closable: !isDefault,
      isDefault,
    };
  };

  const tabStates = tabs.map(toTabState);
  const activeTab = tabStates.find((tab) => tab.tabId === activeTabId) ?? tabStates[0]!;
  const isAnyDirty = tabStates.some((tab) => tab.dirty);

  // ── View-row auto-hide (FR-025) ────────────────────────────────────────────

  // Captured ONCE at mount — before any of our own outbound URL writes — so a
  // lone materialized default (which round-trips its config through the URL)
  // is not mistaken for URL-addressed non-default state. A URL that addresses
  // view state AT LOAD forces the row open; later dirtying of the collapsed
  // default keeps it collapsed (the affordance shows the dirty dot instead).
  const initialUrlHadViewStateRef = useRef<boolean | null>(null);
  if (initialUrlHadViewStateRef.current === null) {
    initialUrlHadViewStateRef.current = hasViewParams(searchParams, tableKey);
  }

  const collapsed =
    !revealed &&
    !initialUrlHadViewStateRef.current &&
    tabs.length <= 1 &&
    !savedViews.some((view) => !view.is_default);
  const reveal = useCallback(() => setRevealed(true), [setRevealed]);

  // ── Tab operations (no API writes) ─────────────────────────────────────────

  const snapshotOutgoing = (prev: InternalTab[], snapshot: ViewConfig): InternalTab[] =>
    prev.map((tab) => (tab.tabId === activeTabId ? { ...tab, config: snapshot } : tab));

  const switchTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      const target = tabs.find((tab) => tab.tabId === tabId);
      if (!target) return;
      const snapshot = table.snapshotConfig();
      setTabs((prev) =>
        prev.map((tab) => (tab.tabId === activeTabId ? { ...tab, config: snapshot } : tab)),
      );
      setActiveTabId(tabId);
      table.loadConfig(target.config);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTabId, tabs, table.snapshotConfig, table.loadConfig, setTabs, setActiveTabId],
  );

  const openView = useCallback(
    (viewId: string) => {
      if (defaultView && viewId === defaultView.id) {
        switchTab(DEFAULT_TAB_ID);
        return;
      }
      const existing = tabs.find((tab) => tab.viewId === viewId);
      if (existing) {
        switchTab(existing.tabId);
        return;
      }
      const view = viewById(viewId);
      if (!view) return;
      const config = reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig);
      const snapshot = table.snapshotConfig();
      const tab: InternalTab = { tabId: uid(), kind: 'saved', viewId, name: view.name, config };
      setTabs((prev) => [...snapshotOutgoing(prev, snapshot), tab]);
      setActiveTabId(tab.tabId);
      table.loadConfig(config);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, viewById, defaultView, defaultConfig, activeTabId, table.snapshotConfig, table.loadConfig, switchTab],
  );

  const addAnonymousTab = useCallback(() => {
    const snapshot = table.snapshotConfig();
    const tab: InternalTab = { tabId: uid(), kind: 'anonymous', name: '', config: defaultConfig };
    setTabs((prev) => [...snapshotOutgoing(prev, snapshot), tab]);
    setActiveTabId(tab.tabId);
    table.loadConfig(defaultConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultConfig, activeTabId, table.snapshotConfig, table.loadConfig]);

  const closeTab = useCallback(
    (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.tabId === tabId);
      const tab = tabs[index];
      if (!tab || tab.kind === 'default') return;
      const view = viewById(tab.viewId);
      if (view?.is_default) return; // the guaranteed fallback stays open
      // A closed pinned view must not reappear on the next refetch (it still
      // returns next session — pin state is untouched).
      if (view?.pinned) closedPinnedRef.current.add(view.id);
      setTabs((prev) => prev.filter((item) => item.tabId !== tabId));
      if (activeTabId === tabId) {
        const fallback = tabs[index - 1] ?? tabs.find((item) => item.kind === 'default')!;
        setActiveTabId(fallback.tabId);
        table.loadConfig(fallback.config);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, activeTabId, viewById, table.loadConfig],
  );

  /** The tab's effective config — live table state when it is the active tab. */
  const configOfTab = useCallback(
    (tab: InternalTab): ViewConfig =>
      tab.tabId === activeTabId ? table.snapshotConfig() : tab.config,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTabId, table.snapshotConfig],
  );

  const duplicateTab = useCallback(
    (tabId: string, baseName?: string) => {
      const source = tabs.find((tab) => tab.tabId === tabId);
      if (!source) return;
      const sourceState = tabStates.find((tab) => tab.tabId === tabId);
      const base = baseName || sourceState?.name || 'View';
      const taken = new Set<string>([
        ...savedViews.map((v) => v.name),
        ...tabStates.map((tab) => tab.name),
      ]);
      let n = 1;
      while (taken.has(`${base} (${n})`)) n += 1;
      const snapshot = table.snapshotConfig();
      const tab: InternalTab = {
        tabId: uid(),
        kind: 'anonymous',
        name: `${base} (${n})`,
        config: configOfTab(source),
      };
      setTabs((prev) => [...snapshotOutgoing(prev, snapshot), tab]);
      setActiveTabId(tab.tabId);
      table.loadConfig(tab.config);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, tabStates, activeTabId, savedViews, configOfTab, table.snapshotConfig, table.loadConfig],
  );

  // ── Persistence (the ONLY API writes) ──────────────────────────────────────

  /** Create the `is_default` row for this table (first save/rename). */
  const materializeDefault = useCallback(
    async (name: string, config: ViewConfig): Promise<EntityView> => {
      const created = await createEntityView({
        table_key: tableKey,
        name,
        config: config as unknown as Record<string, unknown>,
        is_default: true,
        pinned: true,
        position: 0,
      });
      queryClient.setQueryData<EntityView[]>(queryKey, (old = []) => [created, ...old]);
      return created;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableKey, queryClient],
  );

  const saveTab = useCallback(async (tabId: string): Promise<'saved' | 'needs-name'> => {
    const active = tabs.find((tab) => tab.tabId === tabId);
    if (!active) return 'needs-name';
    const snapshot = configOfTab(active);
    try {
      if (active.kind === 'default') {
        // Round 2: the default tab saves in place — materializing on first save.
        if (defaultView) {
          const updated = await updateEntityView(defaultView.id, {
            config: snapshot as unknown as Record<string, unknown>,
          });
          queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
            old.map((view) => (view.id === updated.id ? updated : view)),
          );
        } else {
          await materializeDefault(defaultDisplayName, snapshot);
        }
        setTabs((prev) =>
          prev.map((tab) => (tab.tabId === active.tabId ? { ...tab, config: snapshot } : tab)),
        );
        message.success(t({ id: 'common.entityViews.saved' }));
        return 'saved';
      }
      if (active.kind !== 'saved' || !active.viewId) return 'needs-name';
      const updated = await updateEntityView(active.viewId, {
        config: snapshot as unknown as Record<string, unknown>,
      });
      setTabs((prev) =>
        prev.map((tab) => (tab.tabId === active.tabId ? { ...tab, config: snapshot } : tab)),
      );
      queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
        old.map((view) => (view.id === updated.id ? updated : view)),
      );
      message.success(t({ id: 'common.entityViews.saved' }));
      return 'saved';
    } catch (err) {
      message.error(t({ id: 'common.entityViews.saveError' }));
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId, defaultView, defaultDisplayName, materializeDefault, configOfTab, queryClient, t]);

  const saveTabAs = useCallback(
    async (tabId: string, name: string) => {
      const active = tabs.find((tab) => tab.tabId === tabId);
      if (!active) return;
      const snapshot = configOfTab(active);
      const created = await createEntityView({
        table_key: tableKey,
        name,
        config: snapshot as unknown as Record<string, unknown>,
      });
      queryClient.setQueryData<EntityView[]>(queryKey, (old = []) => [...old, created]);
      if (active.kind === 'anonymous') {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.tabId === active.tabId
              ? { ...tab, kind: 'saved', viewId: created.id, name: created.name, config: snapshot }
              : tab,
          ),
        );
      } else {
        // Saving-as from the default (or a saved) tab opens the new view as
        // its own tab; the default tab reverts to its baseline.
        const tab: InternalTab = {
          tabId: uid(),
          kind: 'saved',
          viewId: created.id,
          name: created.name,
          config: snapshot,
        };
        setTabs((prev) => [
          ...prev.map((item) =>
            item.tabId === active.tabId && item.kind === 'default'
              ? { ...item, config: defaultBaseline }
              : item,
          ),
          tab,
        ]);
        setActiveTabId(tab.tabId);
      }
      message.success(t({ id: 'common.entityViews.saved' }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, activeTabId, tableKey, defaultBaseline, configOfTab, queryClient, t],
  );

  const renameTab = useCallback(
    async (tabId: string, name: string) => {
      const tab = tabs.find((item) => item.tabId === tabId);
      if (!tab) return;
      if (tab.kind === 'default') {
        if (defaultView) {
          const updated = await updateEntityView(defaultView.id, { name });
          queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
            old.map((view) => (view.id === updated.id ? updated : view)),
          );
        } else {
          // Renaming the virtual default materializes it (FR-003/FR-023).
          const config = tabId === activeTabId ? table.snapshotConfig() : tab.config;
          await materializeDefault(name, config);
          setTabs((prev) =>
            prev.map((item) => (item.tabId === tabId ? { ...item, config } : item)),
          );
        }
        return;
      }
      if (tab.kind !== 'saved' || !tab.viewId) return;
      const updated = await updateEntityView(tab.viewId, { name });
      queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
        old.map((view) => (view.id === updated.id ? updated : view)),
      );
      setTabs((prev) =>
        prev.map((item) => (item.tabId === tabId ? { ...item, name: updated.name } : item)),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, activeTabId, defaultView, materializeDefault, table.snapshotConfig, queryClient],
  );

  const pinTab = useCallback(
    async (tabId: string, pinned: boolean) => {
      const tab = tabs.find((item) => item.tabId === tabId);
      const viewId = tab?.kind === 'default' ? defaultView?.id : tab?.viewId;
      if (!viewId) return;
      if (!pinned && viewById(viewId)?.is_default) return; // the fallback stays pinned
      if (pinned) closedPinnedRef.current.delete(viewId);
      const updated = await updateEntityView(viewId, { pinned });
      queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
        old.map((view) => (view.id === updated.id ? updated : view)),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, defaultView, viewById, queryClient],
  );

  /** Transfer the default role to this tab's saved view (FR-026).
   *
   *  The tab of kind `'default'` always represents the role holder, so the
   *  promotion swaps tab identities in place: the target tab becomes the
   *  default tab and the old holder becomes an ordinary saved tab — or an
   *  anonymous one when it was still the virtual page default (R25). Neither
   *  tab moves position (SC-011). */
  const setDefaultTab = useCallback(
    async (tabId: string) => {
      const target = tabs.find((item) => item.tabId === tabId);
      if (!target || target.kind !== 'saved' || !target.viewId) return;
      if (viewById(target.viewId)?.is_default) return; // already the holder
      const previous = tabs.find((item) => item.kind === 'default');
      const previousView = defaultView;
      try {
        const updated = await updateEntityView(target.viewId, { is_default: true });
        queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
          old.map((view) =>
            view.id === updated.id ? updated : view.is_default ? { ...view, is_default: false } : view,
          ),
        );
      } catch (err) {
        message.error(t({ id: 'common.entityViews.setDefaultError' }));
        throw err;
      }
      const demotedTabId = uid();
      setTabs((prev) =>
        prev.map((item) => {
          if (previous && item.tabId === previous.tabId) {
            return previousView
              ? {
                  ...item,
                  tabId: demotedTabId,
                  kind: 'saved' as const,
                  viewId: previousView.id,
                  name: previousView.name,
                }
              : {
                  ...item,
                  tabId: demotedTabId,
                  kind: 'anonymous' as const,
                  viewId: undefined,
                  name: defaultDisplayName,
                };
          }
          if (item.tabId === tabId) {
            return { ...item, tabId: previous?.tabId ?? DEFAULT_TAB_ID, kind: 'default' as const };
          }
          return item;
        }),
      );
      setActiveTabId((current) => {
        if (current === tabId) return previous?.tabId ?? DEFAULT_TAB_ID;
        if (previous && current === previous.tabId) return demotedTabId;
        return current;
      });
      await queryClient.invalidateQueries({ queryKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, defaultView, defaultDisplayName, viewById, queryClient, t],
  );

  const deleteTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((item) => item.tabId === tabId);
      const viewId = tab?.kind === 'saved' ? tab.viewId : undefined;
      if (!tab || !viewId) return;
      const view = viewById(viewId);
      if (view?.is_default) return; // the guaranteed fallback is undeletable
      await deleteEntityView(viewId);
      // FR-019: the tab lives on, holding the same configuration.
      setTabs((prev) =>
        prev.map((item) =>
          item.tabId === tabId
            ? { ...item, kind: 'anonymous', viewId: undefined, name: view?.name ?? item.name }
            : item,
        ),
      );
      await queryClient.invalidateQueries({ queryKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, viewById, queryClient],
  );

  /** Apply a dragged tab order and persist it (FR-027/R26).
   *
   *  The server call always carries the table's COMPLETE id order — the strip's
   *  saved views first, then the views that are not open, in their current
   *  relative order — so a partial strip never leaves other views stranded at
   *  stale positions (the manage modal reads the same order). */
  const reorderTabs = useCallback(
    async (orderedTabIds: string[]) => {
      setTabs((prev) => {
        const byId = new Map(prev.map((tab) => [tab.tabId, tab]));
        const ordered = orderedTabIds.map((id) => byId.get(id)).filter((tab): tab is InternalTab => !!tab);
        const rest = prev.filter((tab) => !orderedTabIds.includes(tab.tabId));
        const next = [...ordered, ...rest];
        return next.length === prev.length ? next : prev;
      });

      const viewIdOfTab = (tabId: string): string | undefined => {
        const tab = tabs.find((item) => item.tabId === tabId);
        if (!tab) return undefined;
        return tab.kind === 'default' ? defaultView?.id : tab.viewId;
      };
      const stripIds = orderedTabIds
        .map(viewIdOfTab)
        .filter((id): id is string => !!id && savedViews.some((view) => view.id === id));
      const completeIds = [
        ...stripIds,
        ...savedViews.filter((view) => !stripIds.includes(view.id)).map((view) => view.id),
      ];
      const currentIds = savedViews.map((view) => view.id);
      if (completeIds.length === 0 || JSON.stringify(completeIds) === JSON.stringify(currentIds)) {
        return;
      }
      await reorderEntityViews(tableKey, completeIds);
      queryClient.setQueryData<EntityView[]>(queryKey, (old = []) =>
        completeIds
          .map((id, index) => {
            const view = old.find((item) => item.id === id);
            return view ? { ...view, position: index } : undefined;
          })
          .filter((view): view is EntityView => !!view),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, savedViews, defaultView, tableKey, queryClient],
  );

  const commitManageChanges = useCallback(
    async ({ items, deletedIds }: ManageChanges) => {
      try {
        for (const id of deletedIds) {
          await deleteEntityView(id);
        }
        for (const item of items) {
          const original = savedViews.find((view) => view.id === item.id);
          if (!original) continue;
          const patch: EntityViewPatch = {};
          if (original.name !== item.name) patch.name = item.name;
          if (original.pinned !== item.pinned) patch.pinned = item.pinned;
          if (Object.keys(patch).length > 0) await updateEntityView(item.id, patch);
        }
        const originalOrder = savedViews
          .filter((view) => !deletedIds.includes(view.id))
          .map((view) => view.id);
        const newOrder = items.map((item) => item.id);
        if (newOrder.length > 0 && JSON.stringify(originalOrder) !== JSON.stringify(newOrder)) {
          await reorderEntityViews(tableKey, newOrder);
        }
        // FR-019: a deleted view's open tab lives on as an anonymous tab.
        setTabs((prev) =>
          prev.map((tab) =>
            tab.viewId && deletedIds.includes(tab.viewId)
              ? {
                  ...tab,
                  kind: 'anonymous',
                  viewId: undefined,
                  name: savedViews.find((v) => v.id === tab.viewId)?.name ?? tab.name,
                }
              : tab,
          ),
        );
      } catch (err) {
        message.error(t({ id: 'common.entityViews.manageSaveError' }));
        throw err;
      } finally {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedViews, tableKey, queryClient, t],
  );

  // ── URL sync (US3, readable per-facet params) ──────────────────────────────

  // INBOUND: apply the table's view params — on mount, on back/forward, and on
  // hand-edited query strings. Malformed/unresolvable params fall back to the
  // default view with a non-blocking warning (FR-008).
  useEffect(() => {
    const entries = viewEntriesOf(searchParams);
    const raw = JSON.stringify(entries);
    if (entries.length === 0) {
      inboundSettledRef.current = true;
      return;
    }
    if (raw === lastParamRef.current || raw === lastProcessedRef.current) {
      inboundSettledRef.current = true;
      return;
    }

    const fallbackToDefault = (messageId: string) => {
      message.warning(t({ id: messageId }));
      lastProcessedRef.current = raw; // don't re-process the same bad value
      inboundSettledRef.current = true;
      setActiveTabId(DEFAULT_TAB_ID);
      table.loadConfig(defaultBaseline);
    };

    const parsed = parseViewParams(searchParams, tableKey);
    if (!parsed.ok) {
      fallbackToDefault('common.entityViews.invalidView');
      return;
    }
    if (!parsed.present) {
      inboundSettledRef.current = true;
      return;
    }

    const applyParsed = (view: ParsedViewState) => {
      const target = view.viewName !== undefined
        ? savedViews.find((sv) => sv.name === view.viewName)
        : undefined;
      const isDefaultTarget =
        view.viewName !== undefined &&
        (target ? target.is_default : view.viewName === defaultDisplayName);

      const baseConfig =
        view.viewName === undefined
          ? defaultConfig
          : isDefaultTarget
            ? defaultBaseline
            : reconcileConfig(coerceConfig(target!.config, defaultConfig), defaultConfig);
      const config: ViewConfig = {
        ...baseConfig,
        ...view.config,
        columns: view.visibleColumns
          ? columnsFromVisibleKeys(view.visibleColumns, defaultConfig.columns)
          : baseConfig.columns,
      };
      const offset = view.page ? (view.page - 1) * config.pageSize : 0;
      const snapshot = table.snapshotConfig();

      if (view.viewName === undefined) {
        // Inline state belongs to a non-saved tab: the active default/anonymous
        // tab, or the default tab when a saved view is currently active.
        const activeInternal = tabs.find((tab) => tab.tabId === activeTabId);
        const targetId =
          activeInternal && activeInternal.kind !== 'saved' ? activeTabId : DEFAULT_TAB_ID;
        setTabs((prev) => prev.map((tab) => (tab.tabId === targetId ? { ...tab, config } : tab)));
        setActiveTabId(targetId);
      } else if (isDefaultTarget) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.tabId === DEFAULT_TAB_ID
              ? { ...tab, config }
              : tab.tabId === activeTabId
                ? { ...tab, config: snapshot }
                : tab,
          ),
        );
        setActiveTabId(DEFAULT_TAB_ID);
      } else {
        const existing = tabs.find((tab) => tab.viewId === target!.id);
        if (existing) {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.tabId === existing.tabId
                ? { ...tab, config }
                : tab.tabId === activeTabId
                  ? { ...tab, config: snapshot }
                  : tab,
            ),
          );
          setActiveTabId(existing.tabId);
        } else {
          const tab: InternalTab = {
            tabId: uid(),
            kind: 'saved',
            viewId: target!.id,
            name: target!.name,
            config,
          };
          setTabs((prev) => [
            ...prev.map((item) =>
              item.tabId === activeTabId ? { ...item, config: snapshot } : item,
            ),
            tab,
          ]);
          setActiveTabId(tab.tabId);
        }
      }
      table.loadConfig(config, { offset });
      lastProcessedRef.current = raw;
      inboundSettledRef.current = true;
    };

    if (parsed.view.viewName !== undefined) {
      const target = savedViews.find((sv) => sv.name === parsed.view.viewName);
      if (!target && parsed.view.viewName !== defaultDisplayName) {
        if (!isFetched) return; // wait for the saved-view list, then re-run
        fallbackToDefault('common.entityViews.unresolvedView');
        return;
      }
    }
    applyParsed(parsed.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, savedViews, isFetched]);

  // OUTBOUND: keep the URL describing the active tab's effective state, so
  // copying it at any moment reproduces the visible table (SC-003). A clean
  // default tab clears every view param (clean URLs). History: replace.
  useEffect(() => {
    if (!inboundSettledRef.current) return;
    const activeInternal = tabs.find((tab) => tab.tabId === activeTabId);
    if (!activeInternal) return;
    const snapshot = table.snapshotConfig();
    const reconciled = reconcileConfig(snapshot, defaultConfig);
    const page = table.limit > 0 ? Math.floor(table.offset / table.limit) + 1 : 1;
    const pageOut = page > 1 ? page : undefined;

    let desired: [string, string][];
    const view = viewById(activeInternal.viewId);
    if (activeInternal.kind === 'saved' && activeInternal.viewId && view) {
      const baseline = reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig);
      desired = serializeSavedEntries(
        tableKey,
        view.name,
        facetOverrides(reconciled, baseline),
        pageOut,
      );
    } else if (activeInternal.kind === 'default') {
      const baseline = reconcileConfig(defaultBaseline, defaultConfig);
      if (configsEqual(reconciled, baseline)) {
        // Clean default → clean URL (page transport only).
        desired = pageOut ? [[facetParam(tableKey, 'page'), String(pageOut)]] : [];
      } else if (defaultView) {
        desired = serializeSavedEntries(
          tableKey,
          defaultView.name,
          facetOverrides(reconciled, baseline),
          pageOut,
        );
      } else {
        desired = serializeInlineEntries(tableKey, reconciled, defaultConfig, pageOut);
      }
    } else {
      desired = serializeInlineEntries(tableKey, reconciled, defaultConfig, pageOut);
    }

    const desiredJson = JSON.stringify(desired);
    const currentJson = JSON.stringify(viewEntriesOf(searchParams));
    if (desiredJson === currentJson && ![...searchParams.keys()].some((k) => k.startsWith('view['))) {
      return;
    }
    lastParamRef.current = desired.length > 0 ? desiredJson : null;
    const foreign = [...searchParams.entries()].filter(([key]) => !isViewParamKey(key));
    const search = buildSearchString([...foreign, ...desired]);
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '' },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId, savedViews, table.snapshotConfig, table.offset, table.limit]);

  return {
    tabs: tabStates,
    activeTabId,
    activeTab,
    savedViews,
    isAnyDirty,
    collapsed,
    reveal,
    switchTab,
    addAnonymousTab,
    closeTab,
    openView,
    saveTab,
    saveTabAs,
    renameTab,
    duplicateTab,
    pinTab,
    setDefaultTab,
    deleteTab,
    reorderTabs,
    commitManageChanges,
  };
}
