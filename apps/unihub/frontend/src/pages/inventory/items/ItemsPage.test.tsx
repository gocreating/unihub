import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ItemsPage } from './index';
import * as inventoryService from '@/services/unihub-backend/inventory';
import * as financeService from '@/services/unihub-backend/finance';

vi.mock('@/services/unihub-backend/inventory');
vi.mock('@/services/unihub-backend/finance');

const ITEM = {
  id: 'itm-1',
  name: 'Backpack',
  item_type: 'stockable' as const,
  quantity: '1',
  spec: '',
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

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <ItemsPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('ItemsPage', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.listItems).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [ITEM],
    });
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
  });

  it('renders items with measurement value+unit and a Deprecate action', async () => {
    renderPage();
    await screen.findByText('Backpack');
    expect(screen.getByText('0.5 kg')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    // active item offers Deprecate (not Restore); no standalone New Item button
    expect(screen.getByText('Deprecate')).toBeInTheDocument();
    expect(screen.queryByText('New Item')).not.toBeInTheDocument();
  });
});
