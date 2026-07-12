import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import enUS from '@/locales/en-US';
import { CatalogPage } from './index';
import * as inventoryService from '@/services/unihub-backend/inventory';
import * as coreService from '@/services/unihub-backend/core';
import type { AttributeDefinition } from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/inventory');
vi.mock('@/services/unihub-backend/core');

dayjs.extend(relativeTime);

const REQUESTED = '2026-07-10T00:00:00Z';
const OBTAINED = '2026-07-11T00:00:00Z';

// The seven seeded system parameter definitions (iteration 14).
const DEFS = ['color', 'size', 'weight', 'length', 'width', 'height', 'volume'].map(
  (name, i) =>
    ({
      id: `ad-${name}`,
      content_type: 7,
      content_type_label: 'inventory.item',
      name,
      data_type: ['weight', 'length', 'width', 'height', 'volume'].includes(name)
        ? 'dimension'
        : 'text',
      unit_family: name === 'weight' ? 'weight' : name === 'volume' ? 'volume' : ['length', 'width', 'height'].includes(name) ? 'length' : '',
      is_system: true,
      display_order: i,
      options: [],
    }) as AttributeDefinition,
);

// Item with URL, spec, and parameter rows.
const ITEM = {
  id: 'itm-1',
  name: 'Backpack',
  alias_name: '',
  quantity: 1,
  spec: 'roomy',
  remark: '',
  sku_price: '10',
  sku_price_currency: 'USD',
  total_price: '10.0000',
  url: 'https://example.com/backpack',
  status: 'active' as const,
  deprecate_time: null,
  parameters: [
    { definition_id: 'ad-color', name: 'color', data_type: 'text', unit_family: '' as const, value: 'red', unit: '', value_number: null },
    { definition_id: 'ad-weight', name: 'weight', data_type: 'dimension', unit_family: 'weight' as const, value: '0.5000', unit: 'kg', value_number: '500.0000' },
    { definition_id: 'ad-volume', name: 'volume', data_type: 'dimension', unit_family: 'volume' as const, value: '1.2', unit: 'L', value_number: '1200.0000' },
    { definition_id: 'ad-size', name: 'size', data_type: 'text', unit_family: '' as const, value: 'M', unit: '', value_number: null },
  ],
  acquisition: {
    id: 'acq-1',
    source: 'Shop',
    request_time: REQUESTED,
    obtained_at: OBTAINED,
    net_cost: [{ currency: 'USD', total: '10.0000' }],
  },
  created_at: OBTAINED,
  updated_at: OBTAINED,
};

// Item with no URL, no spec, and no parameters.
const PLAIN_ITEM = {
  ...ITEM,
  id: 'itm-2',
  name: 'Plain',
  quantity: 2,
  spec: '',
  sku_price: null,
  sku_price_currency: '',
  total_price: null,
  url: '',
  parameters: [],
};

// Single-item acquisitions (merged rows, FR-003b).
const SOLO_ITEM = {
  ...PLAIN_ITEM,
  id: 'itm-solo',
  name: 'Lantern',
  quantity: 3,
  acquisition: {
    id: 'acq-solo',
    source: 'Solo',
    request_time: null,
    obtained_at: OBTAINED,
    net_cost: [{ currency: 'USD', total: '0.0000' }],
  },
};
const REQ_ITEM = {
  ...PLAIN_ITEM,
  id: 'itm-req',
  name: 'Preorder',
  quantity: 1,
  acquisition: {
    id: 'acq-req',
    source: 'Waiting',
    request_time: REQUESTED,
    obtained_at: null,
    net_cost: [{ currency: 'USD', total: '5.0000' }],
  },
};

const ACQ = {
  id: 'acq-1',
  source: 'Shop',
  request_time: REQUESTED,
  obtained_at: OBTAINED,
  remark: '',
  cost_factors: [
    { id: 'cf-1', value: '10', currency: 'USD', type: 'accumulated', display_order: 0 },
  ],
  net_cost: [{ currency: 'USD', total: '10.0000' }],
  items: [ITEM, PLAIN_ITEM],
  item_count: 2,
  created_at: OBTAINED,
  updated_at: OBTAINED,
};

// Zero net cost + obtained-only date (merged row).
const ACQ_SOLO = {
  ...ACQ,
  id: 'acq-solo',
  source: 'Solo',
  request_time: null,
  obtained_at: OBTAINED,
  net_cost: [{ currency: 'USD', total: '0.0000' }],
  items: [SOLO_ITEM],
  item_count: 1,
};
// Requested-only date (merged row).
const ACQ_REQ = {
  ...ACQ,
  id: 'acq-req',
  source: 'Waiting',
  request_time: REQUESTED,
  obtained_at: null,
  net_cost: [{ currency: 'USD', total: '5.0000' }],
  items: [REQ_ITEM],
  item_count: 1,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

const headerTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.ant-table-thead th')).map(
    (th) => th.textContent?.trim() ?? '',
  );

// The td backing a cell, excluding AntD's hidden measure row.
const cellOf = (el: HTMLElement) => {
  const td = el.closest('td');
  return td && !td.closest('.ant-table-measure-row') ? td : null;
};

describe('CatalogPage (iteration 13 — derived columns & density)', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ACQ, ACQ_SOLO, ACQ_REQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ITEM, PLAIN_ITEM, SOLO_ITEM, REQ_ITEM],
    });
  });

  // CAT13-01 (a): default visible columns & order.
  it('shows only Acquisition, Item, SKU Price, Parameters, Actions by default', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    const headers = headerTexts(container).filter((h) => h !== '');
    // Sort carets render inside sortable titles; compare on startsWith-cleaned text.
    const names = headers.map((h) => h.replace(/\s+$/, ''));
    expect(names).toContain('Acquisition');
    expect(names).toContain('Item');
    expect(names).toContain('Parameters');
    const order = names.filter((h) =>
      ['Acquisition', 'Item', 'SKU Price', 'Parameters', 'Actions'].includes(h),
    );
    expect(order).toEqual(['Acquisition', 'Item', 'SKU Price', 'Parameters', 'Actions']);
    // Hidden-by-default columns render no headers (iteration 15: Quantity too).
    for (const hidden of ['Quantity', 'Remark', 'Name', 'Spec', 'URL', 'Source', 'Requested', 'Obtained', 'Net Cost', 'Status', 'Color', 'Volume', 'Weight', 'Deprecated At']) {
      expect(names).not.toContain(hidden);
    }
  });

  // CAT13-02 (b): derived Item cell — name link primary, spec secondary.
  it('renders the Item cell as a name link with a spec secondary row', async () => {
    renderPage();
    const name = await screen.findByText('Backpack');
    const link = name.closest('a');
    expect(link).toHaveAttribute('href', 'https://example.com/backpack');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link!.getAttribute('rel')).toContain('noopener');
    // Secondary spec row lives in the same cell.
    expect(within(cellOf(name)!).getByText('roomy')).toBeInTheDocument();
    // Without a URL the name is plain text; without a spec there is no secondary row.
    const plain = screen.getByText('Plain');
    expect(plain.closest('a')).toBeNull();
  });

  // CAT13-03 (c): derived Parameters cell — one Tag per non-empty attribute; "—" when none.
  it('renders Parameters as Tag badges and the placeholder when empty', async () => {
    renderPage();
    const name = await screen.findByText('Backpack');
    const row = name.closest('tr')!;
    const tags = Array.from(row.querySelectorAll('.ant-tag')).map((t) => t.textContent);
    expect(tags).toEqual(expect.arrayContaining(['red', '0.5 kg', '1.2 L', 'M']));
    // The no-parameters item shows the standard placeholder in its Parameters cell.
    const plainRow = screen.getByText('Plain').closest('tr')!;
    expect(plainRow.querySelectorAll('.ant-tag').length).toBe(0);
    expect(within(plainRow).getAllByText('-').length).toBeGreaterThan(0);
  });

  // CAT13-04 (d): derived Acquisition cell on the tree parent row.
  it('renders the Acquisition cell as "{source} {net cost}" with a date-range secondary row', async () => {
    renderPage();
    const primary = await screen.findByText('Shop 10 USD');
    const range = `${dayjs(REQUESTED).format('YYYY-MM-DD')} ~ ${dayjs(OBTAINED).format('YYYY-MM-DD')}`;
    expect(within(cellOf(primary)!).getByText(range)).toBeInTheDocument();
  });

  // CAT13-05 (d, flat mode): item rows carry their acquisition summary after an item-column sort.
  it('shows the acquisition summary on item rows in flat mode', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    // Click the SKU Price header → item-level sort → flat item list.
    const skuHeader = Array.from(container.querySelectorAll('.ant-table-thead th')).find((th) =>
      th.textContent?.includes('SKU Price'),
    )!;
    fireEvent.click(skuHeader);
    // Every flat item row carries its acquisition's summary.
    const summaries = await screen.findAllByText('Shop 10 USD');
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(inventoryService.listItems)).toHaveBeenCalled();
  });

  // CAT13-06 (e): Requested toggled visible renders the two-row datetime.
  it('renders two-row datetime for Requested when the column is toggled on', async () => {
    renderPage();
    await screen.findByText('Backpack');
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    const panelRow = (await screen.findByText('Requested')).closest('li, .ant-dropdown, div')!;
    const checkbox = within(panelRow as HTMLElement).getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
    const absolutes = await screen.findAllByText(dayjs(REQUESTED).format('YYYY-MM-DD HH:mm'));
    const absolute = absolutes.find((el) => cellOf(el))!;
    expect(within(cellOf(absolute)!).getAllByText(dayjs(REQUESTED).fromNow()).length).toBeGreaterThan(0);
  });

  // CAT13-07 (f): item rows have no Delete; acquisition rows keep Edit + Delete.
  it('offers only Deprecate/Restore on item rows and an Edit LINK on acquisition rows', async () => {
    renderPage();
    const name = await screen.findByText('Backpack');
    const itemRow = name.closest('tr')!;
    expect(within(itemRow).getByRole('button', { name: /Deprecate/ })).toBeInTheDocument();
    expect(within(itemRow).queryByRole('button', { name: /Delete/ })).toBeNull();
    const acqRow = screen.getByText('Shop 10 USD').closest('tr')!;
    // Iteration 19: Edit is a real hyperlink (new-tab capable); Delete is
    // gone from the catalog (it lives on the edit page's panel kebab).
    const edit = within(acqRow).getByText('Edit').closest('a')!;
    expect(edit).toHaveAttribute('href', '/inventory/acquisitions/acq-1/edit');
    expect(within(acqRow).queryByText('Delete')).toBeNull();
  });

  // CAT13-08 (g): the column dropdown lists every real column, including URL.
  it('lists url, color, volume, and deprecate-time columns in the Columns panel', async () => {
    renderPage();
    await screen.findByText('Backpack');
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    for (const label of ['URL', 'Color', 'Volume', 'Deprecated At', 'Name', 'Spec', 'Source', 'Requested', 'Obtained', 'Net Cost', 'Status']) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  // CAT13-09 (h): derived columns are not sortable; real columns are.
  it('shows no sort carets on derived column headers', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    const headerFor = (label: string) =>
      Array.from(container.querySelectorAll('.ant-table-thead th')).find((th) =>
        th.textContent?.includes(label),
      )!;
    expect(headerFor('SKU Price').querySelector('.anticon-caret-up')).toBeTruthy();
    for (const derived of ['Acquisition', 'Item', 'Parameters']) {
      expect(headerFor(derived).querySelector('.anticon-caret-up')).toBeNull();
    }
  });

  // Carried forward: caret column, expanded-by-default tree, standard footer, "New" action.
  it('keeps the caret column, default expansion, footer pagination, and "New" action', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    expect(container.querySelector('.anticon-caret-down, .anticon-caret-right')).toBeTruthy();
    expect(container.querySelector('.ant-table-footer .ant-pagination')).toBeTruthy();
    expect(screen.getByRole('button', { name: /New/ }).textContent).toBe('New');
    const sortBtn = screen.getByRole('button', { name: /Sort/ });
    expect(sortBtn.className).toContain('ant-btn-primary');
  });
});

describe('CatalogPage (iteration 15 — merged rows, layers, footer)', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ACQ, ACQ_SOLO, ACQ_REQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ITEM, PLAIN_ITEM, SOLO_ITEM, REQ_ITEM],
    });
  });

  // CAT15-01 (FR-003b): single-item acquisition = ONE merged collapsed row.
  it('renders a single-item acquisition as one merged row with both actions', async () => {
    renderPage();
    const lantern = await screen.findByText('Lantern');
    const row = lantern.closest('tr')!;
    // Same row carries the acquisition summary (zero cost hidden → source only).
    expect(within(row).getByText('Solo')).toBeInTheDocument();
    // Both entities' actions side by side (iteration 19: Edit is a link,
    // no Delete on the catalog).
    expect(within(row).getByText('Edit').closest('a')).toHaveAttribute(
      'href',
      '/inventory/acquisitions/acq-solo/edit',
    );
    expect(within(row).queryByText('Delete')).toBeNull();
    expect(within(row).getByRole('button', { name: /Deprecate/ })).toBeInTheDocument();
    // No separate child row while collapsed.
    expect(screen.getAllByText('Lantern')).toHaveLength(1);
  });

  // CAT15-02 (FR-003b): expanding the merged row splits it into two rows.
  it('splits a merged row into acquisition + item rows on expand', async () => {
    const { container } = renderPage();
    const lantern = await screen.findByText('Lantern');
    const row = lantern.closest('tr')!;
    const caret = within(row).getByLabelText(/caret-right/i, { selector: 'span[role="img"]' });
    fireEvent.click(caret.closest('span[style]') ?? caret);
    // Two rows now: the parent shows the item count (singular! iteration 17).
    expect(await screen.findByText('1 item')).toBeInTheDocument();
    expect(container.querySelectorAll('tr.ant-table-row-level-1').length).toBeGreaterThan(2);
  });

  // CAT15-03: multi-item parent row shows the item count in the Item cell.
  it('shows the item count on unmerged acquisition rows', async () => {
    renderPage();
    await screen.findByText('Backpack');
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  // CAT15-04: ×N tertiary row only when quantity > 1.
  it('renders the ×quantity tertiary row only for quantity > 1', async () => {
    renderPage();
    const plain = await screen.findByText('Plain');
    expect(within(plain.closest('td')!).getByText('×2')).toBeInTheDocument();
    const backpack = screen.getByText('Backpack');
    expect(within(backpack.closest('td')!).queryByText(/^×1$/)).toBeNull();
  });

  // CAT15-05: four date-range cases.
  it('renders the four exact date cases', async () => {
    renderPage();
    await screen.findByText('Backpack');
    const both = `${dayjs(REQUESTED).format('YYYY-MM-DD')} ~ ${dayjs(OBTAINED).format('YYYY-MM-DD')}`;
    expect(screen.getByText(both)).toBeInTheDocument();
    // Obtained-only: bare date, no tilde.
    expect(screen.getByText(dayjs(OBTAINED).format('YYYY-MM-DD'))).toBeInTheDocument();
    // Requested-only: trailing tilde.
    expect(screen.getByText(`${dayjs(REQUESTED).format('YYYY-MM-DD')} ~`)).toBeInTheDocument();
  });

  // CAT15-06: zero net cost hidden from the Acquisition primary.
  it('hides a zero net cost', async () => {
    renderPage();
    await screen.findByText('Lantern');
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByText('Solo 0 USD')).toBeNull();
    // Non-zero still shown.
    expect(screen.getByText('Waiting 5 USD')).toBeInTheDocument();
  });

  // CAT15-07: footer shows "{x} acquisitions, {y} items".
  it('renders the footer totals', async () => {
    renderPage();
    await screen.findByText('Backpack');
    expect(screen.getByText('3 acquisitions, 4 items')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ records/)).toBeNull();
  });
});

describe('CatalogPage (iteration 16 — Toggle column)', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ACQ, ACQ_SOLO, ACQ_REQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ITEM, PLAIN_ITEM, SOLO_ITEM, REQ_ITEM],
    });
  });

  // CAT16-01 (FR-003): the caret column is pinned sticky-left by default.
  it('pins the Toggle column sticky-left by default', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    const caret = container.querySelector(
      '.ant-table-tbody tr.ant-table-row td .anticon-caret-down, .ant-table-tbody tr.ant-table-row td .anticon-caret-right',
    )!;
    expect(caret).toBeTruthy();
    expect(caret.closest('td')!.className).toContain('ant-table-cell-fix-left');
  });

  // CAT16-02 (FR-003): "Toggle" is listed (checked) in the Columns panel.
  it('lists Toggle checked in the Columns panel', async () => {
    renderPage();
    await screen.findByText('Backpack');
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    const label = await screen.findByText('Toggle');
    const row = label.closest('li, .ant-space, div') as HTMLElement;
    expect(within(row).getByRole('checkbox')).toBeChecked();
  });

  // CAT16-03 (FR-003): unchecking Toggle hides the caret column.
  it('hides the caret column when Toggle is unchecked and applied', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    const label = await screen.findByText('Toggle');
    const row = label.closest('li, .ant-space, div') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
    await waitFor(() => {
      expect(
        container.querySelector(
          '.ant-table-tbody tr.ant-table-row td .anticon-caret-down, .ant-table-tbody tr.ant-table-row td .anticon-caret-right',
        ),
      ).toBeNull();
    });
  });

  // CAT16-04 (FR-003): flat mode never renders the Toggle column.
  it('renders no Toggle column in flat mode', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    const skuHeader = Array.from(container.querySelectorAll('.ant-table-thead th')).find((th) =>
      th.textContent?.includes('SKU Price'),
    )!;
    fireEvent.click(skuHeader);
    await screen.findAllByText('Shop 10 USD');
    expect(
      container.querySelector(
        '.ant-table-tbody tr.ant-table-row td .anticon-caret-down, .ant-table-tbody tr.ant-table-row td .anticon-caret-right',
      ),
    ).toBeNull();
  });
});

describe('CatalogPage (iteration 17 — plurals, name link, url width, seeded defaults)', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ACQ, ACQ_SOLO, ACQ_REQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ITEM, PLAIN_ITEM, SOLO_ITEM, REQ_ITEM],
    });
  });

  const toggleColumn = async (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    const el = await screen.findByText(label);
    const row = el.closest('li, .ant-space, div') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
  };

  // CAT17-01 (FR-003): footer totals pluralize correctly.
  it('pluralizes the footer totals', async () => {
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      totals: { acquisitions: 1, items: 1 },
      results: [ACQ_SOLO],
    });
    renderPage();
    await screen.findByText('Lantern');
    expect(screen.getByText('1 acquisition, 1 item')).toBeInTheDocument();
  });

  // CAT17-02 (FR-003): the Name column renders plain text — Item keeps the link.
  it('renders the Name column without a hyperlink', async () => {
    renderPage();
    await screen.findByText('Backpack');
    await toggleColumn('Name');
    await waitFor(() => {
      // Backpack now renders twice: Item cell (link) + Name cell (plain).
      const occurrences = screen.getAllByText('Backpack');
      expect(occurrences.length).toBeGreaterThanOrEqual(2);
      const linked = occurrences.filter((el) => el.closest('a'));
      expect(linked).toHaveLength(1);
    });
  });

  // CAT17-03 (FR-003): url cell renders capped (320px) with the full URL text.
  it('caps the url cell render at 320px', async () => {
    renderPage();
    await screen.findByText('Backpack');
    await toggleColumn('URL');
    const links = await screen.findAllByText('https://example.com/backpack');
    const link = links.find((el) => el.closest('td'))!;
    const anchor = link.closest('a')!;
    expect(anchor.style.maxWidth).toBe('320px');
  });

  // CAT17-04 (FR-003): the YTD+pending default filter is seeded and lit.
  it('seeds the default filter (obtained >= year start OR empty) and lights Filter', async () => {
    renderPage();
    await screen.findByText('Backpack');
    expect(screen.getByRole('button', { name: /Filter/ }).className).toContain('ant-btn-primary');
    const call = vi.mocked(inventoryService.listAcquisitions).mock.calls.at(-1)![0]!;
    const yearStart = dayjs().startOf('year').format('YYYY-MM-DD');
    expect(call.filters).toEqual({
      groups: [
        { logic: 'and', conditions: [{ attr: 'obtained_at', op: 'gte', val: yearStart }] },
        { logic: 'and', conditions: [{ attr: 'obtained_at', op: 'is_empty', val: '' }] },
      ],
    });
  });

  // CAT17-05 (FR-003): default page size is 50.
  it('defaults to 50 per page', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    expect(
      container.querySelector('.ant-table-footer .ant-select-selection-item')?.textContent,
    ).toContain('50');
    const call = vi.mocked(inventoryService.listAcquisitions).mock.calls.at(-1)![0]!;
    expect(call.limit).toBe(50);
  });
});

describe('CatalogPage (iteration 18 — alias display)', () => {
  const ALIASED_ITEM = {
    ...SOLO_ITEM,
    id: 'itm-alias',
    name: 'Seller Product 42',
    alias_name: 'Torchy',
    url: 'https://example.com/torch',
    acquisition: {
      id: 'acq-alias',
      source: 'AliasShop',
      request_time: null,
      obtained_at: OBTAINED,
      net_cost: [{ currency: 'USD', total: '3.0000' }],
    },
  };
  const ACQ_ALIAS = {
    ...ACQ,
    id: 'acq-alias',
    source: 'AliasShop',
    net_cost: [{ currency: 'USD', total: '3.0000' }],
    items: [ALIASED_ITEM],
    item_count: 1,
  };

  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      totals: { acquisitions: 2, items: 3 },
      results: [ACQ, ACQ_ALIAS],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      totals: { acquisitions: 2, items: 3 },
      results: [ITEM, PLAIN_ITEM, ALIASED_ITEM],
    });
  });

  // CAT18-01 (FR-030): the Item cell prefers the alias, keeps the link, and
  // reveals the original seller name in a tooltip.
  it('prefers the alias in the Item cell with a tooltip carrying the original name', async () => {
    renderPage();
    const alias = await screen.findByText('Torchy');
    expect(screen.queryByText('Seller Product 42')).toBeNull();
    const link = alias.closest('a')!;
    expect(link).toHaveAttribute('href', 'https://example.com/torch');
    fireEvent.mouseEnter(alias);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Seller Product 42');
  });

  // CAT18-02 (FR-030): a hidden "Alias" column joins the Columns dropdown.
  it('lists Alias (unchecked) in the Columns dropdown', async () => {
    renderPage();
    await screen.findByText('Torchy');
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    const label = await screen.findByText('Alias');
    const row = label.closest('li, .ant-space, div') as HTMLElement;
    expect(within(row).getByRole('checkbox')).not.toBeChecked();
  });
});

describe('CatalogPage (iteration 21 — flat-mode acquisition Edit link)', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ACQ, ACQ_SOLO, ACQ_REQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      totals: { acquisitions: 3, items: 4 },
      results: [ITEM, PLAIN_ITEM, SOLO_ITEM, REQ_ITEM],
    });
  });

  // CAT21-01 (FR-003): flat rows carry their parent acquisition's Edit link.
  it('exposes the acquisition Edit link on every flat-mode item row', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    // Item-column sort → flat mode.
    const skuHeader = Array.from(container.querySelectorAll('.ant-table-thead th')).find((th) =>
      th.textContent?.includes('SKU Price'),
    )!;
    fireEvent.click(skuHeader);
    await screen.findAllByText('Shop 10 USD');
    const backpackRow = screen.getByText('Backpack').closest('tr')!;
    const edit = within(backpackRow).getByText('Edit').closest('a')!;
    expect(edit).toHaveAttribute('href', '/inventory/acquisitions/acq-1/edit');
    // Item action still present alongside.
    expect(within(backpackRow).getByRole('button', { name: /Deprecate/ })).toBeInTheDocument();
  });

  // CAT21-02 (FR-003): tree-mode CHILD rows still carry no Edit (parent has it).
  it('keeps tree-mode item child rows without an Edit link', async () => {
    renderPage();
    const backpack = await screen.findByText('Backpack');
    const childRow = backpack.closest('tr')!;
    expect(within(childRow).queryByText('Edit')).toBeNull();
  });
});
