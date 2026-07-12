import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ScenarioDetailPage } from './detail';
import { childrenOf, computeDropTarget } from './organizeTree';
import * as inventoryService from '@/services/unihub-backend/inventory';
import type { Item, ScenarioItem } from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');

const item = (id: string, name: string): Item =>
  ({
    id,
    name,
    quantity: 1,
    spec: '',
    remark: '',
    sku_price: null,
    sku_price_currency: '',
    total_price: null,
    url: '',
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
  containerId: string | null = null,
  order = 0,
): ScenarioItem => ({
  id,
  item: item(`item-${id}`, itemName),
  container: containerId ? { id: containerId, item_name: '' } : null,
  display_order: order,
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

const LINES = [
  line('l-bag', 'Backpack', null, 0),
  line('l-tent', 'Tent', null, 1),
  line('l-cam', 'Camera', 'l-bag', 0),
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

describe('ScenarioDetailPage (Backlog + Organize)', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.getScenario).mockResolvedValue(SCENARIO);
    vi.mocked(inventoryService.listScenarioItems).mockResolvedValue(LINES);
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [item('item-l-bag', 'Backpack'), item('i-new', 'Lantern')],
    });
  });

  // SD-01: two panels, name + description shown.
  it('renders name, description, and the Backlog + Organize panels', async () => {
    renderPage();
    expect((await screen.findAllByText('Camping')).length).toBeGreaterThan(0); // breadcrumb + title
    expect(screen.getByText('Weekend trip')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Organize')).toBeInTheDocument();
  });

  // SD-02: organize tree renders nesting from container/display_order.
  it('nests the Organize tree by container', async () => {
    renderPage();
    const camera = await screen.findByText('Camera');
    // Camera is nested (indent-unit elements exist inside its tree node row).
    const treeNode = camera.closest('.ant-tree-treenode')!;
    expect(treeNode.querySelectorAll('.ant-tree-indent-unit').length).toBeGreaterThan(0);
    const backpackNode = (await screen.findByText('Backpack')).closest('.ant-tree-treenode')!;
    expect(backpackNode.querySelectorAll('.ant-tree-indent-unit').length).toBe(0);
  });

  // SD-03: backlog search queries the server with OR-groups and hides members.
  it('searches the backlog and excludes items already in the scenario', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.change(screen.getByPlaceholderText('Search items…'), { target: { value: 'a' } });
    await waitFor(() => expect(vi.mocked(inventoryService.listItems)).toHaveBeenCalled());
    const call = vi.mocked(inventoryService.listItems).mock.calls.at(-1)![0]!;
    expect(call.filters!.groups).toHaveLength(2); // name OR spec (groups are OR'd)
    // Lantern (non-member) listed with an Add action; Backpack (member) hidden.
    const backlogList = (await screen.findByText('Lantern')).closest('.ant-list')!;
    expect(within(backlogList as HTMLElement).queryByText('Backpack')).toBeNull();
    fireEvent.click(within(backlogList as HTMLElement).getByRole('button', { name: /Add/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.addScenarioItem)).toHaveBeenCalledWith('sc-1', {
        item_id: 'i-new',
      }),
    );
  });

  // SD-04: node remove action deletes the line.
  it('removes a line via the tree node action', async () => {
    vi.mocked(inventoryService.deleteScenarioItem).mockResolvedValue(undefined);
    renderPage();
    const tent = await screen.findByText('Tent');
    const node = tent.closest('.ant-tree-treenode')!;
    fireEvent.click(within(node as HTMLElement).getByRole('button', { name: /Remove from scenario/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.deleteScenarioItem)).toHaveBeenCalledWith('sc-1', 'l-tent'),
    );
  });
});

describe('organizeTree helpers', () => {
  // OT-01: children resolve by container + persisted order.
  it('childrenOf returns ordered children per container', () => {
    expect(childrenOf(LINES, null).map((l) => l.id)).toEqual(['l-bag', 'l-tent']);
    expect(childrenOf(LINES, 'l-bag').map((l) => l.id)).toEqual(['l-cam']);
  });

  // OT-02: dropping ONTO a node nests at the end of its children.
  it('computeDropTarget nests on direct drop', () => {
    expect(computeDropTarget(LINES, 'l-tent', 'l-bag', false, 0)).toEqual({
      container_id: 'l-bag',
      index: 1,
    });
  });

  // OT-03: dropping into a gap reorders within the drop node's parent.
  it('computeDropTarget reorders on gap drop', () => {
    // Drop tent BEFORE backpack at top level.
    expect(computeDropTarget(LINES, 'l-tent', 'l-bag', true, -1)).toEqual({
      container_id: null,
      index: 0,
    });
    // Drop camera AFTER tent at top level (re-parent to top).
    expect(computeDropTarget(LINES, 'l-cam', 'l-tent', true, 1)).toEqual({
      container_id: null,
      index: 2,
    });
  });
});
