// US1 (016): save a table configuration and reopen it later — hook core.
import React, { useMemo } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enUS from '@/locales/en-US';
import { useEntityTable } from '../EntityToolbar/useEntityTable';
import type { ColumnDef, FilterableAttribute, ViewConfig } from '../EntityToolbar/types';
import { useEntityViews } from './useEntityViews';
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
  stickyLeft: false,
  stickyRight: false,
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
      { key: 'amount', visible: true, order: 0 },
      { key: 'name', visible: false, order: 1 },
    ],
    stickyLeft: true,
    stickyRight: false,
    pageSize: 50,
  },
  pinned: false,
  position: 0,
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

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  listMock.mockResolvedValue([SAVED_VIEW]);
});

describe('useEntityViews — US1 core', () => {
  it('starts with the default Tabular tab active and clean', async () => {
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
    expect(result.current.table.cols.fixedForKey('amount')).toBe('left');
  });

  it('saveActiveTab persists a dirty saved view and clears the indicator', async () => {
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
      outcome = await result.current.views.saveActiveTab();
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

  it('saveActiveTab on the default tab requests a name instead of writing', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.views.saveActiveTab();
    });

    expect(outcome).toBe('needs-name');
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saveActiveTabAs creates a view and activates a clean saved tab', async () => {
    createMock.mockImplementation(async (payload) => ({
      id: 'view000000B2',
      table_key: payload.table_key,
      name: payload.name,
      config: payload.config as EntityView['config'],
      pinned: false,
      position: 1,
      created_at: '2026-07-20T00:00:00Z',
      updated_at: '2026-07-20T00:00:00Z',
    }));
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    await act(async () => {
      await result.current.views.saveActiveTabAs('My sorted view');
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0].table_key).toBe('tbl');
    expect(createMock.mock.calls[0]![0].name).toBe('My sorted view');

    const active = result.current.views.activeTab;
    expect(active.kind).toBe('saved');
    expect(active.name).toBe('My sorted view');
    expect(active.dirty).toBe(false);
    // The Tabular tab reverted to pristine defaults.
    const defaultTab = result.current.views.tabs.find((t) => t.kind === 'default')!;
    expect(defaultTab.dirty).toBe(false);
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
    expect(second!.closable).toBe(false);
    expect(third!.name).toBe('Pinned B');
    // Merging pinned tabs does not steal focus.
    expect(result.current.views.activeTabId).toBe(first!.tabId);
  });

  it('"+" opens an anonymous tab with the default config, active immediately', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });
    act(() => {
      result.current.views.addAnonymousTab();
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

  it('open tabs and the active tab survive a remount within the session', async () => {
    const wrapper = makeWrapper();
    const first = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(first.result.current.views.savedViews).toHaveLength(1));

    act(() => {
      first.result.current.views.openView(SAVED_VIEW.id);
    });
    const activeName = first.result.current.views.activeTab.name;
    first.unmount();

    const second = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(second.result.current.views.savedViews).toHaveLength(1));
    expect(second.result.current.views.tabs).toHaveLength(2);
    expect(second.result.current.views.activeTab.name).toBe(activeName);
    // The restored active tab's config drives the table again.
    expect(second.result.current.table.queryParams.ordering).toBe('-amount');
  });

  it('a cleared session drops anonymous/unpinned tabs (fresh-session behavior)', async () => {
    const first = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(first.result.current.views.savedViews).toHaveLength(1));
    act(() => {
      first.result.current.views.addAnonymousTab();
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

describe('useEntityViews — US3 URL sync', () => {
  const PARAM = 'view[tbl]';

  it('applies an inline view URL on mount and marks the default tab dirty', async () => {
    const inner = 'type=inline&ordering=-amount&page_size=100';
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${encodeURIComponent(PARAM)}=${encodeURIComponent(inner)}`]),
    });
    await waitFor(() => expect(result.current.table.queryParams.ordering).toBe('-amount'));
    expect(result.current.table.limit).toBe(100);
    expect(result.current.views.activeTab.kind).toBe('default');
    expect(result.current.views.activeTab.dirty).toBe(true);
  });

  it('opens a saved view from a URL reference, clean', async () => {
    const inner = `type=saved&id=${SAVED_VIEW.id}`;
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${encodeURIComponent(PARAM)}=${encodeURIComponent(inner)}`]),
    });
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('saved'));
    expect(result.current.views.activeTab.name).toBe('Amount desc');
    expect(result.current.views.activeTab.dirty).toBe(false);
    expect(result.current.table.queryParams.ordering).toBe('-amount');
    expect(result.current.table.limit).toBe(50);
  });

  it('layers URL overrides onto a saved view and shows the unsaved indicator', async () => {
    const inner = `type=saved&id=${SAVED_VIEW.id}&page_size=100`;
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${encodeURIComponent(PARAM)}=${encodeURIComponent(inner)}`]),
    });
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('saved'));
    expect(result.current.table.limit).toBe(100);
    await waitFor(() => expect(result.current.views.activeTab.dirty).toBe(true));
  });

  it('falls back to the Tabular default for an unresolvable saved id', async () => {
    const inner = 'type=saved&id=doesNotExist1';
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${encodeURIComponent(PARAM)}=${encodeURIComponent(inner)}`]),
    });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));
    await waitFor(() => expect(result.current.views.activeTab.kind).toBe('default'));
    expect(result.current.table.queryParams.ordering).toBeUndefined();
  });

  it('falls back to the Tabular default for a corrupt serialization', async () => {
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${encodeURIComponent(PARAM)}=type%3Dbogus`]),
    });
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(result.current.views.activeTab.kind).toBe('default');
    expect(result.current.views.activeTab.dirty).toBe(false);
  });

  it('transports the page position into the offset', async () => {
    const inner = 'type=inline&page=3';
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${encodeURIComponent(PARAM)}=${encodeURIComponent(inner)}`]),
    });
    await waitFor(() => expect(result.current.table.offset).toBe(50)); // (3-1) × 25
  });

  it('keeps the URL in sync with the active tab state', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    await waitFor(() => {
      const raw = result.current.searchParams.get(PARAM);
      expect(raw).toContain('ordering=');
      expect(raw).toContain('name');
    });
  });

  it('leaves other tables’ view params untouched', async () => {
    const other = `${encodeURIComponent('view[other]')}=type%3Dinline%26page_size%3D100`;
    const { result } = renderHook(useHarness, {
      wrapper: makeWrapper([`/?${other}`]),
    });
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.table.sort.handleHeaderClick('name');
    });

    await waitFor(() => expect(result.current.searchParams.get(PARAM)).not.toBeNull());
    expect(result.current.searchParams.get('view[other]')).toBe('type=inline&page_size=100');
  });
});

describe('useEntityViews — US4 duplicate & manage commit', () => {
  it('duplicateActiveTab names copies "X (1)", "X (2)", … using the first unused suffix', async () => {
    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(1));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    act(() => {
      result.current.views.duplicateActiveTab('Amount desc');
    });
    expect(result.current.views.activeTab.kind).toBe('anonymous');
    expect(result.current.views.activeTab.name).toBe('Amount desc (1)');
    expect(result.current.views.activeTab.dirty).toBe(true);
    // The duplicate carries the source view's config.
    expect(result.current.table.queryParams.ordering).toBe('-amount');

    act(() => {
      result.current.views.switchTab(
        result.current.views.tabs.find((tab) => tab.kind === 'saved')!.tabId,
      );
    });
    act(() => {
      result.current.views.duplicateActiveTab('Amount desc');
    });
    expect(result.current.views.activeTab.name).toBe('Amount desc (2)');
  });

  it('commitManageChanges deletes, patches, reorders, and converts open tabs (FR-019)', async () => {
    const second: EntityView = { ...SAVED_VIEW, id: 'view000000C3', name: 'Second', pinned: false };
    listMock.mockResolvedValue([SAVED_VIEW, second]);
    updateMock.mockImplementation(async (id, patch) => ({ ...second, id, ...(patch as object) }) as EntityView);
    deleteMock.mockResolvedValue(undefined);
    vi.mocked(coreService.reorderEntityViews).mockResolvedValue([]);

    const { result } = renderHook(useHarness, { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.views.savedViews).toHaveLength(2));

    act(() => {
      result.current.views.openView(SAVED_VIEW.id);
    });
    const openedTabId = result.current.views.activeTabId;

    await act(async () => {
      await result.current.views.commitManageChanges({
        items: [{ id: second.id, name: 'Renamed second', pinned: true }],
        deletedIds: [SAVED_VIEW.id],
      });
    });

    expect(deleteMock).toHaveBeenCalledWith(SAVED_VIEW.id);
    expect(updateMock).toHaveBeenCalledWith(second.id, { name: 'Renamed second', pinned: true });
    // FR-019: the deleted view's open tab lives on as an anonymous tab.
    const tab = result.current.views.tabs.find((t) => t.tabId === openedTabId)!;
    expect(tab.kind).toBe('anonymous');
    expect(tab.viewId).toBeUndefined();
    expect(result.current.table.queryParams.ordering).toBe('-amount'); // config kept
  });
});
