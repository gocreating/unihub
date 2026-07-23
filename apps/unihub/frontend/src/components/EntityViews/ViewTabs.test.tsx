// 016 ViewTabs row (round 2): tabs, "+"-after-last-tab placement, dirty dot,
// double-click rename, collapsed reveal affordance, View dropdown.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ViewTabs } from './ViewTabs';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';
import type { EntityView } from '@/services/unihub-backend/core';

function makeTab(overrides: Partial<ViewTabState> = {}): ViewTabState {
  return {
    tabId: 'tab-default',
    kind: 'default',
    name: '',
    dirty: false,
    pinned: true,
    closable: false,
    ...overrides,
  };
}

function makeSavedView(overrides: Partial<EntityView> = {}): EntityView {
  return {
    id: 'v1',
    table_key: 'tbl',
    name: 'Amount desc',
    config: {},
    pinned: false,
    position: 0,
    is_default: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function makeViews(overrides: Partial<UseEntityViewsReturn> = {}): UseEntityViewsReturn {
  const defaultTab = makeTab();
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.tabId,
    activeTab: defaultTab,
    savedViews: [],
    isAnyDirty: false,
    collapsed: false,
    reveal: vi.fn(),
    switchTab: vi.fn(),
    addAnonymousTab: vi.fn(),
    closeTab: vi.fn(),
    openView: vi.fn(),
    saveActiveTab: vi.fn().mockResolvedValue('saved'),
    saveActiveTabAs: vi.fn().mockResolvedValue(undefined),
    renameTab: vi.fn().mockResolvedValue(undefined),
    duplicateActiveTab: vi.fn(),
    commitManageChanges: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as UseEntityViewsReturn;
}

function renderTabs(views: UseEntityViewsReturn) {
  return render(
    <IntlProvider locale="en" messages={enUS}>
      <ViewTabs views={views} />
    </IntlProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ViewTabs', () => {
  it('renders the default tab with the localized "Table" label, active', () => {
    renderTabs(makeViews());
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab).toBeInTheDocument();
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('renders a page-provided default name when given', () => {
    const namedTab = makeTab({ name: 'YTD' });
    renderTabs(makeViews({ tabs: [namedTab], activeTab: namedTab }));
    expect(screen.getByRole('tab', { name: /ytd/i })).toBeInTheDocument();
  });

  it('shows the unsaved indicator only on dirty tabs', () => {
    const dirtyTab = makeTab({ dirty: true });
    renderTabs(makeViews({ tabs: [dirtyTab], activeTab: dirtyTab, isAnyDirty: true }));
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument();
  });

  it('renders no unsaved indicator on clean tabs', () => {
    renderTabs(makeViews());
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
  });

  it('the "+" button opens a new anonymous tab', () => {
    const views = makeViews();
    renderTabs(views);
    fireEvent.click(screen.getByLabelText('New view tab'));
    expect(views.addAnonymousTab).toHaveBeenCalledTimes(1);
  });

  it('clicking an inactive tab switches to it', () => {
    const a = makeTab();
    const b = makeTab({
      tabId: 'tab-b',
      kind: 'saved',
      viewId: 'v1',
      name: 'Mine',
      pinned: false,
      closable: true,
    });
    const views = makeViews({ tabs: [a, b], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);
    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    expect(views.switchTab).toHaveBeenCalledWith('tab-b');
  });

  it('View dropdown lists saved views and opens one on click', async () => {
    const views = makeViews({ savedViews: [makeSavedView()] });
    renderTabs(views);
    fireEvent.click(screen.getByRole('button', { name: /^view/i }));
    const item = await screen.findByText('Amount desc');
    fireEvent.click(item);
    expect(views.openView).toHaveBeenCalledWith('v1');
  });

  it('Save menu item is disabled when nothing is dirty and enabled when dirty', async () => {
    const { unmount } = renderTabs(makeViews({ isAnyDirty: false }));
    fireEvent.click(screen.getByRole('button', { name: /^view/i }));
    const saveItem = await screen.findByText('Save');
    expect(saveItem.closest('li')?.getAttribute('aria-disabled')).toBe('true');
    unmount();

    const dirtyViews = makeViews({ isAnyDirty: true });
    renderTabs(dirtyViews);
    fireEvent.click(screen.getByRole('button', { name: /^view/i }));
    const enabled = await screen.findByText('Save');
    expect(enabled.closest('li')?.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(enabled);
    expect(dirtyViews.saveActiveTab).toHaveBeenCalled();
  });
});

describe('ViewTabs — US2 layout & closing', () => {
  it('arranges the tab strip first, then "+", then the View control', () => {
    const { container } = renderTabs(makeViews());
    const row = container.firstElementChild!;
    const children = Array.from(row.children);
    // [ tablist strip ] [ + button ] [ spacer ] [ view control ]
    expect(children[0]!.getAttribute('role')).toBe('tablist');
    expect(children[1]!.getAttribute('aria-label')).toBe('New view tab');
    expect(children[children.length - 1]!.textContent).toContain('View');
  });

  it('keeps the "+" button OUTSIDE the scrollable tab strip', () => {
    renderTabs(makeViews());
    const strip = screen.getByTestId('view-tabs-strip');
    expect(strip.querySelector('[aria-label="New view tab"]')).toBeNull();
  });

  it('renders a close affordance only on closable tabs and calls closeTab', () => {
    const a = makeTab();
    const b = makeTab({
      tabId: 'tab-b',
      kind: 'saved',
      viewId: 'v1',
      name: 'Mine',
      pinned: false,
      closable: true,
    });
    const views = makeViews({ tabs: [a, b], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);
    const closeButtons = screen.getAllByLabelText('Close tab');
    expect(closeButtons).toHaveLength(1);
    fireEvent.click(closeButtons[0]!);
    expect(views.closeTab).toHaveBeenCalledWith('tab-b');
    expect(views.switchTab).not.toHaveBeenCalled(); // close must not switch tabs
  });
});

describe('ViewTabs — US2 round 2: collapsed reveal affordance (FR-025)', () => {
  it('renders only the reveal affordance when collapsed and reveals on click', () => {
    const views = makeViews({ collapsed: true });
    renderTabs(views);
    expect(screen.queryByRole('tablist')).toBeNull();
    const reveal = screen.getByLabelText('Show views');
    fireEvent.click(reveal);
    expect(views.reveal).toHaveBeenCalledTimes(1);
  });

  it('surfaces the dirty dot on the collapsed affordance when the default tab is dirty', () => {
    const dirtyTab = makeTab({ dirty: true });
    const { container } = renderTabs(
      makeViews({ collapsed: true, tabs: [dirtyTab], activeTab: dirtyTab }),
    );
    // AntD Badge renders a dot element when dot + active.
    expect(container.querySelector('.ant-badge-dot')).not.toBeNull();
  });
});

describe('ViewTabs — US4 round 2: double-click rename (FR-023)', () => {
  it('double-clicking a saved tab opens an inline input and commits on Enter', async () => {
    const saved = makeTab({
      tabId: 'tab-b',
      kind: 'saved',
      viewId: 'v1',
      name: 'Mine',
      pinned: false,
      closable: true,
    });
    const views = makeViews({ tabs: [saved], activeTabId: saved.tabId, activeTab: saved });
    renderTabs(views);

    fireEvent.doubleClick(screen.getByRole('tab', { name: /mine/i }));
    const input = screen.getByLabelText('View name') as HTMLInputElement;
    expect(input.value).toBe('Mine');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' }); // onPressEnter path

    await waitFor(() => expect(views.renameTab).toHaveBeenCalledWith('tab-b', 'Renamed'));
  });

  it('Escape cancels the rename without calling renameTab', () => {
    const saved = makeTab({
      tabId: 'tab-b',
      kind: 'saved',
      viewId: 'v1',
      name: 'Mine',
      pinned: false,
      closable: true,
    });
    const views = makeViews({ tabs: [saved], activeTabId: saved.tabId, activeTab: saved });
    renderTabs(views);

    fireEvent.doubleClick(screen.getByRole('tab', { name: /mine/i }));
    const input = screen.getByLabelText('View name');
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(views.renameTab).not.toHaveBeenCalled();
  });

  it('double-clicking an anonymous tab opens the name-and-save modal instead', () => {
    const anon = makeTab({
      tabId: 'tab-anon',
      kind: 'anonymous',
      name: 'Draft',
      pinned: false,
      closable: true,
    });
    const views = makeViews({ tabs: [anon], activeTabId: anon.tabId, activeTab: anon });
    renderTabs(views);

    fireEvent.doubleClick(screen.getByRole('tab', { name: /draft/i }));
    // The name-and-save modal opens (title "Save view"); no in-place rename.
    expect(screen.getByText('Save view')).toBeInTheDocument();
    expect(views.renameTab).not.toHaveBeenCalled();
  });
});
