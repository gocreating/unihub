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
  it('applies inline facet params on mount and marks the default tab dirty', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper(['/?tbl.sort=-amount&tbl.size=100']),
    });
    await waitFor(() => expect(result.current.table.queryParams.ordering).toBe('-amount'));
    expect(result.current.table.limit).toBe(100);
    expect(result.current.views.activeTab.kind).toBe('default');
    expect(result.current.views.activeTab.dirty).toBe(true);
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
