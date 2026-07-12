import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  spec: '',
  sku_price: null,
  sku_price_currency: '',
  total_price: null,
  url: '',
  parameters: [],
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
      count: 1,
      next: null,
      previous: null,
      results: [ACQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [ITEM, PLAIN_ITEM],
    });
  });

  // CAT13-01 (a): default visible columns & order.
  it('shows only Acquisition, Item, Quantity, SKU Price, Parameters, Actions by default', async () => {
    const { container } = renderPage();
    await screen.findByText('Backpack');
    const headers = headerTexts(container).filter((h) => h !== '');
    // Sort carets render inside sortable titles; compare on startsWith-cleaned text.
    const names = headers.map((h) => h.replace(/\s+$/, ''));
    expect(names).toContain('Acquisition');
    expect(names).toContain('Item');
    expect(names).toContain('Parameters');
    const order = names.filter((h) =>
      ['Acquisition', 'Item', 'Quantity', 'SKU Price', 'Parameters', 'Actions'].includes(h),
    );
    expect(order).toEqual(['Acquisition', 'Item', 'Quantity', 'SKU Price', 'Parameters', 'Actions']);
    // Hidden-by-default columns render no headers.
    for (const hidden of ['Name', 'Spec', 'URL', 'Source', 'Requested', 'Obtained', 'Net Cost', 'Status', 'Color', 'Volume', 'Weight', 'Deprecated At']) {
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
    // Click the Quantity header → item-level sort → flat item list.
    const qtyHeader = Array.from(container.querySelectorAll('.ant-table-thead th')).find((th) =>
      th.textContent?.includes('Quantity'),
    )!;
    fireEvent.click(qtyHeader);
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
    const absolute = await screen.findByText(dayjs(REQUESTED).format('YYYY-MM-DD HH:mm'));
    expect(within(cellOf(absolute)!).getByText(dayjs(REQUESTED).fromNow())).toBeInTheDocument();
  });

  // CAT13-07 (f): item rows have no Delete; acquisition rows keep Edit + Delete.
  it('offers only Deprecate/Restore on item rows, Edit/Delete on acquisition rows', async () => {
    renderPage();
    const name = await screen.findByText('Backpack');
    const itemRow = name.closest('tr')!;
    expect(within(itemRow).getByRole('button', { name: /Deprecate/ })).toBeInTheDocument();
    expect(within(itemRow).queryByRole('button', { name: /Delete/ })).toBeNull();
    const acqRow = screen.getByText('Shop 10 USD').closest('tr')!;
    expect(within(acqRow).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(within(acqRow).getByRole('button', { name: /Delete/ })).toBeInTheDocument();
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
    expect(headerFor('Quantity').querySelector('.anticon-caret-up')).toBeTruthy();
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
