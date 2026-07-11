import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { CatalogPage } from './index';
import * as inventoryService from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');

const ITEM = {
  id: 'itm-1',
  name: 'Backpack',
  quantity: 1,
  spec: 'roomy',
  remark: '',
  size: '',
  length: null,
  width: null,
  height: null,
  weight: { value: '0.5', unit: 'kg' },
  volume: null,
  sku_price: '10',
  sku_price_currency: 'USD',
  total_price: '10.0000',
  color: '',
  url: 'https://example.com/backpack',
  status: 'active' as const,
  deprecate_time: null,
  acquisition: {
    id: 'acq-1',
    source: 'Shop',
    request_time: null,
    obtained_at: '2026-07-11T00:00:00Z',
  },
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
};

const ACQ = {
  id: 'acq-1',
  source: 'Shop',
  request_time: null,
  obtained_at: '2026-07-11T00:00:00Z',
  remark: '',
  cost_factors: [
    { id: 'cf-1', value: '10', currency: 'USD', type: 'accumulated', display_order: 0 },
  ],
  net_cost: [{ currency: 'USD', total: '10.0000' }],
  items: [ITEM],
  item_count: 1,
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
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

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.listAcquisitions).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [ACQ],
    });
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [ITEM],
    });
  });

  it('renders Source/Name + Requested and item columns; tree expanded by default', async () => {
    renderPage();
    await screen.findByText('Shop');
    expect(screen.getAllByText('10 USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Requested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quantity').length).toBeGreaterThan(0);
    // Tree expanded by default → the child item name is visible without a click.
    expect(screen.getByText('Backpack')).toBeInTheDocument();
    expect(screen.queryByText('Acquisition')).not.toBeInTheDocument();
  });

  it('has no URL column; the Name cell links to the item URL', async () => {
    renderPage();
    await screen.findByText('Shop');
    // No standalone URL column.
    const headers = Array.from(document.querySelectorAll('.ant-table-thead th')).map((th) => th.textContent);
    expect(headers).not.toContain('URL');
    // The Name cell is an anchor to the item URL, opening a new tab.
    const link = screen.getByText('Backpack').closest('a');
    expect(link).toHaveAttribute('href', 'https://example.com/backpack');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('has a caret column and the standard EntityOffsetFooter pagination', async () => {
    const { container } = renderPage();
    await screen.findByText('Shop');
    expect(container.querySelector('.anticon-caret-down, .anticon-caret-right')).toBeTruthy();
    // Standard footer pagination (Ant Pagination inside the table footer).
    expect(container.querySelector('.ant-table-footer .ant-pagination')).toBeTruthy();
    const headers = Array.from(container.querySelectorAll('.ant-table-thead th')).map((th) => th.textContent);
    expect(headers).not.toContain('Items');
  });
});
