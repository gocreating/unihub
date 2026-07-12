import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ScenarioDetailPage } from './detail';
import * as inventoryService from '@/services/unihub-backend/inventory';
import type { Item, ItemParameter, ScenarioItem } from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');

const item = (
  id: string,
  name: string,
  extra: Partial<Pick<Item, 'url' | 'alias_name' | 'spec'>> & { parameters?: ItemParameter[] } = {},
): Item =>
  ({
    id,
    name,
    alias_name: extra.alias_name ?? '',
    quantity: 1,
    spec: extra.spec ?? '',
    remark: '',
    sku_price: null,
    sku_price_currency: '',
    total_price: null,
    url: extra.url ?? '',
    status: 'active',
    deprecate_time: null,
    parameters: extra.parameters ?? [],
    acquisition: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }) as Item;

const line = (
  id: string,
  it: Item,
  containerId: string | null,
  order: number,
  organized: boolean,
): ScenarioItem => ({
  id,
  item: it,
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

const COLOR_PARAM: ItemParameter = {
  definition_id: 'ad-color',
  name: 'color',
  data_type: 'text',
  unit_family: '',
  value: 'red',
  unit: '',
  value_number: null,
};

// Organized tree: Backpack (top) > Camera (aliased "Cammy"). Flat pane: Tent
// (rich context: spec + color badge + url).
const LINES = [
  line('l-bag', item('item-bag', 'Backpack'), null, 0, true),
  line('l-cam', item('item-cam', 'Camera', { alias_name: 'Cammy' }), 'l-bag', 0, true),
  line(
    'l-tent',
    item('item-tent', 'Tent', {
      spec: 'green 2p',
      url: 'https://example.com/tent',
      parameters: [COLOR_PARAM],
    }),
    null,
    0,
    false,
  ),
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter initialEntries={['/inventory/scenarios/sc-1']}>
          <Routes>
            <Route path="/inventory/scenarios/:id" element={<ScenarioDetailPage />} />
            <Route path="/inventory/scenarios" element={<div>LIST-PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('ScenarioDetailPage (iteration 18 — actions, rich rows, dnd-kit panes)', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.getScenario).mockResolvedValue(SCENARIO);
    vi.mocked(inventoryService.listScenarioItems).mockResolvedValue(LINES);
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        item('item-bag', 'Backpack'),
        item('i-new', 'Lantern', { url: 'https://example.com/lantern' }),
      ],
    });
    vi.mocked(inventoryService.addScenarioItem).mockResolvedValue(LINES[2]!);
    vi.mocked(inventoryService.moveScenarioItem).mockResolvedValue(LINES[0]!);
    vi.mocked(inventoryService.deleteScenarioItem).mockResolvedValue(undefined);
    vi.mocked(inventoryService.updateScenario).mockResolvedValue(SCENARIO);
    vi.mocked(inventoryService.deleteScenario).mockResolvedValue(undefined);
  });

  // SD18-01 (FR-011): info-panel Edit opens the pre-filled form and PATCHes.
  it('edits the scenario from the info panel', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const nameInput = await screen.findByDisplayValue('Camping');
    fireEvent.change(nameInput, { target: { value: 'Camping v2' } });
    fireEvent.click(screen.getByRole('button', { name: /OK|Save/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.updateScenario)).toHaveBeenCalledWith(
        'sc-1',
        expect.objectContaining({ name: 'Camping v2' }),
      ),
    );
  });

  // SD18-02 (FR-011): Delete lives in the kebab menu; confirms + navigates.
  it('deletes the scenario via the kebab menu and returns to the list', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.click(screen.getByLabelText('scenario-actions'));
    fireEvent.click(await screen.findByText('Delete'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.deleteScenario)).toHaveBeenCalledWith('sc-1'),
    );
    expect(await screen.findByText('LIST-PAGE')).toBeInTheDocument();
  });

  // SD18-03 (FR-011): panes without titles; flattened depth-indented tree.
  it('renders untitled panes with a depth-indented organized list', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    expect(screen.queryByText('Unorganized')).toBeNull();
    expect(screen.queryByText('Organized')).toBeNull();
    const flatPane = screen.getByTestId('unorganized-pane');
    expect(within(flatPane).getByText('Tent')).toBeInTheDocument();
    // Organized rows carry their depth as indentation.
    const bagRow = screen.getByTestId('org-row-l-bag');
    const camRow = screen.getByTestId('org-row-l-cam');
    expect(bagRow.style.paddingLeft).toBe('0px');
    expect(camRow.style.paddingLeft).toBe('24px');
    // The aliased item displays its alias in the tree.
    expect(within(camRow).getByText('Cammy')).toBeInTheDocument();
  });

  // SD18-04 (FR-011): rich row context — link, spec, parameter badges.
  it('renders spec, badges, and the url link on pane rows', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    const tentRow = screen.getByTestId('flat-row-l-tent');
    const link = within(tentRow).getByText('Tent').closest('a')!;
    expect(link).toHaveAttribute('href', 'https://example.com/tent');
    expect(within(tentRow).getByText('green 2p')).toBeInTheDocument();
    expect(within(tentRow).getByText('red')).toBeInTheDocument();
  });

  // SD18-05 (FR-011): remove stays flat-pane-only.
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

  // SD18-06 (FR-011/FR-030): the Add modal searches name OR alias OR spec.
  it('searches the Add modal over name, alias, and spec with member rows disabled', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    const modal = (await screen.findByText('Add items')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getByPlaceholderText('Search items…'), {
      target: { value: 'an' },
    });
    await waitFor(() => expect(vi.mocked(inventoryService.listItems)).toHaveBeenCalled());
    const call = vi.mocked(inventoryService.listItems).mock.calls.at(-1)![0]!;
    expect(call.filters!.groups).toHaveLength(3); // name OR alias OR spec
    const attrs = call.filters!.groups.map((g) => g.conditions[0]!.attr).sort();
    expect(attrs).toEqual(['alias_name', 'name', 'spec']);
    // Highlighted match + member disabled + add call (carried from iter 16).
    const lantern = await within(modal).findByText(
      (_, el) => el?.tagName === 'A' && el.textContent === 'Lantern',
    );
    expect(lantern.querySelector('mark')?.textContent).toBe('an');
    const memberRow = within(modal).getByText('Backpack').closest('.ant-list-item') as HTMLElement;
    expect(within(memberRow).getByText('Added')).toBeInTheDocument();
    const lanternRow = lantern.closest('.ant-list-item') as HTMLElement;
    fireEvent.click(within(lanternRow).getByRole('button', { name: /Add/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.addScenarioItem)).toHaveBeenCalledWith('sc-1', {
        item_id: 'i-new',
      }),
    );
  });
});
