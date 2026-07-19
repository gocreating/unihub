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
      deprecated: false,
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

describe('AcquisitionEditPage (iteration 33 — STAGED item mutations, FR-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inventoryService.getAcquisition).mockResolvedValue(ACQ);
    vi.mocked(inventoryService.listSources).mockResolvedValue([]);
    vi.mocked(inventoryService.deleteItem).mockResolvedValue(undefined);
    vi.mocked(inventoryService.updateItem).mockResolvedValue(ACQ.items[0]!);
    vi.mocked(inventoryService.updateAcquisition).mockResolvedValue(ACQ);
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue([]);
    vi.mocked(financeService.listCurrencies).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
  });

  // SM-01: removing a card MUST NOT call the delete API — it stages.
  it('does not delete an item when its card Remove is clicked', async () => {
    renderPage();
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('delete'));
    await waitFor(() => expect(screen.queryByText('Thing')).toBeNull());
    expect(vi.mocked(inventoryService.deleteItem)).not.toHaveBeenCalled();
  });

  // SM-02: editing a card via the modal MUST NOT call the update API — it stages.
  it('does not update an item when its card is edited via the modal', async () => {
    renderPage();
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('edit'));
    const modal = (await screen.findByText('Add Item')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getByDisplayValue('Thing'), { target: { value: 'Thing v2' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(screen.queryByText('Thing v2')).toBeInTheDocument());
    expect(vi.mocked(inventoryService.updateItem)).not.toHaveBeenCalled();
  });

  // SM-03: the page Save applies exactly the staged mutations.
  it('applies staged deletion and edits only on the page Save', async () => {
    renderPage();
    // Stage an edit on the existing card…
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('edit'));
    const modal = (await screen.findByText('Add Item')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getByDisplayValue('Thing'), { target: { value: 'Thing v2' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Save/ }));
    await screen.findByText('Thing v2');
    // …then Save the page: updateItem fires with the staged data.
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() =>
      expect(vi.mocked(inventoryService.updateItem)).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ name: 'Thing v2' }),
      ),
    );
    expect(vi.mocked(inventoryService.updateAcquisition)).toHaveBeenCalled();
    expect(vi.mocked(inventoryService.deleteItem)).not.toHaveBeenCalled();
  });

  it('applies a staged removal only on the page Save', async () => {
    renderPage();
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('delete'));
    await waitFor(() => expect(screen.queryByText('Thing')).toBeNull());
    expect(vi.mocked(inventoryService.deleteItem)).not.toHaveBeenCalled();
    // An acquisition needs ≥1 item to save — add a replacement card first.
    const itemsCard = screen
      .getAllByText('Items')
      .map((el) => el.closest('.ant-card-head'))
      .find(Boolean)!
      .closest('.ant-card') as HTMLElement;
    fireEvent.click(within(itemsCard).getByRole('button', { name: /Add/ }));
    const modal = (await screen.findByText('Add Item')).closest('.ant-modal') as HTMLElement;
    fireEvent.change(within(modal).getAllByRole('textbox')[0]!, { target: { value: 'Replacement' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Save/ }));
    await screen.findByText('Replacement');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.deleteItem)).toHaveBeenCalledWith('it-1'));
  });

  // SM-04: leaving without saving discards everything — zero item API calls.
  it('discards staged mutations on unmount without saving', async () => {
    const view = renderPage();
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('delete'));
    await waitFor(() => expect(screen.queryByText('Thing')).toBeNull());
    view.unmount();
    expect(vi.mocked(inventoryService.deleteItem)).not.toHaveBeenCalled();
    expect(vi.mocked(inventoryService.updateItem)).not.toHaveBeenCalled();
  });
});
