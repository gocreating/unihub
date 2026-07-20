// US1 (016): ViewTabs row — tabs, dirty dot, View dropdown.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ViewTabs } from './ViewTabs';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';

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

function makeViews(overrides: Partial<UseEntityViewsReturn> = {}): UseEntityViewsReturn {
  const defaultTab = makeTab();
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.tabId,
    activeTab: defaultTab,
    savedViews: [],
    isAnyDirty: false,
    switchTab: vi.fn(),
    addAnonymousTab: vi.fn(),
    closeTab: vi.fn(),
    openView: vi.fn(),
    saveActiveTab: vi.fn().mockResolvedValue('saved'),
    saveActiveTabAs: vi.fn().mockResolvedValue(undefined),
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
  it('renders the default tab with the localized Tabular label, active', () => {
    renderTabs(makeViews());
    const tab = screen.getByRole('tab', { name: /tabular/i });
    expect(tab).toBeInTheDocument();
    expect(tab.getAttribute('aria-selected')).toBe('true');
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

  it('the left-edge "+" button opens a new anonymous tab', () => {
    const views = makeViews();
    renderTabs(views);
    fireEvent.click(screen.getByLabelText('New view tab'));
    expect(views.addAnonymousTab).toHaveBeenCalledTimes(1);
  });

  it('clicking an inactive tab switches to it', () => {
    const a = makeTab();
    const b = makeTab({ tabId: 'tab-b', kind: 'saved', viewId: 'v1', name: 'Mine', pinned: false, closable: true });
    const views = makeViews({ tabs: [a, b], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);
    fireEvent.click(screen.getByRole('tab', { name: /mine/i }));
    expect(views.switchTab).toHaveBeenCalledWith('tab-b');
  });

  it('View dropdown lists saved views and opens one on click', async () => {
    const views = makeViews({
      savedViews: [
        {
          id: 'v1',
          table_key: 'tbl',
          name: 'Amount desc',
          config: {},
          pinned: false,
          position: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    });
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
  it('arranges [+] first, the scrollable tab strip in the middle, View control last', () => {
    const { container } = renderTabs(makeViews());
    const row = container.firstElementChild!;
    const children = Array.from(row.children);
    // [ + button ] [ tablist strip ] [ view control ] (modals portal elsewhere)
    expect(children[0]!.getAttribute('aria-label')).toBe('New view tab');
    expect(children[1]!.getAttribute('role')).toBe('tablist');
    expect(children[2]!.textContent).toContain('View');
  });

  it('renders a close affordance only on closable tabs and calls closeTab', () => {
    const a = makeTab();
    const b = makeTab({ tabId: 'tab-b', kind: 'saved', viewId: 'v1', name: 'Mine', pinned: false, closable: true });
    const views = makeViews({ tabs: [a, b], activeTabId: a.tabId, activeTab: a });
    renderTabs(views);
    const closeButtons = screen.getAllByLabelText('Close tab');
    expect(closeButtons).toHaveLength(1);
    fireEvent.click(closeButtons[0]!);
    expect(views.closeTab).toHaveBeenCalledWith('tab-b');
    expect(views.switchTab).not.toHaveBeenCalled(); // close must not switch tabs
  });
});
