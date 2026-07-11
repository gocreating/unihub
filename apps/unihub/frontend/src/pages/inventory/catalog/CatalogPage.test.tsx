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
  cost_factors: [{ id: 'cf-1', value: '10', currency: 'USD', type: 'accumulated' as const }],
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

  it('renders acquisition parent rows with net cost per currency', async () => {
    renderPage();
    await screen.findByText('Shop');
    // Net cost shows the per-currency total.
    expect(screen.getByText('10 USD')).toBeInTheDocument();
    // The acquisition row is tagged as such.
    expect(screen.getByText('Acquisition')).toBeInTheDocument();
  });
});
