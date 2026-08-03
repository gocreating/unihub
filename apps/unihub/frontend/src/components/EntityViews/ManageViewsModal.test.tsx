// US4 (016): ManageViewsModal — staged rename/pin/reorder/delete, committed on Save.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ManageViewsModal } from './ManageViewsModal';
import type { UseEntityViewsReturn, ViewTabState } from './useEntityViews';
import type { EntityView } from '@/services/unihub-backend/core';

function makeView(overrides: Partial<EntityView> = {}): EntityView {
  return {
    id: 'v1',
    table_key: 'tbl',
    name: 'First',
    config: {},
    pinned: false,
    position: 0,
    is_default: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const defaultTab: ViewTabState = {
  tabId: '__default__',
  kind: 'default',
  name: '',
  dirty: false,
  pinned: true,
  closable: false,
  isDefault: true,
};

function makeViews(savedViews: EntityView[]): UseEntityViewsReturn {
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.tabId,
    activeTab: defaultTab,
    savedViews,
    isAnyDirty: false,
    switchTab: vi.fn(),
    addAnonymousTab: vi.fn(),
    closeTab: vi.fn(),
    openView: vi.fn(),
    collapsed: false,
    reveal: vi.fn(),
    saveTab: vi.fn().mockResolvedValue('saved'),
    saveTabAs: vi.fn().mockResolvedValue(undefined),
    renameTab: vi.fn().mockResolvedValue(undefined),
    duplicateTab: vi.fn(),
    pinTab: vi.fn().mockResolvedValue(undefined),
    setDefaultTab: vi.fn().mockResolvedValue(undefined),
    deleteTab: vi.fn().mockResolvedValue(undefined),
    reorderTabs: vi.fn().mockResolvedValue(undefined),
    commitManageChanges: vi.fn().mockResolvedValue(undefined),
  } as unknown as UseEntityViewsReturn;
}

function renderModal(views: UseEntityViewsReturn, onClose = vi.fn()) {
  render(
    <IntlProvider locale="en" messages={enUS}>
      <ManageViewsModal open views={views} onClose={onClose} />
    </IntlProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('ManageViewsModal', () => {
  it('lists the saved views with editable names and pin toggles', () => {
    renderModal(makeViews([makeView(), makeView({ id: 'v2', name: 'Second', pinned: true })]));
    expect(screen.getByDisplayValue('First')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument();
    // One pin control per row.
    expect(screen.getAllByLabelText(/^(Pin|Unpin)$/)).toHaveLength(2);
  });

  it('stages rename/pin/delete without any API interaction before Save', () => {
    const views = makeViews([makeView(), makeView({ id: 'v2', name: 'Second' })]);
    renderModal(views);

    fireEvent.change(screen.getByDisplayValue('First'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getAllByLabelText('Pin')[0]!);
    fireEvent.click(screen.getAllByLabelText('Delete')[1]!);

    // The deleted row leaves the list immediately (staged).
    expect(screen.queryByDisplayValue('Second')).toBeNull();
    // Nothing committed yet.
    expect(views.commitManageChanges).not.toHaveBeenCalled();
  });

  it('Cancel closes without committing anything', () => {
    const views = makeViews([makeView()]);
    const { onClose } = renderModal(views);
    fireEvent.change(screen.getByDisplayValue('First'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(views.commitManageChanges).not.toHaveBeenCalled();
  });

  it('Save commits the staged items (rename + pin) in order', async () => {
    const views = makeViews([makeView(), makeView({ id: 'v2', name: 'Second', pinned: true })]);
    const { onClose } = renderModal(views);

    fireEvent.change(screen.getByDisplayValue('First'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getAllByLabelText('Unpin')[0]!); // unpin Second

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(views.commitManageChanges).toHaveBeenCalledTimes(1));
    expect(views.commitManageChanges).toHaveBeenCalledWith({
      items: [
        { id: 'v1', name: 'Renamed', pinned: false },
        { id: 'v2', name: 'Second', pinned: false },
      ],
      deletedIds: [],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Save with staged deletions confirms first with a danger dialog (ICU count)', async () => {
    const views = makeViews([makeView(), makeView({ id: 'v2', name: 'Second' })]);
    renderModal(views);

    fireEvent.click(screen.getAllByLabelText('Delete')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Modal.confirm portal: singular ICU title + danger OK button.
    expect((await screen.findAllByText('Delete 1 view?')).length).toBeGreaterThan(0);
    const okButton = document.querySelector(
      '.ant-modal-confirm-btns .ant-btn-dangerous',
    ) as HTMLButtonElement;
    expect(okButton).not.toBeNull();

    fireEvent.click(okButton);
    await waitFor(() => expect(views.commitManageChanges).toHaveBeenCalledTimes(1));
    expect(views.commitManageChanges).toHaveBeenCalledWith({
      items: [{ id: 'v2', name: 'Second', pinned: false }],
      deletedIds: ['v1'],
    });
  });

  it('the default row is draggable and renamable but never unpinned or deleted (round 3)', () => {
    const views = makeViews([
      makeView({ id: 'd1', name: 'YTD', is_default: true, pinned: true }),
      makeView({ id: 'v2', name: 'Second' }),
    ]);
    renderModal(views);

    const defaultRow = screen.getByTestId('manage-default-row');
    // Rename stays available…
    expect(defaultRow.querySelector('input')).not.toBeNull();
    expect(screen.getByDisplayValue('YTD')).toBeInTheDocument();
    // …the row joins the drag list (R28)…
    expect(document.querySelector('[data-sortable-id="d1"]')).not.toBeNull();
    // …and its pin + delete are disabled, not hidden (the guaranteed fallback).
    const unpin = defaultRow.querySelector('button[aria-label="Unpin"]') as HTMLButtonElement;
    const del = defaultRow.querySelector('button[aria-label="Delete"]') as HTMLButtonElement;
    expect(unpin.disabled).toBe(true);
    expect(del.disabled).toBe(true);
  });

  it('Save includes the staged default view first, then the reorderable rest', async () => {
    const views = makeViews([
      makeView({ id: 'd1', name: 'YTD', is_default: true, pinned: true }),
      makeView({ id: 'v2', name: 'Second' }),
    ]);
    renderModal(views);

    fireEvent.change(screen.getByDisplayValue('YTD'), { target: { value: 'This year' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(views.commitManageChanges).toHaveBeenCalledTimes(1));
    expect(views.commitManageChanges).toHaveBeenCalledWith({
      items: [
        { id: 'd1', name: 'This year', pinned: true },
        { id: 'v2', name: 'Second', pinned: false },
      ],
      deletedIds: [],
    });
  });

  it('cancelling the delete confirmation aborts the commit', async () => {
    const views = makeViews([makeView()]);
    renderModal(views);

    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findAllByText('Delete 1 view?');

    const cancelBtn = Array.from(
      document.querySelectorAll('.ant-modal-confirm-btns button'),
    ).find((b) => !b.className.includes('dangerous')) as HTMLButtonElement;
    fireEvent.click(cancelBtn);

    await waitFor(() =>
      expect(screen.queryByText('Delete 1 view?')).toBeNull(),
    );
    expect(views.commitManageChanges).not.toHaveBeenCalled();
  });
});
