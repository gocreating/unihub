import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { AcquisitionEditPage } from './edit';
import * as inventoryService from '@/services/unihub-backend/inventory';
import * as coreService from '@/services/unihub-backend/core';
import * as financeService from '@/services/unihub-backend/finance';
import type { Acquisition } from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');
vi.mock('@/services/unihub-backend/core');
vi.mock('@/services/unihub-backend/finance');

const ACQ: Acquisition = {
  id: 'acq-9',
  source: 'Shop',
  request_time: null,
  obtained_at: '2026-07-01T00:00:00Z',
  remark: '',
  cost_factors: [
    { id: 'cf-1', value: '10', currency: 'USD', type: 'accumulated', display_order: 0 },
  ],
  net_cost: [{ currency: 'USD', total: '10.0000' }],
  items: [
    {
      id: 'it-1',
      name: 'Thing',
      alias_name: '',
      quantity: 1,
      spec: '',
      remark: '',
      sku_price: '10',
      sku_price_currency: 'USD',
      total_price: '10.0000',
      url: '',
      status: 'active',
      deprecate_time: null,
      parameters: [],
      acquisition: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    },
  ],
  item_count: 1,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
} as Acquisition;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter initialEntries={['/inventory/acquisitions/acq-9/edit']}>
          <Routes>
            <Route path="/inventory/acquisitions/:id/edit" element={<AcquisitionEditPage />} />
            <Route path="/inventory/catalog" element={<div>CATALOG-PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('AcquisitionEditPage (iteration 19 — panel kebab Delete)', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.getAcquisition).mockResolvedValue(ACQ);
    vi.mocked(inventoryService.listSources).mockResolvedValue([]);
    vi.mocked(inventoryService.deleteAcquisition).mockResolvedValue(undefined);
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue([]);
    vi.mocked(financeService.listCurrencies).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
  });

  it('deletes the acquisition from the Acquisition panel kebab and returns to the catalog', async () => {
    renderPage();
    await screen.findByDisplayValue('Shop');
    // The Acquisition panel header carries the kebab (v1.21.0).
    fireEvent.click(screen.getByLabelText('acquisition-actions'));
    fireEvent.click(await screen.findByText('Delete'));
    // Item-count confirmation.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('1');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.deleteAcquisition)).toHaveBeenCalledWith('acq-9'),
    );
    expect(await screen.findByText('CATALOG-PAGE')).toBeInTheDocument();
  });
});
