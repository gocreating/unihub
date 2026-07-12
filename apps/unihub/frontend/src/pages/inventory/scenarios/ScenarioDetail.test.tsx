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
  extra: Partial<Pick<Item, 'url' | 'alias_name' | 'spec' | 'acquisition'>> & {
    parameters?: ItemParameter[];
  } = {},
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
    acquisition: extra.acquisition ?? null,
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
        item('i-new', 'Lantern', {
          url: 'https://example.com/lantern',
          acquisition: {
            id: 'acq-l',
            source: 'LanternShop',
            request_time: null,
            obtained_at: '2026-03-05T00:00:00Z',
            net_cost: [],
          },
        }),
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
    // Iteration 19: single Add button per row — DISABLED for members, with an
    // "Added" tooltip instead of a tag.
    const memberAdd = within(memberRow).getByRole('button', { name: /Add/ });
    expect(memberAdd).toBeDisabled();
    expect(within(memberRow).queryByText('Added')).toBeNull();
    fireEvent.mouseEnter(memberAdd.parentElement!);
    expect((await screen.findAllByRole('tooltip')).some((el) => el.textContent === 'Added')).toBe(
      true,
    );
    // Acquisition context line on results that carry one (iteration 19).
    expect(within(modal).getByText(/LanternShop/)).toBeInTheDocument();
    const lanternRow = lantern.closest('.ant-list-item') as HTMLElement;
    fireEvent.click(within(lanternRow).getByRole('button', { name: /Add/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.addScenarioItem)).toHaveBeenCalledWith('sc-1', {
        item_id: 'i-new',
      }),
    );
  });

  // SD19-01 (FR-011): container rows show a caret toggler; collapse hides the subtree.
  it('collapses and expands a container subtree via the caret', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    const bagRow = screen.getByTestId('org-row-l-bag');
    // Backpack has a child (Camera) → caret present; Camera has none → spacer.
    const caret = within(bagRow).getByLabelText('toggle-children');
    expect(screen.getByTestId('org-row-l-cam')).toBeInTheDocument();
    fireEvent.click(caret);
    expect(screen.queryByTestId('org-row-l-cam')).toBeNull();
    fireEvent.click(within(bagRow).getByLabelText('toggle-children'));
    expect(screen.getByTestId('org-row-l-cam')).toBeInTheDocument();
    const camRow = screen.getByTestId('org-row-l-cam');
    expect(within(camRow).queryByLabelText('toggle-children')).toBeNull();
  });

  // SD20-01 (FR-011): modal result titles carry truncation-gated tooltips.
  it('shows a gated tooltip on a truncated modal result title', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    const modal = (await screen.findByText('Add items')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getByPlaceholderText('Search items…'), {
      target: { value: 'an' },
    });
    const lantern = await within(modal).findByText(
      (_, el) => el?.tagName === 'A' && el.textContent === 'Lantern',
    );
    // The measuring span wraps the link; force an overflow, then hover.
    const span = lantern.closest('span')!;
    Object.defineProperty(span, 'scrollWidth', { value: 300, configurable: true });
    Object.defineProperty(span, 'clientWidth', { value: 100, configurable: true });
    fireEvent.mouseEnter(span);
    const tooltips = await screen.findAllByRole('tooltip');
    expect(tooltips.some((el) => el.textContent === 'Lantern')).toBe(true);
  });

  // SD21-02 (FR-011): both splitter panes use the AntD Empty component.
  it('renders consistent Empty states in both panes when the scenario is empty', async () => {
    vi.mocked(inventoryService.listScenarioItems).mockResolvedValue([]);
    renderPage();
    await screen.findAllByText('Camping');
    expect(
      within(screen.getByTestId('unorganized-pane')).getByText('Nothing left to organize')
        .closest('.ant-empty'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('organized-pane')).getByText('Drag items here to organize them')
        .closest('.ant-empty'),
    ).toBeTruthy();
  });

  // SD21-01 (FR-011): modal result rows carry no horizontal indentation.
  it('renders modal result rows without horizontal padding', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    const modal = (await screen.findByText('Add items')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getByPlaceholderText('Search items…'), {
      target: { value: 'an' },
    });
    await within(modal).findByText(
      (_, el) => el?.tagName === 'A' && el.textContent === 'Lantern',
    );
    const row = within(modal).getByText('Backpack').closest('.ant-list-item') as HTMLElement;
    expect(row.style.paddingLeft).toBe('0px');
    expect(row.style.paddingRight).toBe('0px');
  });

  // SD19-02 (FR-011): truncation-gated tooltips via ItemName truncate mode —
  // the aliased row's tooltip reveals the original name.
  it('shows the original name tooltip on an aliased organized row', async () => {
    renderPage();
    await screen.findAllByText('Camping');
    const cammy = within(screen.getByTestId('org-row-l-cam')).getByText('Cammy');
    fireEvent.mouseEnter(cammy.closest('span')!);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Camera');
  });
});
