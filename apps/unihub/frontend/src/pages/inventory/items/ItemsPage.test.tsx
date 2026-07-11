import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ItemsPage } from './index';
import * as inventoryService from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');

const ITEM = {
  id: 'itm-1',
  name: 'Backpack',
  item_type: 'stockable' as const,
  category: 'gear',
  model: 'X100',
  serial_number: '',
  quantity: null,
  length: null,
  width: null,
  height: null,
  size: '',
  weight: '0.500',
  price: null,
  cost: null,
  purchase_time: null,
  storage_location: '',
  status: 'available',
  acquisition: null,
  acquisition_detail: null,
  origin_known: false,
  archived_at: null,
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
};

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
  });

  it('renders items from the catalog with a localized type tag', async () => {
    renderPage();
    await screen.findByText('Backpack');
    // item_type is rendered as a localized <Tag>
    expect(screen.getByText('Stockable')).toBeInTheDocument();
    // the New Item action button is present
    expect(screen.getByText('New Item')).toBeInTheDocument();
  });
});
