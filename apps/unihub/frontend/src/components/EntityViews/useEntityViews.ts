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
import type { EntityView } from '@/services/unihub-backend/core';
import type { UseEntityTableReturn } from '../EntityToolbar/useEntityTable';
import type { ViewConfig } from '../EntityToolbar/types';
import {
  buildSearchString,
  columnsFromVisibleKeys,
  columnsToken,
  configsEqual,
  facetParam,
  hasViewParams,
  normalizeConfig,
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
  /** Open a scratch tab holding a BLANK config, labelled "New view" (FR-011). */
  addBlankTab: () => void;
  closeTab: (tabId: string) => void;
  openView: (viewId: string) => void;
  /** Persist ONE tab — a right-click menu can target an inactive tab. Saved
   *  views PATCH in place; the default tab materializes (or PATCHes) its
   *  `is_default` row; a tab with no stored view is CREATED under its current
   *  label (round 4: Save never prompts — FR-014). */
  saveTab: (tabId: string) => Promise<'saved'>;
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
  /** Discard this tab's edits, returning it to its baseline (FR-035). */
  resetTab: (tabId: string) => void;
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

/** A genuinely EMPTY configuration (round 4, FR-011): no filters, no sorting,
 *  every column visible in the page's natural (declared) order, nothing pinned.
 *  Deliberately NOT the table's default view, which may seed a filter. */
export function blankConfig(defaults: ViewConfig): ViewConfig {
  return {
    filters: [],
    sort: [],
    columns: [...defaults.columns]
      .sort((a, b) => a.order - b.order)
      .map((column, index) => ({ key: column.key, visible: true, order: index })),
    pageSize: defaults.pageSize,
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

  // ── The five navigation guards of this hook ────────────────────────────────
  // Each prevents a DIFFERENT failure; none is redundant with another, and
  // removing any one of them reintroduces a shipped bug:
  //
  //   lastParamRef      — skip the echo of our OWN outbound write, so the
  //                       inbound effect does not re-apply what we just wrote.
  //   lastProcessedRef  — remember the last inbound value we fully handled
  //                       (applied OR rejected). Never reset by an outbound
  //                       write: doing so re-arms the inbound effect for the
  //                       same stale value and the two ping-pong forever
  //                       (round 1).
  //   inboundSettledRef — stay quiet outbound until an inbound param, if any,
  //                       has been applied, so we never overwrite a deep link
  //                       before honouring it.
  //   pendingLoadRef    — the config we last handed to `loadIntoTable()`.
  //                       That call lands in a LATER render, so publishing
  //                       before it does wrote the PRE-adoption state out as
  //                       "overrides"; the next load replayed them and the view
  //                       showed the unsaved dot on arrival (round 6, FR-032).
  //   adoptedTokenRef   — the default view's configuration last offered to the
  //                       table. Adoption is idempotent rather than a one-shot
  //                       because a page's column universe can grow after
  //                       mount; a one-shot burned before its guards bailed
  //                       permanently on a transient skew and the page defaults
  //                       were then published as "overrides" of the stored view
  //                       (round 10, FR-036/R46).
  //
  // A sixth mechanism is not a ref: the outbound effect depends on
  // `searchParams` because it DECIDES against them (FR-037). Reading a stale
  // value let it believe the URL was already correct and skip the corrective
  // write that adoption requires.
  //
  // The entries last written by us — used to skip the echo of our own
  // outbound writes.
  const lastParamRef = useRef<string | null>(null);
  // The last inbound value fully processed (applied or rejected). Never reset
  // by outbound writes — otherwise clearing the params re-arms the inbound
  // effect for the same stale value and the two effects ping-pong forever.
  const lastProcessedRef = useRef<string | null>(null);
  // Outbound stays quiet until an inbound param (if any) has been applied.
  const inboundSettledRef = useRef(false);
  // The config most recently requested via `loadIntoTable()`; cleared once
  // the table's live state matches it. A comparison rather than a boolean
  // because `loadConfig` has no completion signal AND a load that requests what
  // the table already holds produces no state change — a flag would never
  // clear, silencing the URL forever (R40).
  const pendingLoadRef = useRef<ViewConfig | null>(null);

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

  /** Hand a config to the table AND arm the outbound gate: `loadConfig` lands
   *  in a later render, so the URL writer must wait for it (R40/FR-032). */
  const loadIntoTable = useCallback(
    (config: ViewConfig, options?: { offset?: number }) => {
      pendingLoadRef.current = config;
      table.loadConfig(config, options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.loadConfig],
  );

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

  // Whether the URL addressed view state AT MOUNT, captured during the first
  // render — before any of our OWN outbound writes. Two consumers need the
  // arrival value rather than the live one: the adoption effect below (R46) and
  // the view-row auto-hide (FR-025), where a lone materialized default
  // round-trips its own config through the URL.
  const initialUrlHadViewStateRef = useRef<boolean | null>(null);
  if (initialUrlHadViewStateRef.current === null) {
    initialUrlHadViewStateRef.current = hasViewParams(searchParams, tableKey);
  }

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
      loadIntoTable(active.config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopt the materialized default view's stored config while the table still
  // sits at pristine page defaults: the stored row IS the default tab's
  // identity after materialization (US1/FR-036).
  //
  // Deliberately NOT a one-shot. A page's column universe can GROW after mount
  // — the catalog's `attr:*` columns arrive with the attribute definitions —
  // which changes `defaultConfig`, and with it what both "pristine" and "the
  // stored configuration" mean. The effect re-runs and the comparisons below
  // decide; `adoptedTokenRef` makes it idempotent (and loop-proof: adoption
  // itself changes `tabs`).
  const adoptedTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isFetched || !defaultView) return;
    // The URL the USER arrived with wins — read the value captured AT MOUNT,
    // never the live params. This hook writes the URL itself, so reading live
    // params let our own write masquerade as a deep link and suppress adoption
    // on every reload (R46).
    if (initialUrlHadViewStateRef.current) return;
    const active = tabs.find((tab) => tab.tabId === activeTabId);
    if (!active || active.kind !== 'default') return; // a session tab wins
    const target = reconcileConfig(defaultBaseline, defaultConfig);
    const token = normalizeConfig(target);
    if (adoptedTokenRef.current === token) return; // already offered this config
    const live = reconcileConfig(table.snapshotConfig(), defaultConfig);
    if (configsEqual(live, target)) {
      adoptedTokenRef.current = token;
      return;
    }
    // Compare the table's LIVE state, never the tab's stored config: that
    // snapshot is taken at mount, and once late columns land it can never equal
    // the grown defaults again (reconcile appends them at the end, the page
    // declares them mid-order). Adoption then bailed forever and the page
    // defaults were published as "overrides" of the stored view — the unsaved
    // dot on arrival, and an inline URL after a reload (R46).
    if (!configsEqual(live, reconcileConfig(defaultConfig, defaultConfig))) return; // user edits win
    adoptedTokenRef.current = token;
    setTabs((prev) =>
      prev.map((tab) => (tab.tabId === DEFAULT_TAB_ID ? { ...tab, config: target } : tab)),
    );
    loadIntoTable(target);
    // `table.snapshotConfig` is a dependency for a reason: the table's own
    // column state is patched with late-arriving columns one commit AFTER
    // `defaultConfig` gains them, so a run in between sees a live snapshot that
    // legitimately differs from the defaults. Re-running as the table settles
    // is what turns that transient skew back into a match; without it the
    // single run landed inside the skew and adoption never happened (R46).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isFetched,
    defaultView,
    defaultBaseline,
    defaultConfig,
    tabs,
    activeTabId,
    table.snapshotConfig,
  ]);

  // Pinned tabs closed during this session must not bounce back on the next
  // refetch (round 3: every tab except the default holder is closable).
  const closedPinnedRef = useRef<Set<string>>(new Set());

  // Merge pinned views into the tab row (US2). Round 4: the merge is
  // ORDER-PRESERVING — tabs that are already open keep their current strip
  // position, and only genuinely NEW pinned views are inserted, each slotted
  // by `position` relative to the tabs already present. Rebuilding the whole
  // strip from `position` made a session tab jump the moment something pinned
  // it — e.g. "Set as default", which pins its target (R32/SC-011).
  useEffect(() => {
    setTabs((prev) => {
      const openViewIds = new Set(
        prev.map((tab) => tab.viewId).filter((id): id is string => !!id),
      );
      const defaultTab = prev.find((tab) => tab.kind === 'default');
      const boundToDefault = savedViews.find((view) => view.is_default);
      const missing = savedViews
        .filter(
          (view) =>
            view.pinned &&
            !closedPinnedRef.current.has(view.id) &&
            !openViewIds.has(view.id) &&
            // The materialized default binds to the existing default tab.
            !(view.is_default && defaultTab && !defaultTab.viewId),
        )
        .sort((a, b) => a.position - b.position);
      if (missing.length === 0) return prev;

      /** A tab's stored position, when it maps to a saved view. */
      const positionOf = (tab: InternalTab): number | undefined => {
        const viewId = tab.viewId ?? (tab.kind === 'default' ? boundToDefault?.id : undefined);
        return viewId ? savedViews.find((view) => view.id === viewId)?.position : undefined;
      };

      const next = [...prev];
      for (const view of missing) {
        const tab: InternalTab = {
          tabId: uid(),
          kind: 'saved',
          viewId: view.id,
          name: view.name,
          config: reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig),
        };
        const at = next.findIndex((item) => {
          const position = positionOf(item);
          return position !== undefined && position > view.position;
        });
        if (at === -1) next.push(tab);
        else next.splice(at, 0, tab);
      }
      return next;
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

  // `initialUrlHadViewStateRef` (declared above, at mount) decides this too: a
  // URL that addresses view state AT LOAD forces the row open, while later
  // dirtying of the collapsed default keeps it collapsed (the affordance shows
  // the dirty dot instead).
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
      loadIntoTable(target.config);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTabId, tabs, table.snapshotConfig, loadIntoTable, setTabs, setActiveTabId],
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
      loadIntoTable(config);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, viewById, defaultView, defaultConfig, activeTabId, table.snapshotConfig, loadIntoTable, switchTab],
  );

  const addBlankTab = useCallback(() => {
    const snapshot = table.snapshotConfig();
    const blank = blankConfig(defaultConfig);
    const tab: InternalTab = {
      tabId: uid(),
      kind: 'anonymous',
      name: t({ id: 'common.entityViews.newViewName' }),
      config: blank,
      baseline: blank, // what Reset changes returns to (FR-035)
    };
    setTabs((prev) => [...snapshotOutgoing(prev, snapshot), tab]);
    setActiveTabId(tab.tabId);
    loadIntoTable(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultConfig, activeTabId, table.snapshotConfig, loadIntoTable, t]);

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
        loadIntoTable(fallback.config);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, activeTabId, viewById, loadIntoTable],
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
      // Round 4: names are labels, so the copy keeps its source's name verbatim
      // (no "(n)" suffix — FR-015).
      const name = baseName || sourceState?.name || t({ id: 'common.entityViews.newViewName' });
      const snapshot = table.snapshotConfig();
      const sourceConfig = configOfTab(source);
      const tab: InternalTab = {
        tabId: uid(),
        kind: 'anonymous',
        name,
        config: sourceConfig,
        baseline: sourceConfig, // Reset returns the copy to what it was copied from
      };
      setTabs((prev) => [...snapshotOutgoing(prev, snapshot), tab]);
      setActiveTabId(tab.tabId);
      loadIntoTable(tab.config);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, tabStates, activeTabId, configOfTab, table.snapshotConfig, loadIntoTable, t],
  );

  /** Discard a tab's edits and return it to its baseline (FR-035).
   *
   *  Baseline = the stored view's configuration for a tab that represents one,
   *  otherwise the configuration the tab was created with. Writes nothing to
   *  the server. Routing through `loadIntoTable` means the round-6 pending-load
   *  gate applies, so the override params drop out of the URL once the baseline
   *  lands rather than being republished mid-flight. */
  const resetTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((item) => item.tabId === tabId);
      if (!tab) return;
      const storedView = tab.kind === 'default' ? defaultView : viewById(tab.viewId);
      const baseline = storedView
        ? reconcileConfig(coerceConfig(storedView.config, defaultConfig), defaultConfig)
        : (tab.baseline ?? blankConfig(defaultConfig));

      setTabs((prev) =>
        prev.map((item) => (item.tabId === tabId ? { ...item, config: baseline } : item)),
      );
      // Only the ACTIVE tab drives the table (and therefore the URL).
      if (tabId === activeTabId) loadIntoTable(baseline);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, activeTabId, defaultView, defaultConfig, viewById, loadIntoTable],
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

  const saveTab = useCallback(async (tabId: string): Promise<'saved'> => {
    const active = tabs.find((tab) => tab.tabId === tabId);
    if (!active) return 'saved';
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
      if (!active.viewId) {
        // Round 4: no naming prompt — the tab's current label IS the name.
        const created = await createEntityView({
          table_key: tableKey,
          name: active.name || t({ id: 'common.entityViews.newViewName' }),
          config: snapshot as unknown as Record<string, unknown>,
        });
        queryClient.setQueryData<EntityView[]>(queryKey, (old = []) => [...old, created]);
        setTabs((prev) =>
          prev.map((tab) =>
            tab.tabId === active.tabId
              ? { ...tab, kind: 'saved', viewId: created.id, name: created.name, config: snapshot }
              : tab,
          ),
        );
        message.success(t({ id: 'common.entityViews.saved' }));
        return 'saved';
      }
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
  }, [tabs, activeTabId, tableKey, defaultView, defaultDisplayName, materializeDefault, configOfTab, queryClient, t]);

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
      // A VIRTUAL page default has no row to demote. Converting it to a
      // scratch tab would leave it permanently marked unsaved, so store it as
      // an ordinary view instead: the tab keeps its name and stays CLEAN
      // (round 4 — R32).
      let demotedView: EntityView | undefined = previousView;
      if (!previousView && previous) {
        const config = configOfTab(previous);
        demotedView = await createEntityView({
          table_key: tableKey,
          name: defaultDisplayName,
          config: config as unknown as Record<string, unknown>,
        });
        queryClient.setQueryData<EntityView[]>(queryKey, (old = []) => [...old, demotedView!]);
      }
      const demotedTabId = uid();
      setTabs((prev) =>
        prev.map((item) => {
          if (previous && item.tabId === previous.tabId) {
            return demotedView
              ? {
                  ...item,
                  tabId: demotedTabId,
                  kind: 'saved' as const,
                  viewId: demotedView.id,
                  name: demotedView.name,
                  config: configOfTab(item),
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
    [tabs, tableKey, defaultView, defaultDisplayName, viewById, configOfTab, queryClient, t],
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
      loadIntoTable(defaultBaseline);
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
      const target =
        view.viewId !== undefined ? savedViews.find((sv) => sv.id === view.viewId) : undefined;
      const isDefaultTarget = view.viewId !== undefined && !!target?.is_default;

      const baseConfig =
        view.viewId === undefined
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

      if (view.viewId === undefined) {
        // Inline state describes an UNSAVED view, so it may only ever land on an
        // unsaved tab. Round 7: the old fallback wrote it onto the default tab
        // whenever no scratch tab was open — which, once tabs became per-visit
        // (round 5), happened on EVERY reload, silently replacing the default
        // view's stored configuration (the catalog's seeded filter) and showing
        // the unsaved dot on arrival. A tab representing a stored view — saved
        // or the default holder — is never a valid target (R42/FR-018).
        const activeInternal = tabs.find((tab) => tab.tabId === activeTabId);
        const restoredTabId = uid();
        let inlineTabId: string = restoredTabId;
        setTabs((prev) => {
          // Reuse the ACTIVE tab only when it is itself unsaved (the in-session
          // case: the user edits the toolbar and the URL echoes back).
          const reusable = prev.find(
            (tab) => tab.tabId === activeInternal?.tabId && tab.kind === 'anonymous',
          );
          if (reusable) {
            inlineTabId = reusable.tabId;
            return prev.map((tab) => (tab.tabId === reusable.tabId ? { ...tab, config } : tab));
          }
          // The inbound effect can re-run for the same value, so the existence
          // check lives INSIDE the updater (round-5 duplicate-tab discipline).
          const existing = prev.find((tab) => tab.tabId === restoredTabId);
          if (existing) {
            inlineTabId = existing.tabId;
            return prev;
          }
          return [
            ...prev.map((item) =>
              item.tabId === activeTabId ? { ...item, config: snapshot } : item,
            ),
            {
              tabId: restoredTabId,
              kind: 'anonymous' as const,
              name: t({ id: 'common.entityViews.newViewName' }),
              config,
              baseline: config, // the state the URL described
            },
          ];
        });
        // Updater form: React runs it AFTER the setTabs updater, which is what
        // assigns `inlineTabId`.
        setActiveTabId(() => inlineTabId);
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
        // Round 5: the pinned-view merge may have opened this view already in
        // the same commit, so the check MUST happen inside the updater — a
        // stale `tabs` closure here produced a duplicate tab (FR-018).
        const newTabId = uid();
        let targetTabId: string = newTabId;
        setTabs((prev) => {
          const existing = prev.find((tab) => tab.viewId === target!.id);
          if (existing) {
            targetTabId = existing.tabId;
            return prev.map((tab) =>
              tab.tabId === existing.tabId
                ? { ...tab, config }
                : tab.tabId === activeTabId
                  ? { ...tab, config: snapshot }
                  : tab,
            );
          }
          return [
            ...prev.map((item) =>
              item.tabId === activeTabId ? { ...item, config: snapshot } : item,
            ),
            {
              tabId: newTabId,
              kind: 'saved' as const,
              viewId: target!.id,
              name: target!.name,
              config,
            },
          ];
        });
        // The updater form is required, not stylistic: React runs it AFTER the
        // setTabs updater above, which is what assigns `targetTabId`.
        setActiveTabId(() => targetTabId);
      }
      loadIntoTable(config, { offset });
      lastProcessedRef.current = raw;
      inboundSettledRef.current = true;
    };

    if (parsed.view.viewId !== undefined) {
      const target = savedViews.find((sv) => sv.id === parsed.view.viewId);
      if (!target) {
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

    // Never publish a HALF-LOADED tab (FR-032/R40). `loadIntoTable` records
    // what it asked the table for; until the table actually holds it, anything
    // we wrote would describe the pre-load state — and the next visit would
    // replay it as genuine overrides, showing the unsaved dot on arrival.
    if (pendingLoadRef.current) {
      const pending = reconcileConfig(pendingLoadRef.current, defaultConfig);
      if (!configsEqual(reconciled, pending)) return;
      pendingLoadRef.current = null; // landed — resume publishing
    }

    const page = table.limit > 0 ? Math.floor(table.offset / table.limit) + 1 : 1;
    const pageOut = page > 1 ? page : undefined;

    let desired: [string, string][];
    const view = viewById(activeInternal.viewId);
    if (activeInternal.kind === 'saved' && activeInternal.viewId && view) {
      const baseline = reconcileConfig(coerceConfig(view.config, defaultConfig), defaultConfig);
      desired = serializeSavedEntries(
        tableKey,
        view.id,
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
          defaultView.id,
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
    // `searchParams` is a dependency because this effect DECIDES against it:
    // `currentJson` is what the URL already says. Without it the effect ran on
    // a stale value, read "[]" while the address bar held override params, and
    // concluded the URL was already correct — so the corrective write that
    // should follow adoption never happened and the overrides survived into the
    // next load (R46). The write itself is idempotent: the re-run it triggers
    // finds `desired === current` and returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId, savedViews, searchParams, table.snapshotConfig, table.offset, table.limit]);

  return {
    tabs: tabStates,
    activeTabId,
    activeTab,
    savedViews,
    isAnyDirty,
    collapsed,
    reveal,
    switchTab,
    addBlankTab,
    closeTab,
    openView,
    saveTab,
    renameTab,
    duplicateTab,
    pinTab,
    setDefaultTab,
    deleteTab,
    reorderTabs,
    resetTab,
  };
}
