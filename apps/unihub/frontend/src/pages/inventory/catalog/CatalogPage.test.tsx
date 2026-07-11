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
  url: '',
  status: 'active' as const,
  deprecate_time: null,
  acquisition: { id: 'acq-1', source: 'Shop', obtained_at: '2026-07-11T00:00:00Z' },
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
  });

  it('renders Source/Name + the Requested and item columns; tree expanded by default', async () => {
    renderPage();
    // Source column shows the acquisition source.
    await screen.findByText('Shop');
    // Net cost shows the per-currency total.
    expect(screen.getAllByText('10 USD').length).toBeGreaterThan(0);
    // Separate Source and Name column headers exist.
    expect(screen.getAllByText('Source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
    // The Requested column (request_time) was added this iteration.
    expect(screen.getAllByText('Requested').length).toBeGreaterThan(0);
    // Item columns are present.
    expect(screen.getAllByText('Quantity').length).toBeGreaterThan(0);
    expect(screen.getAllByText('URL').length).toBeGreaterThan(0);
    // Tree is expanded by default → the child item name is visible without a click.
    expect(screen.getByText('Backpack')).toBeInTheDocument();
    // The "Acquisition" badge is gone.
    expect(screen.queryByText('Acquisition')).not.toBeInTheDocument();
  });

  it('has a dedicated caret column, pagination, and no item-count column', async () => {
    const { container } = renderPage();
    await screen.findByText('Shop');
    // A caret disclosure icon is rendered (dedicated column).
    expect(container.querySelector('.anticon-caret-down, .anticon-caret-right')).toBeTruthy();
    // Pagination is restored.
    expect(container.querySelector('.ant-pagination')).toBeTruthy();
    // The item-count ("Items") column header is gone (only item/acq data columns remain).
    const headers = Array.from(container.querySelectorAll('.ant-table-thead th')).map(
      (th) => th.textContent,
    );
    expect(headers).not.toContain('Items');
  });
});
