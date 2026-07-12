import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ScenarioDetailPage } from './detail';
import * as inventoryService from '@/services/unihub-backend/inventory';
import type { Item, ScenarioItem } from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');

const item = (id: string, name: string, url = ''): Item =>
  ({
    id,
    name,
    quantity: 1,
    spec: '',
    remark: '',
    sku_price: null,
    sku_price_currency: '',
    total_price: null,
    url,
    status: 'active',
    deprecate_time: null,
    parameters: [],
    acquisition: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }) as Item;

const line = (
  id: string,
  itemName: string,
  containerId: string | null,
  order: number,
  organized: boolean,
): ScenarioItem => ({
  id,
  item: item(`item-${id}`, itemName),
  container: containerId ? { id: containerId, item_name: '' } : null,
  display_order: order,
  organized,
  notes: '',
  created_at: `2026-07-0${1 + order}T00:00:00Z`,
});

const SCENARIO = {
  id: 'sc-1',
  name: 'Camping',
  description: 'Weekend trip',
  item_count: 3,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

// Organized tree: Backpack (top) > Camera. Unorganized flat pane: Tent.
const LINES = [
  line('l-bag', 'Backpack', null, 0, true),
  line('l-cam', 'Camera', 'l-bag', 0, true),
  line('l-tent', 'Tent', null, 0, false),
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter initialEntries={['/inventory/scenarios/sc-1']}>
          <Routes>
            <Route path="/inventory/scenarios/:id" element={<ScenarioDetailPage />} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

const dt = { dataTransfer: { setData: () => {}, getData: () => '', setDragImage: () => {}, effectAllowed: 'move', dropEffect: 'move' } };

describe('ScenarioDetailPage (iteration 16 — organize redesign)', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.getScenario).mockResolvedValue(SCENARIO);
    vi.mocked(inventoryService.listScenarioItems).mockResolvedValue(LINES);
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [item('item-l-bag', 'Backpack'), item('i-new', 'Lantern', 'https://example.com/lantern')],
    });
    vi.mocked(inventoryService.addScenarioItem).mockResolvedValue(LINES[2]!);
    vi.mocked(inventoryService.moveScenarioItem).mockResolvedValue(LINES[0]!);
    vi.mocked(inventoryService.deleteScenarioItem).mockResolvedValue(undefined);
  });

  // SD16-01 (FR-011): standalone info panel; the Backlog panel is gone.
  it('renders name and description in a standalone panel without a Backlog panel', async () => {
    renderPage();
    expect((await screen.findAllByText('Camping')).length).toBeGreaterThan(0);
    expect(screen.getByText('Weekend trip')).toBeInTheDocument();
    expect(screen.getByText('Organize')).toBeInTheDocument();
    expect(screen.queryByText('Backlog')).toBeNull();
  });

  // SD16-02 (FR-011): panes — unorganized flat list left, organized tree right.
  it('splits Organize into an unorganized flat pane and an organized tree', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Camping');
    // Splitter present (horizontal by default in a wide/unmeasured container).
    expect(container.querySelector('.ant-splitter')).toBeTruthy();
    // Tent is unorganized → flat pane, not in the tree.
    const flatPane = screen.getByTestId('unorganized-pane');
    expect(within(flatPane).getByText('Tent')).toBeInTheDocument();
    const treePane = screen.getByTestId('organized-pane');
    expect(within(treePane).queryByText('Tent')).toBeNull();
    // Backpack + nested Camera render in the tree.
    expect(within(treePane).getByText('Backpack')).toBeInTheDocument();
    const camera = within(treePane).getByText('Camera');
    expect(camera.closest('.ant-tree-treenode')!.querySelectorAll('.ant-tree-indent-unit').length).toBeGreaterThan(0);
  });

  // SD16-03 (FR-011): flat-pane remove deletes the membership; tree offers no remove.
  it('removes memberships only from the unorganized pane', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    const flatPane = screen.getByTestId('unorganized-pane');
    fireEvent.click(within(flatPane).getByRole('button', { name: /Remove from scenario/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.deleteScenarioItem)).toHaveBeenCalledWith('sc-1', 'l-tent'),
    );
    const treePane = screen.getByTestId('organized-pane');
    expect(within(treePane).queryByRole('button', { name: /Remove from scenario/ })).toBeNull();
  });

  // SD16-04 (FR-011): Add modal — highlighted matches, hyperlink, disabled members.
  it('searches in the Add modal with highlight, hyperlink, and disabled member rows', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    const modal = (await screen.findByText('Add items')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getByPlaceholderText('Search items…'), {
      target: { value: 'an' },
    });
    await waitFor(() => expect(vi.mocked(inventoryService.listItems)).toHaveBeenCalled());
    // OR-groups over name/spec.
    const call = vi.mocked(inventoryService.listItems).mock.calls.at(-1)![0]!;
    expect(call.filters!.groups).toHaveLength(2);
    // Matched substring highlighted with <mark>.
    const lantern = await within(modal).findByText(
      (_, el) => el?.tagName === 'A' && el.textContent === 'Lantern',
    );
    expect(lantern).toHaveAttribute('href', 'https://example.com/lantern');
    expect(lantern.querySelector('mark')?.textContent).toBe('an');
    // Member row (Backpack) still listed but disabled — no Add action.
    const memberRow = within(modal).getByText('Backpack').closest('.ant-list-item') as HTMLElement;
    expect(within(memberRow).getByText('Added')).toBeInTheDocument();
    expect(within(memberRow).queryByRole('button', { name: /Add/ })).toBeNull();
    // Adding a non-member creates the membership (lands unorganized server-side).
    const lanternRow = lantern.closest('.ant-list-item') as HTMLElement;
    fireEvent.click(within(lanternRow).getByRole('button', { name: /Add/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.addScenarioItem)).toHaveBeenCalledWith('sc-1', {
        item_id: 'i-new',
      }),
    );
  });

  // SD16-05 (FR-012): left→right drops organize (top-level append or nest).
  it('organizes a flat line by dragging into the tree', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    const flatPane = screen.getByTestId('unorganized-pane');
    const tentRow = within(flatPane).getByText('Tent').closest('[draggable="true"]') as HTMLElement;
    // Background drop → append at the organized top level (index 1 after Backpack).
    fireEvent.dragStart(tentRow, dt);
    fireEvent.dragOver(screen.getByTestId('organized-pane'), dt);
    fireEvent.drop(screen.getByTestId('organized-pane'), dt);
    await waitFor(() =>
      expect(vi.mocked(inventoryService.moveScenarioItem)).toHaveBeenCalledWith('sc-1', 'l-tent', {
        container_id: null,
        index: 1,
        organized: true,
      }),
    );
    // Node-title drop → nest inside that node (after Camera).
    fireEvent.dragStart(tentRow, dt);
    const backpackTitle = within(screen.getByTestId('organized-pane')).getByText('Backpack');
    fireEvent.dragOver(backpackTitle, dt);
    fireEvent.drop(backpackTitle, dt);
    await waitFor(() =>
      expect(vi.mocked(inventoryService.moveScenarioItem)).toHaveBeenLastCalledWith(
        'sc-1',
        'l-tent',
        { container_id: 'l-bag', index: 1, organized: true },
      ),
    );
  });

  // SD16-06 (FR-012): right→left drop sends the line back (unorganize).
  it('sends a tree line back to the unorganized pane by dragging it left', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    const treePane = screen.getByTestId('organized-pane');
    const cameraNode = within(treePane)
      .getByText('Camera')
      .closest('[draggable="true"]') as HTMLElement;
    fireEvent.dragStart(cameraNode, dt);
    const flatPane = screen.getByTestId('unorganized-pane');
    fireEvent.dragOver(flatPane, dt);
    fireEvent.drop(flatPane, dt);
    await waitFor(() =>
      expect(vi.mocked(inventoryService.moveScenarioItem)).toHaveBeenCalledWith('sc-1', 'l-cam', {
        container_id: null,
        index: 0,
        organized: false,
      }),
    );
  });
});
