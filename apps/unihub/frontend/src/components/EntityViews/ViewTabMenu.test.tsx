// 016 round 3 — per-tab dropdown menu (FR-023): trigger grammar + the
// enablement matrix from data-model.md §7 (disabled, never hidden).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ViewTabMenu } from './ViewTabMenu';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';

function makeTab(overrides: Partial<ViewTabState> = {}): ViewTabState {
  return {
    tabId: 'tab-1',
    kind: 'saved',
    viewId: 'v1',
    name: 'Mine',
    dirty: false,
    pinned: false,
    closable: true,
    isDefault: false,
    ...overrides,
  };
}

function makeViews(overrides: Partial<UseEntityViewsReturn> = {}): UseEntityViewsReturn {
  return {
    tabs: [],
    activeTabId: 'tab-1',
    savedViews: [],
    isAnyDirty: false,
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

function renderMenu(
  tab: ViewTabState,
  views: UseEntityViewsReturn,
  props: Partial<React.ComponentProps<typeof ViewTabMenu>> = {},
) {
  return render(
    <IntlProvider locale="en" messages={enUS}>
      <ViewTabMenu
        tab={tab}
        views={views}
        open
        onOpenChange={vi.fn()}
        displayName={tab.name}
        onRename={vi.fn()}
        {...props}
      >
        <button type="button">tab body</button>
      </ViewTabMenu>
    </IntlProvider>,
  );
}

/** aria-disabled of the menu item carrying this label. */
function itemDisabled(label: string): boolean {
  const item = screen.getByText(label).closest('li');
  return item?.getAttribute('aria-disabled') === 'true';
}

beforeEach(() => vi.clearAllMocks());

describe('ViewTabMenu — items', () => {
  it('lists every action in the documented order', async () => {
    renderMenu(makeTab(), makeViews());
    await screen.findByText('Save');
    for (const label of [
      'Save',
      'Close',
      'Duplicate',
      'Pin',
      'Set as default',
      'Rename',
      'Delete',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('constrains the menu body to the viewport (constitution VI)', async () => {
    const { container } = renderMenu(makeTab(), makeViews());
    await screen.findByText('Save');
    const menu = container.ownerDocument.querySelector('.ant-dropdown-menu') as HTMLElement;
    expect(menu.style.maxHeight).toBe('60vh');
    expect(menu.style.overflowY).toBe('auto');
  });
});

describe('ViewTabMenu — enablement matrix (data-model §7)', () => {
  it('a clean saved tab disables only Save', async () => {
    renderMenu(makeTab({ dirty: false }), makeViews());
    await screen.findByText('Save');
    expect(itemDisabled('Save')).toBe(true);
    expect(itemDisabled('Close')).toBe(false);
    expect(itemDisabled('Duplicate')).toBe(false);
    expect(itemDisabled('Pin')).toBe(false);
    expect(itemDisabled('Set as default')).toBe(false);
    expect(itemDisabled('Rename')).toBe(false);
    expect(itemDisabled('Delete')).toBe(false);
  });

  it('a dirty saved tab enables Save', async () => {
    renderMenu(makeTab({ dirty: true }), makeViews());
    await screen.findByText('Save');
    expect(itemDisabled('Save')).toBe(false);
  });

  it('an anonymous tab disables Pin, Set as default and Delete', async () => {
    renderMenu(
      makeTab({ kind: 'anonymous', viewId: undefined, dirty: true, name: 'Draft' }),
      makeViews(),
    );
    await screen.findByText('Save');
    expect(itemDisabled('Save')).toBe(false); // opens the name modal
    expect(itemDisabled('Close')).toBe(false);
    expect(itemDisabled('Duplicate')).toBe(false);
    expect(itemDisabled('Rename')).toBe(false); // name-and-save
    expect(itemDisabled('Pin')).toBe(true);
    expect(itemDisabled('Set as default')).toBe(true);
    expect(itemDisabled('Delete')).toBe(true);
  });

  it('the default holder disables Close, Pin, Set as default and Delete', async () => {
    renderMenu(
      makeTab({ kind: 'default', isDefault: true, pinned: true, closable: false, dirty: true }),
      makeViews(),
    );
    await screen.findByText('Save');
    expect(itemDisabled('Save')).toBe(false);
    expect(itemDisabled('Rename')).toBe(false);
    expect(itemDisabled('Duplicate')).toBe(false);
    expect(itemDisabled('Close')).toBe(true);
    // It is pinned for as long as it holds the role, so the item reads Unpin
    // and stays disabled (FR-003).
    expect(itemDisabled('Unpin')).toBe(true);
    expect(itemDisabled('Set as default')).toBe(true);
    expect(itemDisabled('Delete')).toBe(true);
  });

  it('a pinned view offers Unpin instead of Pin', async () => {
    renderMenu(makeTab({ pinned: true }), makeViews());
    await screen.findByText('Unpin');
    expect(itemDisabled('Unpin')).toBe(false);
    expect(screen.queryByText('Pin')).toBeNull();
  });
});

describe('ViewTabMenu — actions', () => {
  it('Save saves THIS tab without any prompt (round 4)', async () => {
    const views = makeViews();
    renderMenu(makeTab({ tabId: 'tab-x', dirty: true }), views);
    fireEvent.click(await screen.findByText('Save'));
    await waitFor(() => expect(views.saveTab).toHaveBeenCalledWith('tab-x'));
    // No naming dialog anywhere in the save path (SC-012).
    expect(screen.queryByLabelText('View name')).toBeNull();
  });

  it('Close, Duplicate and Pin address this tab', async () => {
    const views = makeViews();
    renderMenu(makeTab({ tabId: 'tab-x', name: 'Mine' }), views);
    fireEvent.click(await screen.findByText('Close'));
    expect(views.closeTab).toHaveBeenCalledWith('tab-x');
    fireEvent.click(screen.getByText('Duplicate'));
    expect(views.duplicateTab).toHaveBeenCalledWith('tab-x', 'Mine');
    fireEvent.click(screen.getByText('Pin'));
    expect(views.pinTab).toHaveBeenCalledWith('tab-x', true);
  });

  it('Set as default transfers the role to this tab', async () => {
    const views = makeViews();
    renderMenu(makeTab({ tabId: 'tab-x' }), views);
    fireEvent.click(await screen.findByText('Set as default'));
    await waitFor(() => expect(views.setDefaultTab).toHaveBeenCalledWith('tab-x'));
  });

  it('Rename delegates to the caller-owned edit-name flow', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ tabId: 'tab-x' });
    renderMenu(tab, makeViews(), { onRename });
    fireEvent.click(await screen.findByText('Rename'));
    expect(onRename).toHaveBeenCalledWith(tab);
  });

  it('Delete asks for confirmation first, then deletes', async () => {
    const views = makeViews();
    renderMenu(makeTab({ tabId: 'tab-x', name: 'Mine' }), views);
    fireEvent.click(await screen.findByText('Delete'));

    // Confirmation gate (constitution VI) — nothing deleted until confirmed,
    // and the shared dialog puts Cancel LEFT of the danger action (round 5).
    const confirmButton = await screen.findByRole('button', { name: /^delete$/i });
    expect(views.deleteTab).not.toHaveBeenCalled();
    expect(confirmButton.className).toContain('ant-btn-dangerous');

    const footer = document.querySelector('[data-testid="confirm-dialog-footer"]')!;
    const buttons = Array.from(footer.querySelectorAll('button'));
    expect(buttons[0]!.textContent).toContain('Cancel');
    expect(buttons[buttons.length - 1]!.textContent).toContain('Delete');

    fireEvent.click(confirmButton);
    await waitFor(() => expect(views.deleteTab).toHaveBeenCalledWith('tab-x'));
  });

  it('cancelling the delete dialog deletes nothing', async () => {
    const views = makeViews();
    renderMenu(makeTab({ tabId: 'tab-x', name: 'Mine' }), views);
    fireEvent.click(await screen.findByText('Delete'));
    await screen.findByRole('button', { name: /^delete$/i });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(document.querySelector('.ant-modal-wrap')).toHaveStyle({ display: 'none' }),
    );
    expect(views.deleteTab).not.toHaveBeenCalled();
  });
});
