// 016 round 4 — the kebab at the row's right edge (FR-009/FR-011/FR-012):
// exactly two entries — Add empty view · Open ▸ (only views not already open).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ViewKebab } from './ViewKebab';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';
import type { EntityView } from '@/services/unihub-backend/core';

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

function makeTab(overrides: Partial<ViewTabState> = {}): ViewTabState {
  return {
    tabId: 'tab-default',
    kind: 'default',
    name: 'Table',
    dirty: false,
    pinned: true,
    closable: false,
    isDefault: true,
    ...overrides,
  };
}

function makeViews(overrides: Partial<UseEntityViewsReturn> = {}): UseEntityViewsReturn {
  return {
    tabs: [makeTab()],
    activeTabId: 'tab-default',
    savedViews: [],
    isAnyDirty: false,
    ready: true,
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

function renderKebab(views: UseEntityViewsReturn) {
  render(
    <IntlProvider locale="en" messages={enUS}>
      <ViewKebab views={views} />
    </IntlProvider>,
  );
  fireEvent.click(screen.getByLabelText('View menu'));
}

beforeEach(() => vi.clearAllMocks());

describe('ViewKebab', () => {
  it('adds an empty view', async () => {
    const views = makeViews();
    renderKebab(views);
    fireEvent.click(await screen.findByText('Add empty view'));
    expect(views.addBlankTab).toHaveBeenCalledTimes(1);
  });

  it('offers exactly two entries — no management action (round 4)', async () => {
    renderKebab(makeViews());
    await screen.findByText('Add empty view');
    const items = document.querySelectorAll('.ant-dropdown-menu > li');
    expect(items).toHaveLength(2);
    expect(screen.queryByText('Manage views…')).toBeNull();
  });

  it('lists ONLY views that are not currently open, and opens one', async () => {
    const open = makeSavedView({ id: 'v-open', name: 'Already open' });
    const closed = makeSavedView({ id: 'v-closed', name: 'Not open' });
    const views = makeViews({
      savedViews: [open, closed],
      tabs: [makeTab(), makeTab({ tabId: 't2', kind: 'saved', viewId: 'v-open', isDefault: false })],
    });
    renderKebab(views);

    fireEvent.mouseEnter(await screen.findByText('Open'));
    const item = await screen.findByText('Not open');
    expect(screen.queryByText('Already open')).toBeNull();
    fireEvent.click(item);
    expect(views.openView).toHaveBeenCalledWith('v-closed');
  });

  it('shows a disabled empty state when every view is already open', async () => {
    const open = makeSavedView({ id: 'v-open', name: 'Already open' });
    const views = makeViews({
      savedViews: [open],
      tabs: [makeTab(), makeTab({ tabId: 't2', kind: 'saved', viewId: 'v-open', isDefault: false })],
    });
    renderKebab(views);

    fireEvent.mouseEnter(await screen.findByText('Open'));
    const empty = await screen.findByText('All views are open');
    expect(empty.closest('li')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('treats the default holder as open (its tab always exists)', async () => {
    const def = makeSavedView({ id: 'v-def', name: 'YTD', is_default: true, pinned: true });
    const views = makeViews({
      savedViews: [def],
      tabs: [makeTab({ viewId: 'v-def', name: 'YTD' })],
    });
    renderKebab(views);

    fireEvent.mouseEnter(await screen.findByText('Open'));
    await waitFor(() => expect(screen.getByText('All views are open')).toBeInTheDocument());
  });

  it('constrains the menu body to the viewport (constitution VI)', async () => {
    renderKebab(makeViews());
    await screen.findByText('Add empty view');
    const menu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
    expect(menu.style.maxHeight).toBe('60vh');
    expect(menu.style.overflowY).toBe('auto');
  });
});
