// 016 entity views — hook core (round 2: default view as a plain view,
// readable per-facet URLs, auto-hide, rename).
import React, { useMemo } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enUS from '@/locales/en-US';
import { useEntityTable } from '../EntityToolbar/useEntityTable';
import type { ColumnDef, FilterableAttribute, ViewConfig } from '../EntityToolbar/types';
import { blankConfig, useEntityViews } from './useEntityViews';
import * as coreService from '@/services/unihub-backend/core';
import type { EntityView } from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/core', () => ({
  listEntityViews: vi.fn(),
  createEntityView: vi.fn(),
  updateEntityView: vi.fn(),
  deleteEntityView: vi.fn(),
  reorderEntityViews: vi.fn(),
}));

const listMock = vi.mocked(coreService.listEntityViews);
const createMock = vi.mocked(coreService.createEntityView);
const updateMock = vi.mocked(coreService.updateEntityView);
const deleteMock = vi.mocked(coreService.deleteEntityView);

const ATTRS: FilterableAttribute[] = [
  { key: 'name', label: 'Name', dataType: 'text' },
  { key: 'amount', label: 'Amount', dataType: 'number' },
];

const COLS: ColumnDef[] = [
  { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 0 },
  { key: 'amount', label: 'Amount', dataType: 'number', visible: true, order: 1 },
];

const DEFAULT_CONFIG: ViewConfig = {
  filters: [],
  sort: [],
  columns: [
    { key: 'name', visible: true, order: 0 },
    { key: 'amount', visible: true, order: 1 },
  ],
  pageSize: 25,
};

const SAVED_VIEW: EntityView = {
  id: 'view000000A1',
  table_key: 'tbl',
  name: 'Amount desc',
  config: {
    filters: [{ logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'x' }] }],
    sort: [{ field: 'amount', direction: 'desc' }],
    columns: [
      { key: 'amount', visible: true, order: 0, pin: 'left' },
      { key: 'name', visible: false, order: 1 },
    ],
    pageSize: 50,
  },
  pinned: false,
  position: 0,
  is_default: false,
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
};

const DEFAULT_VIEW: EntityView = {
  id: 'viewDefault01',
  table_key: 'tbl',
  name: 'My YTD',
  config: {
    filters: [],
    sort: [{ field: 'amount', direction: 'desc' }],
    columns: [
      { key: 'name', visible: true, order: 0 },
      { key: 'amount', visible: true, order: 1 },
    ],
    pageSize: 25,
  },
  pinned: true,
  position: 0,
  is_default: true,
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
};

function makeWrapper(initialEntries: string[] = ['/']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <IntlProvider locale="en" messages={enUS}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </IntlProvider>
      </MemoryRouter>
    );
  };
}

function useHarness() {
  const table = useEntityTable({ key: 'tbl', filterableAttrs: ATTRS, columnDefs: COLS });
  const defaultConfig = useMemo(() => DEFAULT_CONFIG, []);
  const views = useEntityViews({ tableKey: 'tbl', table, defaultConfig });
  const [searchParams] = useSearchParams();
  return { table, views, searchParams };
}

/** Harness with a page-provided default-view name (catalog-style "YTD"). */
function useNamedHarness() {
  const table = useEntityTable({ key: 'tbl', filterableAttrs: ATTRS, columnDefs: COLS });
  const defaultConfig = useMemo(() => DEFAULT_CONFIG, []);
  const views = useEntityViews({
    tableKey: 'tbl',
    table,
    defaultConfig,
    defaultViewName: 'YTD',
  });
  const [searchParams] = useSearchParams();
  return { table, views, searchParams };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  listMock.mockResolvedValue([SAVED_VIEW]);
});

describe('useEntityViews — US1 core', () => {
  it('starts with the default tab active and clean', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    expect(result.current.views.tabs).toHaveLength(1);
    const tab = result.current.views.tabs[0]!;
    expect(tab.kind).toBe('default');
    expect(tab.dirty).toBe(false);
    expect(result.current.views.activeTabId).toBe(tab.tabId);
    expect(result.current.views.isAnyDirty).toBe(false);
  });

  it('marks the active tab dirty when the table config changes', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    expect(result.current.views.tabs[0]!.dirty).toBe(true);
    expect(result.current.views.isAnyDirty).toBe(true);
  });

  it('openView applies the stored config to the table and opens a clean tab', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });

    expect(result.current.views.tabs).toHaveLength(2);
    const savedTab = result.current.views.tabs[1]!;
    expect(savedTab.kind).toBe('saved');
    expect(savedTab.name).toBe('Amount desc');
    expect(savedTab.dirty).toBe(false);
    expect(result.current.views.activeTabId).toBe(savedTab.tabId);

    expect(result.current.table.queryParams.ordering).toBe('-amount');
    expect(result.current.table.queryParams.filters).toEqual({
      groups: [{ logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'x' }] }],
    });
    expect(result.current.table.limit).toBe(50);
    expect(result.current.table.cols.visibleColumns.map((c) => c.key)).toEqual(['amount']);
    // v2: the stored per-column pin applies directly.
    expect(result.current.table.cols.fixedForKey('amount')).toBe('left');
  });

  it('saveTab persists a dirty saved view and clears the indicator', async () => {
    updateMock.mockImplementation(async (id, patch) => ({
      ...SAVED_VIEW,
      id,
      ...(patch as object),
      config: (patch.config ?? SAVED_VIEW.config) as EntityView['config'],
    }));
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    expect(result.current.views.activeTab.dirty).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.views.saveTab(result.current.views.activeTabId);
    });

    expect(outcome).toBe('saved');
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]).toBe(SAVED_VIEW.id);
    const sentConfig = updateMock.mock.calls[0]![1].config as unknown as ViewConfig;
    expect(sentConfig.sort).toEqual([
      { field: 'amount', direction: 'desc' },
      { field: 'name', direction: 'asc' },
    ]);
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(false));
  });

  it('never calls a write API before an explicit save (staged-mutation rule)', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    act(() => {
      result.current.views.switchTab(result.current.views.tabs[0]!.tabId);
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('switchTab snapshots the outgoing tab and restores the incoming config', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    const savedTabId = result.current.views.activeTabId;
    const defaultTabId = result.current.views.tabs[0]!.tabId;

    act(() => {
      result.current.views.switchTab(defaultTabId);
    });
    expect(result.current.table.queryParams.ordering).toBeUndefined();
    // The saved tab kept its modified config (still dirty).
    expect(result.current.views.tabs.find((t) => t.tabId === savedTabId)!.dirty).toBe(true);

    act(() => {
      result.current.views.switchTab(savedTabId);
    });
    expect(result.current.table.queryParams.ordering).toBe('-amount,name');
  });
});

describe('useEntityViews — US1 round 2: the default view is a plain view', () => {
  it('renders the page-provided default name on the virtual default tab', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(result.current.views.tabs[0]!.name).toBe('YTD');
    expect(result.current.views.tabs[0]!.kind).toBe('default');
  });

  it('saveTab on the virtual default MATERIALIZES it (is_default, pinned)', async () => {
    listMock.mockResolvedValue([]);
    createMock.mockImplementation(async (payload) => ({
      id: 'viewDefault01',
      table_key: payload.table_key,
      name: payload.name,
      config: payload.config as EntityView['config'],
      pinned: payload.pinned ?? false,
      position: payload.position ?? 0,
      is_default: payload.is_default ?? false,
      created_at: '2026-07-23T00:00:00Z',
      updated_at: '2026-07-23T00:00:00Z',
    }));
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    expect(result.current.views.activeTab.dirty).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.views.saveTab(result.current.views.activeTabId);
    });

    expect(outcome).toBe('saved');
    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0]![0];
    expect(payload.table_key).toBe('tbl');
    expect(payload.name).toBe('YTD');
    expect(payload.is_default).toBe(true);
    expect(payload.pinned).toBe(true);
    // The default tab stays the default tab — clean against its NEW baseline.
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(false));
    expect(result.current.views.activeTab.kind).toBe('default');
    expect(result.current.views.activeTab.name).toBe('YTD');
  });

  it('binds a materialized default row: name, adopted config, stored baseline', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    // Stored name wins over the page-provided one.
    expect(result.current.views.tabs[0]!.name).toBe('My YTD');
    // The stored config is adopted into the table (fresh session)…
    await waitFor(() => expect(result.current.table.queryParams.ordering).toBe('-amount'));
    // …and the tab is CLEAN because the baseline is the stored config.
    expect(result.current.views.tabs[0]!.dirty).toBe(false);

    // Diverging from the STORED baseline (not page defaults) marks dirty.
    act(() => {
      result.current.table.sort.handleHeaderClick('amount'); // desc → asc toggle
    });
    expect(result.current.views.tabs[0]!.dirty).toBe(true);
  });

  it('PATCHes the materialized default on save (no second create)', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW]);
    updateMock.mockImplementation(async (id, patch) => ({
      ...DEFAULT_VIEW,
      id,
      ...(patch as object),
      config: (patch.config ?? DEFAULT_VIEW.config) as EntityView['config'],
    }));
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.table.queryParams.ordering).toBe('-amount'));

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    await act(async () => {
      await result.current.views.saveTab(result.current.views.activeTabId);
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]).toBe(DEFAULT_VIEW.id);
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(false));
  });

  it('saving a scratch tab creates the view and binds it to that tab', async () => {
    createMock.mockImplementation(
      async (payload) =>
        ({
          ...SAVED_VIEW,
          id: 'newview00001',
          name: (payload as { name: string }).name,
          config: (payload as { config: EntityView['config'] }).config,
        }) as EntityView,
    );
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.addBlankTab());
    const tabId = result.current.views.activeTabId;
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    await act(async () => {
      await result.current.views.saveTab(tabId);
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const tab = result.current.views.tabs.find((t) => t.tabId === tabId)!;
    expect(tab.kind).toBe('saved');
    expect(tab.viewId).toBe('newview00001');
    expect(tab.dirty).toBe(false);
  });
});

describe('useEntityViews — US2 tabs', () => {
  const PINNED_A: EntityView = {
    ...SAVED_VIEW,
    id: 'pinnedA00001',
    name: 'Pinned A',
    pinned: true,
    position: 0,
  };
  const PINNED_B: EntityView = {
    ...SAVED_VIEW,
    id: 'pinnedB00002',
    name: 'Pinned B',
    pinned: true,
    position: 1,
  };

  it('merges pinned views as tabs after the default tab, in position order', async () => {
    listMock.mockResolvedValue([PINNED_B, PINNED_A].sort((a, b) => a.position - b.position));
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.views.tabs).toHaveLength(3));
    const [first, second, third] = result.current.views.tabs;
    expect(first!.kind).toBe('default');
    expect(second!.name).toBe('Pinned A');
    expect(second!.pinned).toBe(true);
    // Round 3 (FR-018): every tab except the default holder is closable — a
    // pinned view simply returns next session.
    expect(second!.closable).toBe(true);
    expect(third!.name).toBe('Pinned B');
    // Merging pinned tabs does not steal focus.
    expect(result.current.views.activeTabId).toBe(first!.tabId);
  });

  it('the materialized default is NOT duplicated as a pinned tab', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW, PINNED_A]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.views.tabs).toHaveLength(2));
    expect(result.current.views.tabs[0]!.kind).toBe('default');
    expect(result.current.views.tabs[0]!.name).toBe('My YTD');
    expect(result.current.views.tabs[1]!.name).toBe('Pinned A');
  });

  it('"+" opens an anonymous tab with the default config, active immediately', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    act(() => {
      result.current.views.addBlankTab();
    });

    const active = result.current.views.activeTab;
    expect(active.kind).toBe('anonymous');
    expect(active.dirty).toBe(true); // inherently unsaved
    // New tab starts from the table defaults, not the outgoing tab's state.
    expect(result.current.table.queryParams.ordering).toBeUndefined();
    expect(result.current.table.limit).toBe(25);
  });

  it('closeTab removes an unpinned tab and reactivates its neighbour', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    const openedId = result.current.views.activeTabId;

    act(() => {
      result.current.views.closeTab(openedId);
    });

    expect(result.current.views.tabs).toHaveLength(1);
    expect(result.current.views.activeTab.kind).toBe('default');
    expect(result.current.table.queryParams.ordering).toBeUndefined();
  });

  it('does NOT resurrect tabs on a remount — every visit rebuilds the row (FR-018)', async () => {
    const wrapper = makeWrapper();
    const first = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(first.result.current.views.savedViews).toHaveLength(1));

    act(() => {
      first.result.current.views.openView(SAVED_VIEW.id); // unpinned saved view
    });
    act(() => first.result.current.views.addBlankTab()); // scratch tab
    expect(first.result.current.views.tabs).toHaveLength(3);
    first.unmount();

    // A new visit with no view state in the URL: only the default tab remains.
    const second = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(second.result.current.views.savedViews).toHaveLength(1));
    expect(second.result.current.views.tabs).toHaveLength(1);
    expect(second.result.current.views.tabs[0]!.kind).toBe('default');
    expect(second.result.current.table.queryParams.ordering).toBeFalsy();
  });
  it('a cleared session drops anonymous/unpinned tabs (fresh-session behavior)', async () => {
    const first = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(first.result.current.views.savedViews).toHaveLength(1));
    act(() => {
      first.result.current.views.addBlankTab();
    });
    act(() => {
      first.result.current.views.openView(SAVED_VIEW.id);
    });
    expect(first.result.current.views.tabs).toHaveLength(3);
    first.unmount();

    window.sessionStorage.clear(); // the session ended
    const second = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(second.result.current.views.savedViews).toHaveLength(1));
    expect(second.result.current.views.tabs).toHaveLength(1);
    expect(second.result.current.views.tabs[0]!.kind).toBe('default');
  });
});

describe('useEntityViews — US2 round 2: view-row auto-hide (FR-025)', () => {
  it('collapses when only the default view/tab exists, reveal() persists for the session', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    expect(result.current.views.collapsed).toBe(true);

    act(() => {
      result.current.views.reveal();
    });
    expect(result.current.views.collapsed).toBe(false);
    const persisted = JSON.parse(window.sessionStorage.getItem('unihub.views.tbl')!) as {
      revealed: boolean;
    };
    expect(persisted.revealed).toBe(true);
  });

  it('stays expanded when any non-default saved view exists', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    expect(result.current.views.collapsed).toBe(false);
  });

  it('a lone MATERIALIZED default still collapses (it is the only view)', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    expect(result.current.views.collapsed).toBe(true);
  });

  it('expands when a second tab opens and re-collapses when it closes', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.views.addBlankTab();
    });
    expect(result.current.views.collapsed).toBe(false);

    act(() => {
      result.current.views.closeTab(result.current.views.activeTabId);
    });
    expect(result.current.views.collapsed).toBe(true);
  });

  it('stays expanded when the URL addresses view state', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.size=100']),
    });
    await waitFor(() => expect(result.current.table.limit).toBe(100));
    expect(result.current.views.collapsed).toBe(false);
  });
});

describe('useEntityViews — US3 URL sync (readable per-facet params)', () => {
  it('applies inline facet params on mount in their OWN unsaved tab (round 7)', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.sort=-amount&tbl.size=100']),
    });
    await waitFor(() => expect(result.current.table.queryParams.ordering).toBe('-amount'));
    expect(result.current.table.limit).toBe(100);

    // Round 7: inline state describes an UNSAVED view, so it gets its own tab
    // and never overwrites the default view's configuration (FR-018/R42).
    expect(result.current.views.activeTab.kind).toBe('anonymous');
    expect(result.current.views.activeTab.dirty).toBe(true);
    const defaultTab = result.current.views.tabs.find((t) => t.kind === 'default')!;
    expect(defaultTab).toBeDefined();
    expect(defaultTab.dirty).toBe(false);
  });

  it('opens a saved view referenced BY ID, clean', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?tbl.view=${SAVED_VIEW.id}`]),
    });
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('saved'));
    expect(result.current.views.activeTab.name).toBe('Amount desc');
    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(result.current.table.queryParams.ordering).toBe('-amount');
    expect(result.current.table.limit).toBe(50);
  });

  it('layers facet overrides onto a saved reference and shows the unsaved indicator', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?tbl.view=${SAVED_VIEW.id}&tbl.size=100`]),
    });
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('saved'));
    expect(result.current.table.limit).toBe(100);
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(true));
  });

  it('resolves the page-provided default name to the default tab while virtual', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useNamedHarness, {
      wrapper: makeWrapper(['/?tbl.view=YTD']),
    });
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('default'));
    expect(result.current.views.activeTab.dirty).toBe(false);
  });

  it('falls back to the default view for an unresolvable name', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.view=Does%20not%20exist']),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('default'));
    expect(result.current.table.queryParams.ordering).toBeUndefined();
  });

  it('falls back to the default view for a malformed facet', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.f=nonsense']),
    });
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(result.current.views.activeTab.kind).toBe('default');
    expect(result.current.views.activeTab.dirty).toBe(false);
  });

  it('transports the page position into the offset', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.page=3']),
    });
    await waitFor(() => expect(result.current.table.offset).toBe(50)); // (3-1) × 25
  });

  it('keeps the URL readable and in sync with the active tab state', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    await waitFor(() => {
      expect(result.current.searchParams.get('tbl.sort')).toBe('name');
    });
    // Clean default facets stay absent (clean URLs).
    expect(result.current.searchParams.get('tbl.size')).toBeNull();
    expect(result.current.searchParams.get('tbl.view')).toBeNull();
  });

  it('emits the saved-view ID (plus overrides only) for a saved tab', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    await waitFor(() => {
      expect(result.current.searchParams.get('tbl.view')).toBe(SAVED_VIEW.id);
    });
    expect(result.current.searchParams.get('tbl.sort')).toBeNull();

    act(() => {
      result.current.table.setLimit(100);
    });
    await waitFor(() => {
      expect(result.current.searchParams.get('tbl.size')).toBe('100');
    });
    expect(result.current.searchParams.get('tbl.view')).toBe(SAVED_VIEW.id);
  });

  it('leaves other tables’ view params untouched', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?other-table.size=100']),
    });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    await waitFor(() => expect(result.current.searchParams.get('tbl.sort')).toBe('name'));
    expect(result.current.searchParams.get('other-table.size')).toBe('100');
  });
});

describe('useEntityViews — US4 rename & duplicate', () => {
  it('renameTab PATCHes a saved view in place', async () => {
    updateMock.mockImplementation(
      async (id, patch) => ({ ...SAVED_VIEW, id, ...(patch as object) }) as EntityView,
    );
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    const tabId = result.current.views.activeTabId;

    await act(async () => {
      await result.current.views.renameTab(tabId, 'Renamed');
    });

    expect(updateMock).toHaveBeenCalledWith(SAVED_VIEW.id, { name: 'Renamed' });
    await waitFor(() => expect(result.current.views.activeTab.name).toBe('Renamed'));
  });

  it('renameTab on the virtual default MATERIALIZES it under the new name', async () => {
    listMock.mockResolvedValue([]);
    createMock.mockImplementation(async (payload) => ({
      id: 'viewDefault02',
      table_key: payload.table_key,
      name: payload.name,
      config: payload.config as EntityView['config'],
      pinned: payload.pinned ?? false,
      position: payload.position ?? 0,
      is_default: payload.is_default ?? false,
      created_at: '2026-07-23T00:00:00Z',
      updated_at: '2026-07-23T00:00:00Z',
    }));
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.views.renameTab(result.current.views.tabs[0]!.tabId, 'This year');
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0]![0];
    expect(payload.name).toBe('This year');
    expect(payload.is_default).toBe(true);
    await waitFor(() => expect(result.current.views.tabs[0]!.name).toBe('This year'));
    expect(result.current.views.tabs[0]!.kind).toBe('default');
  });

  it('renameTab rethrows API rejections (collision stays visible to the caller)', async () => {
    updateMock.mockRejectedValue(
      Object.assign(new Error('dup'), { status: 400, body: { name: ['exists'] } }),
    );
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });

    await expect(
      result.current.views.renameTab(result.current.views.activeTabId, 'Taken'),
    ).rejects.toThrow('dup');
  });

});

// ── Round 3: tab-addressed actions (R27), transferable default (R25),
//    persisted drag order (R26) ────────────────────────────────────────────────

describe('useEntityViews — round 3: per-tab actions', () => {
  const PINNED_VIEW: EntityView = {
    ...SAVED_VIEW,
    id: 'view000000B2',
    name: 'Pinned view',
    pinned: true,
    position: 1,
  };

  it('saveTab persists the GIVEN tab, not the active one', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    updateMock.mockImplementation(
      async (id, patch) => ({ ...SAVED_VIEW, id, ...(patch as object) }) as EntityView,
    );

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    // Open the saved view, dirty it, then switch back to the default tab.
    act(() => result.current.views.openView(SAVED_VIEW.id));
    const savedTabId = result.current.views.activeTabId;
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    expect(result.current.views.tabs.find((t) => t.tabId === savedTabId)!.dirty).toBe(true);
    act(() => result.current.views.switchTab('__default__'));
    expect(result.current.views.activeTabId).toBe('__default__');

    await act(async () => {
      await result.current.views.saveTab(savedTabId);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]).toBe(SAVED_VIEW.id);
    const savedConfig = updateMock.mock.calls[0]![1].config as unknown as ViewConfig;
    expect(savedConfig.sort.map((rule) => rule.field)).toContain('name');
    expect(result.current.views.tabs.find((t) => t.tabId === savedTabId)!.dirty).toBe(false);
  });

  it('duplicateTab duplicates the GIVEN tab', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.openView(SAVED_VIEW.id));
    const savedTabId = result.current.views.activeTabId;
    act(() => result.current.views.switchTab('__default__'));

    act(() => result.current.views.duplicateTab(savedTabId, 'Amount desc'));

    const created = result.current.views.tabs.find(
      (t) => t.name === 'Amount desc' && t.kind === 'anonymous',
    );
    expect(created).toBeDefined();
  });

  it('pinTab patches the given view and deleteTab converts its tab to anonymous', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    updateMock.mockImplementation(
      async (id, patch) => ({ ...SAVED_VIEW, id, ...(patch as object) }) as EntityView,
    );
    deleteMock.mockResolvedValue(undefined);

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.openView(SAVED_VIEW.id));
    const savedTabId = result.current.views.activeTabId;

    await act(async () => {
      await result.current.views.pinTab(savedTabId, true);
    });
    expect(updateMock).toHaveBeenCalledWith(SAVED_VIEW.id, { pinned: true });

    await act(async () => {
      await result.current.views.deleteTab(savedTabId);
    });
    expect(deleteMock).toHaveBeenCalledWith(SAVED_VIEW.id);
    const tab = result.current.views.tabs.find((t) => t.tabId === savedTabId)!;
    expect(tab.kind).toBe('anonymous');
    expect(tab.viewId).toBeUndefined();
  });

  it('setDefaultTab PATCHes is_default and moves the default role to that tab', async () => {
    // Server-side the promotion demotes the incumbent — the list mock has to
    // reflect that, otherwise the refetch would resurrect the old default.
    let server: EntityView[] = [DEFAULT_VIEW, PINNED_VIEW];
    listMock.mockImplementation(async () => server);
    updateMock.mockImplementation(async (id, patch) => {
      const promoting = (patch as { is_default?: boolean }).is_default === true;
      server = server.map((view) =>
        view.id === id
          ? { ...view, ...(patch as object), ...(promoting ? { pinned: true } : null) }
          : promoting
            ? { ...view, is_default: false }
            : view,
      ) as EntityView[];
      return server.find((view) => view.id === id)!;
    });

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));
    await waitFor(() =>
      expect(result.current.views.tabs.some((t) => t.viewId === PINNED_VIEW.id)).toBe(true),
    );

    const targetTab = result.current.views.tabs.find((t) => t.viewId === PINNED_VIEW.id)!;
    expect(targetTab.isDefault).toBe(false);

    await act(async () => {
      await result.current.views.setDefaultTab(targetTab.tabId);
    });

    expect(updateMock).toHaveBeenCalledWith(PINNED_VIEW.id, { is_default: true });
    await waitFor(() => {
      const promoted = result.current.views.tabs.find((t) => t.viewId === PINNED_VIEW.id)!;
      expect(promoted.isDefault).toBe(true);
      expect(promoted.closable).toBe(false);
    });
    // The demoted view stays open, ordinary and closable.
    const demoted = result.current.views.tabs.find((t) => t.viewId === DEFAULT_VIEW.id)!;
    expect(demoted.isDefault).toBe(false);
    expect(demoted.closable).toBe(true);
  });

  it('promoting another view while the default is still virtual stores the old one', async () => {
    let server: EntityView[] = [PINNED_VIEW]; // no is_default row yet
    listMock.mockImplementation(async () => server);
    updateMock.mockImplementation(async (id, patch) => {
      server = server.map((view) =>
        view.id === id ? ({ ...view, ...(patch as object) } as EntityView) : view,
      );
      return server.find((view) => view.id === id)!;
    });
    createMock.mockImplementation(async (payload) => {
      const created = { ...SAVED_VIEW, id: 'demoted00001', ...(payload as object) } as EntityView;
      server = [...server, created];
      return created;
    });

    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() =>
      expect(result.current.views.tabs.some((t) => t.viewId === PINNED_VIEW.id)).toBe(true),
    );

    const targetTab = result.current.views.tabs.find((t) => t.viewId === PINNED_VIEW.id)!;
    await act(async () => {
      await result.current.views.setDefaultTab(targetTab.tabId);
    });

    expect(updateMock).toHaveBeenCalledWith(PINNED_VIEW.id, { is_default: true });
    await waitFor(() => {
      // The promoted view now holds the role…
      const promoted = result.current.views.tabs.find((t) => t.viewId === PINNED_VIEW.id)!;
      expect(promoted.isDefault).toBe(true);
      // …and the virtual page default was stored so its tab stays clean (R32).
      const demoted = result.current.views.tabs.find((t) => t.name === 'YTD')!;
      expect(demoted.kind).toBe('saved');
      expect(demoted.dirty).toBe(false);
    });
  });
  it('reorderTabs POSTs the table COMPLETE id order and reorders the strip', async () => {
    const hidden: EntityView = { ...SAVED_VIEW, id: 'view000000C3', name: 'Not open', position: 2 };
    listMock.mockResolvedValue([DEFAULT_VIEW, PINNED_VIEW, hidden]);
    const reorderMock = vi.mocked(coreService.reorderEntityViews);
    reorderMock.mockResolvedValue([]);

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(3));
    await waitFor(() =>
      expect(result.current.views.tabs.some((t) => t.viewId === PINNED_VIEW.id)).toBe(true),
    );

    const ids = result.current.views.tabs.map((t) => t.tabId);
    const reversed = [...ids].reverse();
    await act(async () => {
      await result.current.views.reorderTabs(reversed);
    });

    expect(result.current.views.tabs.map((t) => t.tabId)).toEqual(reversed);
    expect(reorderMock).toHaveBeenCalledTimes(1);
    const [, sentIds] = reorderMock.mock.calls[0]!;
    // Strip order first, then the views that are not open — never a partial list.
    expect(sentIds).toEqual([PINNED_VIEW.id, DEFAULT_VIEW.id, hidden.id]);
  });

  it('keeps the default view in position order rather than always first', async () => {
    const lateDefault: EntityView = { ...DEFAULT_VIEW, position: 5 };
    listMock.mockResolvedValue([PINNED_VIEW, lateDefault]); // API orders by position

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));

    await waitFor(() => {
      const names = result.current.views.tabs.map((t) => t.name);
      expect(names).toEqual([PINNED_VIEW.name, lateDefault.name]);
    });
  });
});

// ── Round 4: Save never prompts; names are labels ────────────────────────────

describe('useEntityViews — round 4: no-prompt save', () => {
  it('saveTab on a tab with no stored view creates it under the tab label', async () => {
    listMock.mockResolvedValue([]);
    createMock.mockImplementation(
      async (payload) =>
        ({
          ...SAVED_VIEW,
          id: 'created00001',
          name: (payload as { name: string }).name,
          config: (payload as { config: EntityView['config'] }).config,
        }) as EntityView,
    );

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => result.current.views.addBlankTab());
    const tabId = result.current.views.activeTabId;
    // A fresh scratch tab carries the auto-label, not an empty name.
    expect(result.current.views.tabs.find((t) => t.tabId === tabId)!.name).toBe('New view');

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.views.saveTab(tabId);
    });

    expect(outcome).toBe('saved');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect((createMock.mock.calls[0]![0] as { name: string }).name).toBe('New view');
    const tab = result.current.views.tabs.find((t) => t.tabId === tabId)!;
    expect(tab.kind).toBe('saved');
    expect(tab.viewId).toBe('created00001');
    expect(tab.dirty).toBe(false);
  });

  it('two scratch tabs save under the identical auto-label', async () => {
    listMock.mockResolvedValue([]);
    let n = 0;
    createMock.mockImplementation(async (payload) => {
      n += 1;
      return {
        ...SAVED_VIEW,
        id: `created0000${n}`,
        name: (payload as { name: string }).name,
      } as EntityView;
    });

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => result.current.views.addBlankTab());
    const firstId = result.current.views.activeTabId;
    await act(async () => {
      await result.current.views.saveTab(firstId);
    });

    act(() => result.current.views.addBlankTab());
    const secondId = result.current.views.activeTabId;
    await act(async () => {
      await result.current.views.saveTab(secondId);
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    const names = createMock.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(names).toEqual(['New view', 'New view']);
  });

  it('addBlankTab opens a BLANK configuration, not the page default', async () => {
    // The harness default config carries a sort rule and a hidden column so a
    // "blank" tab is distinguishable from it.
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name'); // dirty the default tab
    });
    act(() => result.current.views.addBlankTab());

    expect(result.current.table.queryParams.ordering).toBeFalsy();
    expect(result.current.table.queryParams.filters).toBeUndefined();
    expect(result.current.table.cols.visibleColumns.map((c) => c.key)).toEqual([
      'name',
      'amount',
    ]);
    expect(result.current.table.cols.fixedForKey('name')).toBeUndefined();
  });

  it('blankConfig clears filters, sorting and pins and shows every column', () => {
    const seeded: ViewConfig = {
      filters: [{ logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'x' }] }],
      sort: [{ field: 'amount', direction: 'desc' }],
      columns: [
        { key: 'amount', visible: false, order: 1, pin: 'right' },
        { key: 'name', visible: true, order: 0, pin: 'left' },
      ],
      pageSize: 50,
    };

    expect(blankConfig(seeded)).toEqual({
      filters: [],
      sort: [],
      columns: [
        { key: 'name', visible: true, order: 0 },
        { key: 'amount', visible: true, order: 1 },
      ],
      pageSize: 50,
    });
  });

  it('duplicateTab keeps the source name — no "(n)" suffix', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.openView(SAVED_VIEW.id));
    const sourceId = result.current.views.activeTabId;

    act(() => result.current.views.duplicateTab(sourceId, 'Amount desc'));

    const copies = result.current.views.tabs.filter((t) => t.name === 'Amount desc');
    expect(copies).toHaveLength(2);
    expect(copies.some((t) => t.kind === 'anonymous')).toBe(true);
    expect(result.current.views.tabs.some((t) => /\(1\)/.test(t.name))).toBe(false);
  });
});

describe('useEntityViews — round 4: promotion disturbs nothing (SC-011)', () => {
  /** Pinned, but ordered LATE — it sits second in the strip. */
  const PINNED_LATE: EntityView = {
    ...SAVED_VIEW,
    id: 'pinnedLate01',
    name: 'Pinned late',
    pinned: true,
    position: 5,
  };
  /** Unpinned with an EARLY position — opened as a session tab, so it sits
   *  last in the strip even though its position would sort it first. */
  const SESSION_EARLY: EntityView = {
    ...SAVED_VIEW,
    id: 'sessionEar01',
    name: 'Session early',
    pinned: false,
    position: 1,
  };

  function statefulServer(initial: EntityView[]) {
    let server = initial;
    listMock.mockImplementation(async () => server);
    updateMock.mockImplementation(async (id, patch) => {
      const promoting = (patch as { is_default?: boolean }).is_default === true;
      server = server.map((view) =>
        view.id === id
          ? ({
              ...view,
              ...(patch as object),
              ...(promoting ? { pinned: true } : null),
            } as EntityView)
          : promoting
            ? { ...view, is_default: false }
            : view,
      );
      return server.find((view) => view.id === id)!;
    });
    createMock.mockImplementation(async (payload) => {
      const created = {
        ...SAVED_VIEW,
        id: 'materialized',
        ...(payload as object),
      } as EntityView;
      server = [...server, created];
      return created;
    });
  }

  it('does not move the promoted tab when pinning it would re-sort the strip', async () => {
    statefulServer([DEFAULT_VIEW, SESSION_EARLY, PINNED_LATE]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(3));
    await waitFor(() =>
      expect(result.current.views.tabs.some((t) => t.viewId === PINNED_LATE.id)).toBe(true),
    );

    // Open the unpinned view — session tabs append to the END of the strip.
    act(() => result.current.views.openView(SESSION_EARLY.id));
    const orderBefore = result.current.views.tabs.map((t) => t.viewId);
    expect(orderBefore[orderBefore.length - 1]).toBe(SESSION_EARLY.id);
    const targetTabId = result.current.views.tabs.find(
      (t) => t.viewId === SESSION_EARLY.id,
    )!.tabId;

    await act(async () => {
      await result.current.views.setDefaultTab(targetTabId);
    });

    await waitFor(() =>
      expect(
        result.current.views.tabs.find((t) => t.viewId === SESSION_EARLY.id)!.isDefault,
      ).toBe(true),
    );
    // Promotion pins the view; position 1 would sort it BEFORE "Pinned late"
    // (position 5) — the strip must not re-sort (SC-011).
    expect(result.current.views.tabs.map((t) => t.viewId)).toEqual(orderBefore);
  });

  it('leaves the demoted MATERIALIZED default clean', async () => {
    statefulServer([DEFAULT_VIEW, SESSION_EARLY]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));

    act(() => result.current.views.openView(SESSION_EARLY.id));
    const targetTabId = result.current.views.activeTabId;
    act(() => result.current.views.switchTab('__default__'));

    await act(async () => {
      await result.current.views.setDefaultTab(targetTabId);
    });

    await waitFor(() =>
      expect(
        result.current.views.tabs.find((t) => t.viewId === SESSION_EARLY.id)!.isDefault,
      ).toBe(true),
    );
    expect(result.current.views.tabs.every((t) => t.dirty === false)).toBe(true);
    expect(result.current.views.isAnyDirty).toBe(false);
  });

  it('leaves the demoted VIRTUAL default clean by materializing it', async () => {
    // No is_default row exists — the page default is still virtual. Demoting it
    // to an always-dirty scratch tab is exactly the reported bug, so the hook
    // stores it as an ordinary view instead (R32).
    statefulServer([SESSION_EARLY]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.openView(SESSION_EARLY.id));
    const targetTabId = result.current.views.activeTabId;
    act(() => result.current.views.switchTab('__default__'));

    await act(async () => {
      await result.current.views.setDefaultTab(targetTabId);
    });

    await waitFor(() =>
      expect(
        result.current.views.tabs.find((t) => t.viewId === SESSION_EARLY.id)!.isDefault,
      ).toBe(true),
    );
    // The old page-default tab survives, still named "YTD", stored and CLEAN.
    const demoted = result.current.views.tabs.find((t) => t.name === 'YTD')!;
    expect(demoted).toBeDefined();
    expect(demoted.kind).toBe('saved');
    expect(demoted.dirty).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect((createMock.mock.calls[0]![0] as { is_default?: boolean }).is_default).toBeFalsy();
  });
});

// ── Round 5: the row is rebuilt on every visit (FR-018/R37) ──────────────────

describe('useEntityViews — round 5: per-visit tab row', () => {
  const PINNED: EntityView = {
    ...SAVED_VIEW,
    id: 'pinned000001',
    name: 'Pinned',
    pinned: true,
    position: 1,
  };
  const UNPINNED: EntityView = {
    ...SAVED_VIEW,
    id: 'unpinned0001',
    name: 'Unpinned',
    pinned: false,
    position: 2,
  };

  it('opens only the pinned views (plus the default holder) with no URL state', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW, PINNED, UNPINNED]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(3));

    await waitFor(() => {
      const names = result.current.views.tabs.map((t) => t.name);
      expect(names).toEqual([DEFAULT_VIEW.name, PINNED.name]);
    });
    expect(result.current.views.activeTab.isDefault).toBe(true);
  });

  it('also opens the view the URL addresses, even when it is unpinned', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW, PINNED, UNPINNED]);
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?tbl.view=${UNPINNED.id}`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(3));

    await waitFor(() => {
      expect(result.current.views.tabs.some((t) => t.viewId === UNPINNED.id)).toBe(true);
    });
    // …and it is the active tab, so a refresh lands the user back where they were.
    expect(result.current.views.activeTab.viewId).toBe(UNPINNED.id);
    const names = result.current.views.tabs.map((t) => t.name);
    expect(names).toEqual([DEFAULT_VIEW.name, PINNED.name, UNPINNED.name]);
  });

  it('does not duplicate a pinned view that the URL also addresses', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW, PINNED]);
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?tbl.view=${PINNED.id}`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));

    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(PINNED.id));
    expect(result.current.views.tabs.filter((t) => t.viewId === PINNED.id)).toHaveLength(1);
  });

  it('keeps an inline URL configuration as an unsaved tab on load', async () => {
    listMock.mockResolvedValue([DEFAULT_VIEW]);
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.sort=name&tbl.size=100']),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    await waitFor(() => expect(result.current.table.limit).toBe(100));
    expect(result.current.views.activeTab.dirty).toBe(true);
  });
});

// ── Round 6: the load never publishes a half-loaded tab (FR-032/SC-015) ──────
//
// The defect: `table.loadConfig()` lands in a LATER render, but the outbound
// URL effect re-runs in the SAME commit that resolved `savedViews` — so it read
// the PRE-adoption snapshot and wrote it out as "overrides". The next load
// replayed them on top of the stored config, so the view really did differ from
// its baseline and showed the unsaved dot on arrival, with no user change.
//
// These assert on the EMITTED PARAMS, not just the dot: a dot-only assertion
// passes while the URL is being poisoned for the next visit (R41).

describe('useEntityViews — round 6: the load never publishes a half-loaded tab', () => {
  /** A materialized default whose STORED config differs from the page defaults. */
  const STORED_DEFAULT: EntityView = {
    ...DEFAULT_VIEW,
    id: 'storeddefault',
    name: 'YTD',
    config: {
      filters: [],
      sort: [{ field: 'amount', direction: 'desc' }],
      columns: [
        { key: 'name', visible: true, order: 0 },
        { key: 'amount', visible: true, order: 1 },
      ],
      pageSize: 50, // page default is 25
    },
    pinned: true,
    position: 0,
    is_default: true,
  };

  /** Override facets present in the URL (the view reference itself is fine). */
  function overrideParams(params: URLSearchParams): string[] {
    return [...params.keys()].filter((key) => key.startsWith('tbl.') && key !== 'tbl.view');
  }

  it('an untouched load is clean AND writes no override params', async () => {
    listMock.mockResolvedValue([STORED_DEFAULT]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    // The stored config is adopted…
    await waitFor(() => expect(result.current.table.limit).toBe(50));

    // …and nothing about that load looks like a user edit.
    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(overrideParams(result.current.searchParams)).toEqual([]);
  });

  it('the view-reference URL we now leave behind loads clean (loop broken)', async () => {
    listMock.mockResolvedValue([STORED_DEFAULT]);
    // Exactly what the pre-fix code emitted: the PAGE DEFAULTS dressed up as
    // overrides on top of the stored view.
    const { result } = renderHook(useNamedHarness, {
      wrapper: makeWrapper([`/?tbl.view=${STORED_DEFAULT.id}`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.table.limit).toBe(50));

    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(overrideParams(result.current.searchParams)).toEqual([]);
  });

  it('a genuine hand-edited override still marks the tab dirty (FR-013)', async () => {
    listMock.mockResolvedValue([STORED_DEFAULT]);
    const { result } = renderHook(useNamedHarness, {
      wrapper: makeWrapper([`/?tbl.view=${STORED_DEFAULT.id}&tbl.size=100`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    await waitFor(() => expect(result.current.table.limit).toBe(100));
    expect(result.current.views.activeTab.dirty).toBe(true);
  });

  it('switching between open views publishes no override params', async () => {
    const OTHER: EntityView = {
      ...SAVED_VIEW,
      id: 'otherview001',
      name: 'Other',
      pinned: true,
      position: 1,
    };
    listMock.mockResolvedValue([STORED_DEFAULT, OTHER]);
    const { result } = renderHook(useNamedHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));
    await waitFor(() =>
      expect(result.current.views.tabs.some((t) => t.viewId === OTHER.id)).toBe(true),
    );

    const otherTabId = result.current.views.tabs.find((t) => t.viewId === OTHER.id)!.tabId;
    act(() => result.current.views.switchTab(otherTabId));
    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(OTHER.id));
    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(overrideParams(result.current.searchParams)).toEqual([]);

    act(() => result.current.views.switchTab('__default__'));
    await waitFor(() => expect(result.current.views.activeTab.isDefault).toBe(true));
    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(overrideParams(result.current.searchParams)).toEqual([]);
  });
});

// ── Round 7: inline URL state never lands on a stored view (FR-018/R42) ──────
//
// Reported flow: open the catalog → "Add empty view" → reload → the DEFAULT
// view arrived carrying the unsaved dot. The dot was truthful: the inbound
// inline branch fell back to DEFAULT_TAB_ID and wrote the blank config INTO
// the default view, blanking its seeded filter — so the table listed
// everything while still labelled "YTD". These assert the CONFIG, not the dot.

describe('useEntityViews — round 7: inline URL state never lands on a stored view', () => {
  /** Catalog-like: the page default carries a seeded (year-to-date) filter. */
  const SEEDED_CONFIG: ViewConfig = {
    filters: [{ logic: 'or', conditions: [{ attr: 'name', op: 'contains', val: 'seed' }] }],
    sort: [],
    columns: [
      { key: 'name', visible: true, order: 0 },
      { key: 'amount', visible: true, order: 1 },
    ],
    pageSize: 50,
  };

  /** The table must BOOT into the same state its view config describes — the
   *  invariant every adopting page satisfies (spec Assumptions). */
  function useSeededHarness() {
    const table = useEntityTable({
      key: 'tbl',
      filterableAttrs: ATTRS,
      columnDefs: COLS,
      defaultFilterGroups: SEEDED_CONFIG.filters,
      defaultPageSize: 50,
    });
    const defaultConfig = useMemo(() => SEEDED_CONFIG, []);
    const views = useEntityViews({
      tableKey: 'tbl',
      table,
      defaultConfig,
      defaultViewName: 'YTD',
    });
    const [searchParams] = useSearchParams();
    return { table, views, searchParams };
  }

  it('restores an added empty view as its OWN tab, leaving the default intact', async () => {
    listMock.mockResolvedValue([]); // virtual default, no saved views

    const first = renderHook(useSeededHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(first.result.current.views.activeTab.dirty).toBe(false);

    act(() => first.result.current.views.addBlankTab());
    await waitFor(() => expect(first.result.current.views.tabs).toHaveLength(2));
    // A scratch tab has no stored view, so its state goes into the URL inline.
    const url = first.result.current.searchParams.toString();
    expect(url).not.toBe('');
    first.unmount();

    // Reload with exactly that URL — the user's step 3.
    const second = renderHook(useSeededHarness, { wrapper: makeWrapper([`/?${url}`]) });
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await waitFor(() => expect(second.result.current.views.tabs).toHaveLength(2));

    const defaultTab = second.result.current.views.tabs.find((t) => t.kind === 'default')!;
    const scratchTab = second.result.current.views.tabs.find((t) => t.kind === 'anonymous')!;

    // (a) the row shape: default + a SEPARATE unsaved tab, the scratch one active
    expect(defaultTab).toBeDefined();
    expect(scratchTab).toBeDefined();
    expect(second.result.current.views.activeTabId).toBe(scratchTab.tabId);
    expect(defaultTab.dirty).toBe(false);

    // (b) THE POINT: the default view still holds its seeded filter. Before the
    // fix this was the blank config, so the catalog silently listed everything.
    act(() => second.result.current.views.switchTab(defaultTab.tabId));
    await waitFor(() =>
      expect(second.result.current.table.queryParams.filters).toEqual({
        groups: SEEDED_CONFIG.filters,
      }),
    );
    expect(second.result.current.views.activeTab.dirty).toBe(false);
  });

  it('updates an ALREADY-ACTIVE unsaved tab instead of creating a second one', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useSeededHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => result.current.views.addBlankTab());
    await waitFor(() => expect(result.current.views.tabs).toHaveLength(2));
    const scratchId = result.current.views.activeTabId;

    // Editing the toolbar echoes back through the URL — no new tab may appear.
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    await waitFor(() => expect(result.current.searchParams.get('tbl.sort')).toBeTruthy());

    expect(result.current.views.tabs).toHaveLength(2);
    expect(result.current.views.activeTabId).toBe(scratchId);
  });

  it('leaves the saved-view path untouched (a .view reference still opens it)', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    const { result } = renderHook(useSeededHarness, {
      wrapper: makeWrapper([`/?tbl.view=${SAVED_VIEW.id}`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(SAVED_VIEW.id));
    expect(result.current.views.activeTab.kind).toBe('saved');
    expect(result.current.views.tabs.filter((t) => t.kind === 'anonymous')).toHaveLength(0);
  });
});

// ── Round 8: the indicator and the URL are one state seen twice ──────────────
//
// FR-033: for the ACTIVE tab, the unsaved dot appears IFF the URL carries at
// least one override parameter. Both directions catch a different failure:
//   • dot without overrides → the system invented a difference (rounds 6, 7)
//   • overrides without a dot → the URL describes state the table is not in,
//     which is what poisons the NEXT load (the round-6 loop)
// The helper is called at every step of the journey so a regression cannot hide
// in whichever moment a test happened not to sample (R43).

describe('useEntityViews — round 8: indicator/URL invariant', () => {
  /** Override facets — the view reference and the page position are not overrides. */
  function overrideParams(params: URLSearchParams): string[] {
    return [...params.keys()].filter(
      (key) => key.startsWith('tbl.') && key !== 'tbl.view' && key !== 'tbl.page',
    );
  }

  /** FR-033, asserted in BOTH directions with a message naming the broken side. */
  function expectIndicatorMatchesUrl(
    active: { dirty: boolean; kind: string },
    params: URLSearchParams,
    step: string,
  ) {
    // The invariant is scoped to tabs representing a stored view: a tab with no
    // stored view is inherently unsaved and serializes inline (FR-013 case 1).
    if (active.kind === 'anonymous') return;
    const overrides = overrideParams(params);
    if (active.dirty && overrides.length === 0) {
      throw new Error(
        `[${step}] indicator shown with NO override params — a difference was invented`,
      );
    }
    if (!active.dirty && overrides.length > 0) {
      throw new Error(
        `[${step}] override params ${JSON.stringify(overrides)} with NO indicator — ` +
          'the URL describes state the table is not in, and the next load will replay it',
      );
    }
  }

  // Verify the verifier: a net that cannot fail proves nothing (the iteration-46
  // lesson). Both violation shapes must actually throw.
  it('the invariant helper itself catches both violation shapes', () => {
    const withOverride = new URLSearchParams('tbl.view=v1&tbl.sort=name');
    const bare = new URLSearchParams('tbl.view=v1');

    expect(() =>
      expectIndicatorMatchesUrl({ dirty: true, kind: 'saved' }, bare, 'probe'),
    ).toThrow(/invented/);
    expect(() =>
      expectIndicatorMatchesUrl({ dirty: false, kind: 'saved' }, withOverride, 'probe'),
    ).toThrow(/not in/);

    // …and the two agreeing shapes must NOT throw.
    expect(() =>
      expectIndicatorMatchesUrl({ dirty: false, kind: 'saved' }, bare, 'probe'),
    ).not.toThrow();
    expect(() =>
      expectIndicatorMatchesUrl({ dirty: true, kind: 'saved' }, withOverride, 'probe'),
    ).not.toThrow();
  });

  /** A stored view whose config differs from the page defaults. */
  const STORED: EntityView = {
    ...SAVED_VIEW,
    id: 'storedview01',
    name: 'Stored',
    config: { ...DEFAULT_CONFIG, pageSize: 50, sort: [{ field: 'amount', direction: 'desc' }] },
    pinned: true,
    position: 0,
    is_default: false,
  };

  it('holds across load → edit → save → switch → back', async () => {
    let server: EntityView[] = [STORED];
    listMock.mockImplementation(async () => server);
    updateMock.mockImplementation(async (id, patch) => {
      server = server.map((v) => (v.id === id ? ({ ...v, ...(patch as object) } as EntityView) : v));
      return server.find((v) => v.id === id)!;
    });

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.views.tabs.some((t) => t.viewId === STORED.id)).toBe(true));

    const storedTabId = result.current.views.tabs.find((t) => t.viewId === STORED.id)!.tabId;
    act(() => result.current.views.switchTab(storedTabId));
    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(STORED.id));

    // (a) after load — clean, and the URL is the bare reference (FR-034)
    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'load');
    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(result.current.searchParams.get('tbl.view')).toBe(STORED.id);
    expect(overrideParams(result.current.searchParams)).toEqual([]);

    // (b) after an edit — dot AND exactly the changed facet
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(true));
    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'edit');
    expect(overrideParams(result.current.searchParams)).toEqual(['tbl.sort']);

    // (c) after Save — both clear in the same step (FR-034)
    await act(async () => {
      await result.current.views.saveTab(storedTabId);
    });
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(false));
    await waitFor(() => expect(overrideParams(result.current.searchParams)).toEqual([]));
    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'save');
    expect(result.current.searchParams.get('tbl.view')).toBe(STORED.id);

    // (d) switch away and back
    act(() => result.current.views.switchTab('__default__'));
    await waitFor(() => expect(result.current.views.activeTab.isDefault).toBe(true));
    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'switch away');

    act(() => result.current.views.switchTab(storedTabId));
    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(STORED.id));
    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'switch back');
    expect(overrideParams(result.current.searchParams)).toEqual([]);
  });

  it('holds on a remount with the URL the app left behind', async () => {
    listMock.mockResolvedValue([STORED]);
    const first = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(first.result.current.views.savedViews).toHaveLength(1));
    await waitFor(() =>
      expect(first.result.current.views.tabs.some((t) => t.viewId === STORED.id)).toBe(true),
    );
    const storedTabId = first.result.current.views.tabs.find((t) => t.viewId === STORED.id)!.tabId;
    act(() => first.result.current.views.switchTab(storedTabId));
    await waitFor(() => expect(first.result.current.views.activeTab.viewId).toBe(STORED.id));
    const url = first.result.current.searchParams.toString();
    first.unmount();

    const second = renderHook(useHarness, { wrapper: makeWrapper([`/?${url}`]) });
    await waitFor(() => expect(second.result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(second.result.current.views.activeTab.viewId).toBe(STORED.id));

    expectIndicatorMatchesUrl(
      second.result.current.views.activeTab,
      second.result.current.searchParams,
      'remount',
    );
    expect(second.result.current.views.activeTab.dirty).toBe(false);
    expect(overrideParams(second.result.current.searchParams)).toEqual([]);
  });

  it('a hand-edited override loads dirty, satisfying the invariant', async () => {
    listMock.mockResolvedValue([STORED]);
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?tbl.view=${STORED.id}&tbl.size=100`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.table.limit).toBe(100));

    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'deep link');
    expect(result.current.views.activeTab.dirty).toBe(true);
    expect(overrideParams(result.current.searchParams)).toEqual(['tbl.size']);
  });

  it('inactive tabs keep their own indicator (FR-013)', async () => {
    listMock.mockResolvedValue([STORED]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.views.tabs.some((t) => t.viewId === STORED.id)).toBe(true));

    const storedTabId = result.current.views.tabs.find((t) => t.viewId === STORED.id)!.tabId;
    act(() => result.current.views.switchTab(storedTabId));
    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(STORED.id));
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(true));

    // Switching away must NOT hide the unsaved work sitting on that tab…
    act(() => result.current.views.switchTab('__default__'));
    await waitFor(() => expect(result.current.views.activeTab.isDefault).toBe(true));
    const inactiveSaved = result.current.views.tabs.find((t) => t.viewId === STORED.id)!;
    expect(inactiveSaved.dirty).toBe(true);
    // …while the URL now describes the ACTIVE tab, so it carries no overrides.
    expect(overrideParams(result.current.searchParams)).toEqual([]);
    expectIndicatorMatchesUrl(result.current.views.activeTab, result.current.searchParams, 'inactive');

    // An unsaved scratch tab keeps its indicator while inactive too.
    act(() => result.current.views.addBlankTab());
    const scratchId = result.current.views.activeTabId;
    act(() => result.current.views.switchTab('__default__'));
    await waitFor(() => expect(result.current.views.activeTab.isDefault).toBe(true));
    expect(result.current.views.tabs.find((t) => t.tabId === scratchId)!.dirty).toBe(true);
  });
});

// ── Round 9: the stored default view is adopted on arrival (FR-036/R44) ──────
//
// Observed in the RUNNING app (read-only probe): navigating to the catalog
// produced `?…view=<id>&.f=…&.sort=…&.size=50` plus an unsaved dot, surviving
// reloads. The stored default view was referenced but never LOADED, so every
// facet serialized as an "override". Asserts CONTENT — the round-8
// dot⟺overrides invariant stays green through this bug and cannot see it.

describe('useEntityViews — round 9: the stored default view is adopted on arrival', () => {
  /** Page defaults: a seeded filter, a sort, 50/page — catalog-shaped. */
  const PAGE_FILTERS: ViewConfig['filters'] = [
    {
      logic: 'or',
      conditions: [{ attr: 'name', op: 'contains', val: 'seed' }],
    },
  ];
  // The catalog declares SPARSE, FRACTIONAL orders (-1, 4.5, 5.2, … 99 for the
  // pinned actions column). Dense 0..N orders hide this bug entirely.
  const PAGE_CONFIG: ViewConfig = {
    filters: PAGE_FILTERS,
    sort: [{ field: 'amount', direction: 'desc' }],
    columns: [
      { key: 'name', visible: true, order: -1, pin: 'left' },
      { key: 'amount', visible: true, order: 4.5 },
      { key: 'actions', visible: true, order: 99, pin: 'right' },
    ],
    pageSize: 50,
  };

  /** The STORED default view — deliberately different from the page defaults. */
  const STORED_DEFAULT: EntityView = {
    ...DEFAULT_VIEW,
    id: 'storeddflt01',
    name: 'YTD',
    config: {
      filters: [],
      sort: [{ field: 'name', direction: 'asc' }],
      columns: PAGE_CONFIG.columns,
      pageSize: 25,
    },
    pinned: true,
    position: 0,
    is_default: true,
  };

  const PINNED_OTHER: EntityView = {
    ...SAVED_VIEW,
    id: 'pinnedother1',
    name: 'Pinned other',
    pinned: true,
    position: 1,
  };

  function useCatalogHarness() {
    const table = useEntityTable({
      key: 'tbl',
      filterableAttrs: ATTRS,
      columnDefs: [
        { key: 'name', label: 'Name', dataType: 'text', visible: true, order: -1, pin: 'left' },
        { key: 'amount', label: 'Amount', dataType: 'number', visible: true, order: 4.5 },
        { key: 'actions', label: 'Actions', dataType: 'text', visible: true, order: 99, pin: 'right' },
      ],
      defaultFilterGroups: PAGE_FILTERS,
      defaultSortRules: PAGE_CONFIG.sort,
      defaultPageSize: 50,
    });
    const defaultConfig = useMemo(() => PAGE_CONFIG, []);
    const views = useEntityViews({
      tableKey: 'tbl',
      table,
      defaultConfig,
      defaultViewName: 'YTD',
    });
    const [searchParams] = useSearchParams();
    return { table, views, searchParams };
  }

  const overrideParams = (params: URLSearchParams): string[] =>
    [...params.keys()].filter((key) => key.startsWith('tbl.') && key !== 'tbl.view');

  it('applies the STORED configuration and leaves the URL free of overrides', async () => {
    listMock.mockResolvedValue([STORED_DEFAULT, PINNED_OTHER]);
    const { result } = renderHook(useCatalogHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));

    // The table must hold the STORED view's config, not the page defaults.
    expect(result.current.table.limit).toBe(25);
    expect(result.current.table.queryParams.ordering).toBe('name');
    // …so nothing is an "override", and nothing is unsaved.
    expect(overrideParams(result.current.searchParams)).toEqual([]);
    expect(result.current.views.activeTab.dirty).toBe(false);
  });
});

// ── Round 10: the column universe grows AFTER mount (R46) ───────────────────
//
// The catalog's `attr:*` columns come from an async query, so `defaultConfig`
// gains columns a few commits after the tab row is built. The round-9 harness
// above holds a FIXED column set, which is exactly why it stayed green while
// the real page failed: the default tab's mount-time config snapshot can never
// equal the grown defaults again (reconcile appends late columns at the END,
// while the page declares them mid-order), so adoption bailed forever and the
// page defaults were published as "overrides" of the stored view.

describe('useEntityViews — round 10: late-arriving columns must not block adoption', () => {
  const PAGE_FILTERS: ViewConfig['filters'] = [
    { logic: 'or', conditions: [{ attr: 'name', op: 'contains', val: 'seed' }] },
  ];
  const PAGE_SORT: ViewConfig['sort'] = [{ field: 'amount', direction: 'desc' }];

  /** Declared column order: the async `attr:*` columns sit BEFORE `actions`. */
  const columnDefsFor = (attrIds: string[]): ColumnDef[] => [
    { key: 'name', label: 'Name', dataType: 'text', visible: true, order: -1, pin: 'left' },
    { key: 'amount', label: 'Amount', dataType: 'number', visible: true, order: 4.5 },
    ...attrIds.map((id, i) => ({
      key: `attr:${id}`,
      label: id,
      dataType: 'text' as const,
      visible: false,
      order: 5 + i,
    })),
    { key: 'actions', label: 'Actions', dataType: 'text', visible: true, order: 99, pin: 'right' },
  ];

  const configFor = (attrIds: string[]): ViewConfig => ({
    filters: PAGE_FILTERS,
    sort: PAGE_SORT,
    columns: columnDefsFor(attrIds).map((c) => ({
      key: c.key,
      visible: c.visible,
      order: c.order,
      pin: c.pin,
    })),
    pageSize: 50,
  });

  const ATTR_IDS = ['YOGyUIN1xK2J', 'yrt1HGbrVjSn'];

  /** The stored default view — saved when every column was known, and
   *  deliberately different from the page defaults (no filter, 25/page). */
  const STORED_DEFAULT: EntityView = {
    ...DEFAULT_VIEW,
    id: 'storeddflt02',
    name: 'All - 2',
    config: {
      filters: [],
      sort: [{ field: 'name', direction: 'asc' }],
      columns: configFor(ATTR_IDS).columns,
      pageSize: 25,
    },
    pinned: true,
    position: 0,
    is_default: true,
  };

  /** Catalog-shaped: attribute definitions (and their columns) resolve a tick
   *  after mount, before the saved-view list arrives. */
  function useLateColumnsHarness() {
    const [attrIds, setAttrIds] = React.useState<string[]>([]);
    React.useEffect(() => {
      const id = setTimeout(() => setAttrIds(ATTR_IDS), 0);
      return () => clearTimeout(id);
    }, []);
    const columnDefs = useMemo(() => columnDefsFor(attrIds), [attrIds]);
    const table = useEntityTable({
      key: 'tbl',
      filterableAttrs: ATTRS,
      columnDefs,
      defaultFilterGroups: PAGE_FILTERS,
      defaultSortRules: PAGE_SORT,
      defaultPageSize: 50,
    });
    const defaultConfig = useMemo(() => configFor(attrIds), [attrIds]);
    const views = useEntityViews({ tableKey: 'tbl', table, defaultConfig, defaultViewName: 'YTD' });
    const [searchParams] = useSearchParams();
    return { table, views, searchParams };
  }

  const overrideParams = (params: URLSearchParams): string[] =>
    [...params.keys()].filter((key) => key.startsWith('tbl.') && key !== 'tbl.view');

  beforeEach(() => {
    // Saved views resolve AFTER the columns, as observed in the running app.
    listMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([STORED_DEFAULT]), 20)),
    );
  });

  it('adopts the stored default view and writes NO params', async () => {
    const { result } = renderHook(useLateColumnsHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.table.limit).toBe(25));

    expect(result.current.table.queryParams.ordering).toBe('name');
    expect(result.current.views.activeTab.dirty).toBe(false);
    // The reported symptom: the page defaults serialized as overrides of the
    // stored view (`tbl.f`/`tbl.sort`/`tbl.size`), which the next load replayed.
    expect(overrideParams(result.current.searchParams)).toEqual([]);
  });

  it('leaves a URL-addressed view alone (deep links still win)', async () => {
    listMock.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve([STORED_DEFAULT, SAVED_VIEW]), 20)),
    );
    const { result } = renderHook(useLateColumnsHarness, {
      wrapper: makeWrapper([`/?tbl.view=${SAVED_VIEW.id}`]),
    });
    await waitFor(() => expect(result.current.views.activeTab.viewId).toBe(SAVED_VIEW.id));
    expect(result.current.table.limit).toBe(50); // the deep-linked view's page size
  });

  it('does not fight a user who edits while the view list is still loading', async () => {
    const { result } = renderHook(useLateColumnsHarness, { wrapper: makeWrapper() });
    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    const edited = result.current.table.queryParams.ordering;
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));

    // The edit survives: adoption never overwrites state the user established.
    expect(result.current.table.queryParams.ordering).toBe(edited);
    expect(result.current.table.limit).toBe(50);
  });
});

// ── Round 9: "Reset changes" (FR-035/R45) ───────────────────────────────────

describe('useEntityViews — round 9: resetTab', () => {
  const overrides = (params: URLSearchParams): string[] =>
    [...params.keys()].filter((key) => key.startsWith('tbl.') && key !== 'tbl.view');

  it('returns a dirty saved tab to its stored configuration', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.openView(SAVED_VIEW.id));
    const tabId = result.current.views.activeTabId;
    expect(result.current.table.limit).toBe(50); // the stored page size

    act(() => result.current.table.setLimit(100));
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(true));
    await waitFor(() => expect(overrides(result.current.searchParams)).toContain('tbl.size'));

    act(() => result.current.views.resetTab(tabId));

    await waitFor(() => expect(result.current.table.limit).toBe(50));
    expect(result.current.views.activeTab.dirty).toBe(false);
    await waitFor(() => expect(overrides(result.current.searchParams)).toEqual([]));
    // Reset touches no stored data.
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns a scratch tab to the blank config it was created with', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => result.current.views.addBlankTab());
    const tabId = result.current.views.activeTabId;
    const blankSize = result.current.table.limit;

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    act(() => result.current.table.setLimit(100));
    await waitFor(() => expect(result.current.table.queryParams.ordering).toBeTruthy());

    act(() => result.current.views.resetTab(tabId));

    await waitFor(() => expect(result.current.table.queryParams.ordering).toBeFalsy());
    expect(result.current.table.limit).toBe(blankSize);
  });

  it('resets an INACTIVE tab without disturbing the active one', async () => {
    listMock.mockResolvedValue([SAVED_VIEW]);
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => result.current.views.openView(SAVED_VIEW.id));
    const savedTabId = result.current.views.activeTabId;
    act(() => result.current.table.setLimit(100)); // dirty the saved tab
    await waitFor(() =>
      expect(result.current.views.tabs.find((t) => t.tabId === savedTabId)!.dirty).toBe(true),
    );

    act(() => result.current.views.switchTab('__default__'));
    const activeLimitBefore = result.current.table.limit;

    act(() => result.current.views.resetTab(savedTabId));

    await waitFor(() =>
      expect(result.current.views.tabs.find((t) => t.tabId === savedTabId)!.dirty).toBe(false),
    );
    // The active (default) tab and the table are untouched.
    expect(result.current.views.activeTabId).toBe('__default__');
    expect(result.current.table.limit).toBe(activeLimitBefore);
  });
});
