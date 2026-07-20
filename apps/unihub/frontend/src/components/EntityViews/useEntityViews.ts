/**
 * useEntityViews — tab/view orchestration for entity tables (016).
 *
 * Owns: the open-tab list (default "Tabular" + saved + anonymous tabs), the
 * active tab, saved-view fetching, per-tab dirty computation, and all view
 * mutations. The ACTIVE tab's config is always the table's live state
 * (`table.snapshotConfig()`); inactive tabs hold their last-known snapshot.
 *
 * Staged-mutation rule: nothing here writes to the API except the explicit
 * save/save-as/duplicate-commit/manage-commit entry points.
 */
import { useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';
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
  columnsFromVisibleKeys,
  configsEqual,
  parseViewParam,
  serializeInline,
  serializeSaved,
  viewParamName,
} from './serialization';
import type { ParsedView } from './serialization';
import { DEFAULT_TAB_ID, useViewTabsState } from './useViewTabsState';
import type { InternalTab, InternalTabKind } from './useViewTabsState';

const uid = () => crypto.randomUUID();

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
  /** The page's default ("Tabular") config — the baseline of the default tab. */
  defaultConfig: ViewConfig;
}

export interface UseEntityViewsReturn {
  tabs: ViewTabState[];
  activeTabId: string;
  activeTab: ViewTabState;
  savedViews: EntityView[];
  /** True when any open view has unsaved changes (drives the Save action). */
  isAnyDirty: boolean;
  switchTab: (tabId: string) => void;
  addAnonymousTab: () => void;
  closeTab: (tabId: string) => void;
  openView: (viewId: string) => void;
  /** Persist the active tab: saved views PATCH in place; default/anonymous
   *  tabs need a name first (`'needs-name'` → open the SaveViewModal). */
  saveActiveTab: () => Promise<'saved' | 'needs-name'>;
  saveActiveTabAs: (name: string) => Promise<void>;
  /** Duplicate the active view into an unsaved tab named "X (1)", "X (2)", …
   *  `baseName` is the rendered display name (the hook doesn't localize). */
  duplicateActiveTab: (baseName?: string) => void;
  commitManageChanges: (changes: ManageChanges) => Promise<void>;
}

/** Coerce a server-stored (unknown-shaped) config into a full ViewConfig,
 *  falling back facet-wise to the table defaults (forgiving contract). */
export function coerceConfig(raw: unknown, defaults: ViewConfig): ViewConfig {
  const r = (raw ?? {}) as Partial<ViewConfig>;
  return {
    filters: Array.isArray(r.filters) ? r.filters : defaults.filters,
    sort: Array.isArray(r.sort) ? r.sort : defaults.sort,
    columns: Array.isArray(r.columns) && r.columns.length > 0 ? r.columns : defaults.columns,
    stickyLeft: typeof r.stickyLeft === 'boolean' ? r.stickyLeft : defaults.stickyLeft,
    stickyRight: typeof r.stickyRight === 'boolean' ? r.stickyRight : defaults.stickyRight,
    pageSize: typeof r.pageSize === 'number' ? r.pageSize : defaults.pageSize,
  };
}

/** Reconcile a stored config against the CURRENT column universe (FR-021):
 *  stale column keys dropped, missing runtime columns appended with their
 *  default visibility. Keeps dirty comparisons drift-free (both the baseline
 *  and the live snapshot pass through the same reconciliation). */
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
      ...listed.map((c, i) => ({ key: c.key, visible: c.visible, order: i })),
      ...appended.map((c, i) => ({ key: c.key, visible: c.visible, order: listed.length + i })),
    ],
  };
}

export function useEntityViews({
  tableKey,
  table,
  defaultConfig,
}: UseEntityViewsOptions): UseEntityViewsReturn {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const queryKey = ['core', 'entity-views', tableKey];
  const [searchParams, setSearchParams] = useSearchParams();
  const paramName = viewParamName(tableKey);
  // The param value last written by us — used to skip the echo of our own
  // outbound writes.
  const lastParamRef = useRef<string | null>(null);
  // The last inbound value fully processed (applied or rejected). Never reset
  // by outbound writes — otherwise clearing the param re-arms the inbound
  // effect for the same stale value and the two effects ping-pong forever.
  const lastProcessedRef = useRef<string | null>(null);
  // Outbound stays quiet until an inbound param (if any) has been applied.
  const inboundSettledRef = useRef(false);

  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
  } = useViewTabsState(tableKey, defaultConfig);

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

  // Rehydrate the table ONCE from a session-restored active tab (US2): the
  // tab list survives in sessionStorage, but the table hooks boot from page
  // defaults — reload the restored tab's config on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // A view param in the URL wins over the session-restored tab (US3).
    if (searchParams.get(paramName) !== null) return;
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

  // Merge pinned views into the tab row (US2): default tab first, then pinned
  // views in position order, then other session-opened tabs. Identity-stable
  // when nothing changed so refetches don't churn renders.
  useEffect(() => {
    setTabs((prev) => {
      const defaultTab = prev.find((tab) => tab.kind === 'default');
      if (!defaultTab) return prev;
      const pinned = savedViews.filter((view) => view.pinned);
      const byViewId = new Map(
        prev.filter((tab) => tab.viewId).map((tab) => [tab.viewId!, tab]),
      );
      const pinnedTabs = pinned.map(
        (view) =>
          byViewId.get(view.id) ?? {
            tabId: uid(),
            kind: 'saved' as const,
            viewId: view.id,
            name: view.name,
            config: reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig),
          },
      );
      const pinnedIds = new Set(pinned.map((view) => view.id));
      const others = prev.filter(
        (tab) => tab.kind !== 'default' && !(tab.viewId && pinnedIds.has(tab.viewId)),
      );
      const next = [defaultTab, ...pinnedTabs, ...others];
      const unchanged =
        next.length === prev.length && next.every((tab, i) => tab === prev[i]);
      return unchanged ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedViews, defaultConfig]);

  // ── Derived tab states ─────────────────────────────────────────────────────

  const currentConfigOf = (tab: InternalTab): ViewConfig =>
    tab.tabId === activeTabId ? table.snapshotConfig() : tab.config;

  const toTabState = (tab: InternalTab): ViewTabState => {
    const view = viewById(tab.viewId);
    const name = tab.kind === 'saved' ? (view?.name ?? tab.name) : tab.name;
    const pinned = tab.kind === 'default' ? true : (view?.pinned ?? false);
    let dirty: boolean;
    if (tab.kind === 'anonymous') {
      dirty = true; // inherently unsaved
    } else if (tab.kind === 'default') {
      // Reconcile before comparing — the stored default-tab config may predate
      // async runtime columns (e.g. attr:<id> definitions loading after mount).
      dirty = !configsEqual(reconcileConfig(currentConfigOf(tab), defaultConfig), defaultConfig);
    } else if (view) {
      const baseline = reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig);
      dirty = !configsEqual(reconcileConfig(currentConfigOf(tab), defaultConfig), baseline);
    } else {
      dirty = false; // saved list not loaded yet — assume clean
    }
    return {
      tabId: tab.tabId,
      kind: tab.kind,
      viewId: tab.viewId,
      name,
      dirty,
      pinned,
      closable: tab.kind !== 'default' && !pinned,
    };
  };

  const tabStates = tabs.map(toTabState);
  const activeTab = tabStates.find((tab) => tab.tabId === activeTabId) ?? tabStates[0]!;
  const isAnyDirty = tabStates.some((tab) => tab.dirty);

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
    [tabs, viewById, defaultConfig, activeTabId, table.snapshotConfig, table.loadConfig, switchTab],
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
      if (viewById(tab.viewId)?.pinned) return; // pinned tabs are not closable
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

  const duplicateActiveTab = useCallback(
    (baseName?: string) => {
      const active = tabStates.find((tab) => tab.tabId === activeTabId);
      const base = baseName || active?.name || 'View';
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
        config: snapshot,
      };
      setTabs((prev) => [...snapshotOutgoing(prev, snapshot), tab]);
      setActiveTabId(tab.tabId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabStates, activeTabId, savedViews, table.snapshotConfig],
  );

  // ── Persistence (the ONLY API writes) ──────────────────────────────────────

  const saveActiveTab = useCallback(async (): Promise<'saved' | 'needs-name'> => {
    const active = tabs.find((tab) => tab.tabId === activeTabId);
    if (!active || active.kind !== 'saved' || !active.viewId) return 'needs-name';
    const snapshot = table.snapshotConfig();
    try {
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
  }, [tabs, activeTabId, table.snapshotConfig, queryClient, t]);

  const saveActiveTabAs = useCallback(
    async (name: string) => {
      const active = tabs.find((tab) => tab.tabId === activeTabId);
      if (!active) return;
      const snapshot = table.snapshotConfig();
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
        // Saving from the default (or a saved) tab opens the new view as its
        // own tab; the Tabular tab reverts to pristine defaults.
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
              ? { ...item, config: defaultConfig }
              : item,
          ),
          tab,
        ]);
        setActiveTabId(tab.tabId);
      }
      message.success(t({ id: 'common.entityViews.saved' }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, activeTabId, tableKey, defaultConfig, table.snapshotConfig, queryClient, t],
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

  // ── URL sync (US3) ─────────────────────────────────────────────────────────

  // INBOUND: apply `view[<tableKey>]` from the URL — on mount, on back/forward,
  // and on hand-edited query strings. Malformed/unresolvable params fall back
  // to the Tabular default with a non-blocking warning (FR-008).
  useEffect(() => {
    const raw = searchParams.get(paramName);
    if (raw === null) {
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
      table.loadConfig(defaultConfig);
    };

    const parsed = parseViewParam(raw);
    if (!parsed.ok) {
      fallbackToDefault('common.entityViews.invalidView');
      return;
    }

    const applyParsed = (view: ParsedView) => {
      const baseConfig =
        view.type === 'saved'
          ? reconcileConfig(
              coerceConfig(viewById(view.id)?.config, defaultConfig),
              defaultConfig,
            )
          : defaultConfig;
      const config: ViewConfig = {
        ...baseConfig,
        ...view.config,
        columns: view.visibleColumnKeys
          ? columnsFromVisibleKeys(view.visibleColumnKeys, defaultConfig.columns)
          : (view.config.columns ?? baseConfig.columns),
      };
      const offset = view.page ? (view.page - 1) * config.pageSize : 0;
      const snapshot = table.snapshotConfig();

      if (view.type === 'inline') {
        // Inline state belongs to a non-saved tab: the active default/anonymous
        // tab, or the Tabular tab when a saved view is currently active.
        const activeInternal = tabs.find((tab) => tab.tabId === activeTabId);
        const targetId =
          activeInternal && activeInternal.kind !== 'saved' ? activeTabId : DEFAULT_TAB_ID;
        setTabs((prev) =>
          prev.map((tab) => (tab.tabId === targetId ? { ...tab, config } : tab)),
        );
        setActiveTabId(targetId);
      } else {
        const existing = tabs.find((tab) => tab.viewId === view.id);
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
          const view_ = viewById(view.id)!;
          const tab: InternalTab = {
            tabId: uid(),
            kind: 'saved',
            viewId: view_.id,
            name: view_.name,
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

    if (parsed.view.type === 'saved') {
      if (!viewById(parsed.view.id)) {
        if (!isFetched) return; // wait for the saved-view list, then re-run
        fallbackToDefault('common.entityViews.unresolvedView');
        return;
      }
    }
    applyParsed(parsed.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, savedViews, isFetched]);

  // OUTBOUND: keep the URL describing the active tab's effective state, so
  // copying it at any moment reproduces the visible table (SC-003). Pristine
  // default state clears the param (clean URLs). History semantics: replace.
  useEffect(() => {
    if (!inboundSettledRef.current) return;
    const activeInternal = tabs.find((tab) => tab.tabId === activeTabId);
    if (!activeInternal) return;
    const snapshot = table.snapshotConfig();
    const page = table.limit > 0 ? Math.floor(table.offset / table.limit) + 1 : 1;
    const pageOut = page > 1 ? page : undefined;

    let inner: string;
    const view = viewById(activeInternal.viewId);
    if (activeInternal.kind === 'saved' && activeInternal.viewId && view) {
      const baseline = reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig);
      const reconciled = reconcileConfig(snapshot, defaultConfig);
      const overrides: Partial<ViewConfig> = {};
      if (JSON.stringify(reconciled.filters) !== JSON.stringify(baseline.filters)) {
        overrides.filters = reconciled.filters;
      }
      if (JSON.stringify(reconciled.sort) !== JSON.stringify(baseline.sort)) {
        overrides.sort = reconciled.sort;
      }
      const visible = (c: ViewConfig) =>
        c.columns
          .filter((col) => col.visible)
          .sort((a, b) => a.order - b.order)
          .map((col) => col.key)
          .join(',');
      if (visible(reconciled) !== visible(baseline)) overrides.columns = reconciled.columns;
      if (reconciled.stickyLeft !== baseline.stickyLeft) overrides.stickyLeft = reconciled.stickyLeft;
      if (reconciled.stickyRight !== baseline.stickyRight) {
        overrides.stickyRight = reconciled.stickyRight;
      }
      if (reconciled.pageSize !== baseline.pageSize) overrides.pageSize = reconciled.pageSize;
      inner = serializeSaved(activeInternal.viewId, overrides, pageOut);
    } else {
      inner = serializeInline(snapshot, defaultConfig, pageOut);
    }

    const clearParam = inner === 'type=inline';
    const current = searchParams.get(paramName);
    if (clearParam ? current === null : current === inner) return;
    lastParamRef.current = clearParam ? null : inner;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (clearParam) next.delete(paramName);
        else next.set(paramName, inner);
        return next;
      },
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
    switchTab,
    addAnonymousTab,
    closeTab,
    openView,
    saveActiveTab,
    saveActiveTabAs,
    duplicateActiveTab,
    commitManageChanges,
  };
}
