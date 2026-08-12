// 016 ViewTabs row (round 3): scrollbar-free strip with edge shadows, drag
// reorder, per-tab menus (left-click active / right-click any), kebab at the
// right edge, collapsed reveal affordance.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ViewTabs, overflowSides } from './ViewTabs';
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
    isDefault: true,
    ...overrides,
  };
}

function makeSavedTab(overrides: Partial<ViewTabState> = {}): ViewTabState {
  return makeTab({
    tabId: 'tab-b',
    kind: 'saved',
    viewId: 'v1',
    name: 'Mine',
    pinned: false,
    closable: true,
    isDefault: false,
    ...overrides,
  });
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
    ready: true,
    collapsed: false,
    reveal: vi.fn(),
    switchTab: vi.fn(),
    addBlankTab: vi.fn(),
    closeTab: vi.fn(),
    openView: vi.fn(),
    saveTab: vi.fn().mockResolvedValue('saved'),
    renameTab: vi.fn().mockResolvedValue(undefined),
    duplicateTab: vi.fn(),
    pinTab: vi.fn().mockResolvedValue(undefined),
    setDefaultTab: vi.fn().mockResolvedValue(undefined),
    deleteTab: vi.fn().mockResolvedValue(undefined),
    reorderTabs: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UseEntityViewsReturn;
}

function renderTabs(views: UseEntityViewsReturn) {
  return render(
    <IntlProvider locale="en" messages={enUS}>
      <ViewTabs views={views} />
    </IntlProvider>,
  );
}

/** jsdom has no layout — fake the strip metrics an overflowing row would have. */
function mockStripMetrics(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  const strip = screen.getByTestId('view-tabs-strip');
  Object.defineProperty(strip, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(strip, 'scrollWidth', { value: scrollWidth, configurable: true });
  strip.scrollLeft = scrollLeft;
  fireEvent.scroll(strip);
  return strip;
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
});

describe('ViewTabs — round 11: no flash (FR-038)', () => {
  it('paints no tabs until the row is ready, and reserves its height', () => {
    const { container } = renderTabs(makeViews({ ready: false }));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByLabelText('View menu')).toBeNull();
    // The row still occupies its place, so nothing below it shifts.
    const placeholder = screen.getByTestId('view-tabs-loading');
    expect(container.firstElementChild).toBe(placeholder);
    expect(placeholder.firstElementChild).toHaveStyle({ visibility: 'hidden' });
  });

  it('paints the complete tab set once ready', () => {
    renderTabs(makeViews({ ready: true, tabs: [makeTab(), makeSavedTab()] }));
    expect(screen.queryByTestId('view-tabs-loading')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});

describe('ViewTabs — round 3 layout (FR-009/FR-020)', () => {
  it('renders the strip then the kebab — no "+" and no "View" control', () => {
    const { container } = renderTabs(makeViews());
    const row = container.firstElementChild!;
    expect(row.querySelector('[role="tablist"]')).not.toBeNull();
    expect(screen.getByLabelText('View menu')).toBeInTheDocument();
    expect(screen.queryByLabelText('New view tab')).toBeNull();
    expect(screen.queryByRole('button', { name: /^view$/i })).toBeNull();
    // The kebab is the row's last control.
    expect(row.lastElementChild!.contains(screen.getByLabelText('View menu'))).toBe(true);
  });

  it('keeps the kebab OUTSIDE the scrolling strip', () => {
    renderTabs(makeViews());
    const strip = screen.getByTestId('view-tabs-strip');
    expect(strip.querySelector('[aria-label="View menu"]')).toBeNull();
  });

  it('hides the strip scrollbar', () => {
    renderTabs(makeViews());
    const strip = screen.getByTestId('view-tabs-strip');
    const style = getComputedStyle(strip);
    expect(style.overflowX).toBe('auto');
    expect(style.scrollbarWidth).toBe('none');
  });

  it('derives the edge shadows from the strip scroll metrics', () => {
    // Pure helper — the same arithmetic the component runs on scroll/resize.
    expect(overflowSides({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 })).toEqual({
      left: false,
      right: false,
    });
    expect(overflowSides({ scrollLeft: 0, clientWidth: 300, scrollWidth: 900 })).toEqual({
      left: false,
      right: true,
    });
    expect(overflowSides({ scrollLeft: 200, clientWidth: 300, scrollWidth: 900 })).toEqual({
      left: true,
      right: true,
    });
    expect(overflowSides({ scrollLeft: 600, clientWidth: 300, scrollWidth: 900 })).toEqual({
      left: true,
      right: false,
    });
  });

  it('paints a right shadow while tabs overflow and both shadows mid-scroll', async () => {
    renderTabs(makeViews({ tabs: [makeTab(), makeSavedTab()] }));

    mockStripMetrics(0, 300, 900);
    await waitFor(() => expect(screen.getByTestId('view-tabs-shadow-right')).toBeInTheDocument());
    expect(screen.queryByTestId('view-tabs-shadow-left')).toBeNull();

    mockStripMetrics(200, 300, 900);
    await waitFor(() => expect(screen.getByTestId('view-tabs-shadow-left')).toBeInTheDocument());
    expect(screen.getByTestId('view-tabs-shadow-right')).toBeInTheDocument();

    mockStripMetrics(600, 300, 900);
    await waitFor(() => expect(screen.queryByTestId('view-tabs-shadow-right')).toBeNull());
    expect(screen.getByTestId('view-tabs-shadow-left')).toBeInTheDocument();
  });

  it('renders no shadow when the tabs fit', () => {
    renderTabs(makeViews());
    mockStripMetrics(0, 300, 300);
    expect(screen.queryByTestId('view-tabs-shadow-left')).toBeNull();
    expect(screen.queryByTestId('view-tabs-shadow-right')).toBeNull();
  });

  it('renders tabs as sortable items so they can be dragged into a new order', () => {
    renderTabs(makeViews({ tabs: [makeTab(), makeSavedTab()] }));
    const strip = screen.getByTestId('view-tabs-strip');
    expect(strip.querySelector('[data-sortable-id="tab-default"]')).not.toBeNull();
    expect(strip.querySelector('[data-sortable-id="tab-b"]')).not.toBeNull();
  });
});

describe('ViewTabs — round 3 click grammar (FR-023)', () => {
  it('left-clicking an INACTIVE tab switches to it without opening a menu', () => {
    const a = makeTab();
    const b = makeSavedTab();
    const views = makeViews({ tabs: [a, b], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);

    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    expect(views.switchTab).toHaveBeenCalledWith('tab-b');
    expect(screen.queryByText('Set as default')).toBeNull();
  });

  it('left-clicking the ACTIVE tab opens its menu', async () => {
    const a = makeSavedTab();
    const views = makeViews({ tabs: [a], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);

    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    expect(await screen.findByText('Set as default')).toBeInTheDocument();
    expect(views.switchTab).not.toHaveBeenCalled();
  });

  it('right-clicking any tab opens its menu and suppresses the browser one', async () => {
    const a = makeTab();
    const b = makeSavedTab();
    const views = makeViews({ tabs: [a, b], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);

    const inactive = screen.getByRole('tab', { name: /mine/i });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(inactive, event);
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByText('Set as default')).toBeInTheDocument();
    expect(views.switchTab).not.toHaveBeenCalled();
  });

  it('no longer renders a per-tab close button (it moved into the menu)', () => {
    renderTabs(makeViews({ tabs: [makeTab(), makeSavedTab()] }));
    expect(screen.queryByLabelText('Close tab')).toBeNull();
  });

  it('double-clicking a tab does NOT start a rename any more', () => {
    const a = makeSavedTab();
    const views = makeViews({ tabs: [a], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);

    fireEvent.doubleClick(screen.getByRole('tab', { name: /mine/i }));
    expect(screen.queryByLabelText('View name')).toBeNull();
    expect(views.renameTab).not.toHaveBeenCalled();
  });
});

describe('ViewTabs — rename through the menu (FR-023)', () => {
  it('Rename opens the dialog on a saved tab and commits on Enter', async () => {
    const saved = makeSavedTab();
    const views = makeViews({ tabs: [saved], activeTabId: saved.tabId, activeTab: saved });
    renderTabs(views);

    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    fireEvent.click(await screen.findByText('Rename'));

    const input = screen.getByLabelText('View name') as HTMLInputElement;
    expect(input.value).toBe('Mine');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(views.renameTab).toHaveBeenCalledWith('tab-b', 'Renamed'));
  });

  it('Escape leaves the name unchanged', async () => {
    const saved = makeSavedTab();
    const views = makeViews({ tabs: [saved], activeTabId: saved.tabId, activeTab: saved });
    renderTabs(views);

    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    fireEvent.click(await screen.findByText('Rename'));
    const input = screen.getByLabelText('View name');
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(views.renameTab).not.toHaveBeenCalled();
  });

  it('Rename on an unsaved tab opens the same dialog, prefilled', async () => {
    const anon = makeSavedTab({
      tabId: 'tab-anon',
      kind: 'anonymous',
      viewId: undefined,
      name: 'Draft',
    });
    const views = makeViews({ tabs: [anon], activeTabId: anon.tabId, activeTab: anon });
    renderTabs(views);

    fireEvent.click(screen.getByRole('tab', { name: /draft/i }));
    fireEvent.click(await screen.findByText('Rename'));
    expect(screen.getByText('Rename view')).toBeInTheDocument();
    expect((screen.getByLabelText('View name') as HTMLInputElement).value).toBe('Draft');
  });
});

describe('ViewTabs — US1 round 3: saving addresses the requesting tab', () => {
  it('Save on an INACTIVE dirty tab persists that tab', async () => {
    const active = makeTab();
    const inactive = makeSavedTab({ dirty: true });
    const views = makeViews({
      tabs: [active, inactive],
      activeTabId: active.tabId,
      activeTab: active,
      isAnyDirty: true,
    });
    renderTabs(views);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('tab', { name: /mine/i }), event);
    fireEvent.click(await screen.findByText('Save'));

    await waitFor(() => expect(views.saveTab).toHaveBeenCalledWith('tab-b'));
  });

  it('Save on an unsaved tab stores it with NO dialog (round 4)', async () => {
    const active = makeTab();
    const anon = makeSavedTab({
      tabId: 'tab-anon',
      kind: 'anonymous',
      viewId: undefined,
      name: 'New view',
      dirty: true,
    });
    const views = makeViews({
      tabs: [active, anon],
      activeTabId: active.tabId,
      activeTab: active,
      isAnyDirty: true,
    });
    renderTabs(views);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('tab', { name: /new view/i }), event);
    fireEvent.click(await screen.findByText('Save'));

    await waitFor(() => expect(views.saveTab).toHaveBeenCalledWith('tab-anon'));
    expect(screen.queryByLabelText('View name')).toBeNull();
  });
});

describe('ViewTabs — kebab wiring', () => {
  it('opens a saved view from the kebab', async () => {
    const views = makeViews({ savedViews: [makeSavedView()] });
    renderTabs(views);
    fireEvent.click(screen.getByLabelText('View menu'));
    fireEvent.mouseEnter(await screen.findByText('Open'));
    fireEvent.click(await screen.findByText('Amount desc'));
    expect(views.openView).toHaveBeenCalledWith('v1');
  });

  it('offers no management action (round 4)', async () => {
    renderTabs(makeViews({ savedViews: [makeSavedView()] }));
    fireEvent.click(screen.getByLabelText('View menu'));
    await screen.findByText('Add empty view');
    expect(screen.queryByText('Manage views…')).toBeNull();
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
    expect(container.querySelector('.ant-badge-dot')).not.toBeNull();
  });
});

describe('ViewTabs — round 4: the tab menu dismisses (FR-023)', () => {
  function openMenu() {
    const tab = makeSavedTab();
    const views = makeViews({ tabs: [tab], activeTabId: tab.tabId, activeTab: tab });
    renderTabs(views);
    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    return views;
  }

  /** AntD keeps a closed dropdown mounted — assert the hidden class instead. */
  const menuHidden = () =>
    screen
      .getByText('Set as default')
      .closest('.ant-dropdown')!
      .className.includes('ant-dropdown-hidden');

  it('closes on a mousedown outside the menu and its tab', async () => {
    openMenu();
    expect(await screen.findByText('Set as default')).toBeInTheDocument();
    expect(menuHidden()).toBe(false);

    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(menuHidden()).toBe(true));
  });

  it('closes on Escape', async () => {
    openMenu();
    expect(await screen.findByText('Set as default')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(menuHidden()).toBe(true));
  });

  it('a mousedown INSIDE the menu does not close it before the action runs', async () => {
    const views = openMenu();
    const item = await screen.findByText('Duplicate');

    fireEvent.mouseDown(item);
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    fireEvent.click(item);
    expect(views.duplicateTab).toHaveBeenCalledWith('tab-b', 'Mine');
  });
});
