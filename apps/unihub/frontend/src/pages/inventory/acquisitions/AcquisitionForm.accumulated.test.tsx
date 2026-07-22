import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { AcquisitionForm } from './AcquisitionForm';
import * as inventoryService from '@/services/unihub-backend/inventory';
import * as coreService from '@/services/unihub-backend/core';
import * as financeService from '@/services/unihub-backend/finance';
import type { Acquisition } from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');
vi.mock('@/services/unihub-backend/core');
vi.mock('@/services/unihub-backend/finance');

// Edit-mode fixture: one USD-priced item; the accumulated line was manually
// zeroed by the user (user_managed) — feature 018 US1.
function makeAcq(userManaged: boolean, accValue: string): Acquisition {
  return {
    id: 'acq-1',
    source: 'Shop',
    request_time: null,
    obtained_at: '2026-07-01T00:00:00Z',
    remark: '',
    cost_factors: [
      {
        id: 'cf-1',
        value: accValue,
        currency: 'USD',
        type: 'accumulated',
        display_order: 0,
        user_managed: userManaged,
      },
    ],
    net_cost: [{ currency: 'USD', total: accValue }],
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
}

function renderForm(initial?: Acquisition) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <AcquisitionForm initial={initial} />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

function costCard(): HTMLElement {
  return screen.getByText('Cost').closest('.ant-card') as HTMLElement;
}

// Accumulated rows render before manual rows inside the Cost card, so the
// first spinbutton is the first accumulated line's amount.
function accumulatedAmountInput(index = 0): HTMLInputElement {
  return within(costCard()).getAllByRole('spinbutton')[index] as HTMLInputElement;
}

async function fillCardModal(name: string, price?: number) {
  const modal = (await screen.findByText('Add Item')).closest('.ant-modal') as HTMLElement;
  fireEvent.change(within(modal).getAllByRole('textbox')[0]!, { target: { value: name } });
  if (price != null) {
    // Modal spinbuttons: [0] = quantity, [1] = SKU price.
    fireEvent.change(within(modal).getAllByRole('spinbutton')[1]!, {
      target: { value: String(price) },
    });
  }
  fireEvent.click(within(modal).getByRole('button', { name: /Save/ }));
  // AntD keeps the closed modal mounted — wait for its wrap to hide instead.
  await waitFor(() => {
    const wrap = document.querySelector('.ant-modal-wrap') as HTMLElement | null;
    expect(!wrap || wrap.style.display === 'none').toBe(true);
  });
}

async function editCard(cardIndex: number, name: string, price?: number) {
  const card = document.querySelectorAll('.ant-card-small')[cardIndex] as HTMLElement;
  fireEvent.click(within(card).getByLabelText('edit'));
  await fillCardModal(name, price);
}

async function addCard(name: string, price?: number) {
  const itemsCard = screen
    .getAllByText('Items')
    .map((el) => el.closest('.ant-card-head'))
    .find(Boolean)!
    .closest('.ant-card') as HTMLElement;
  fireEvent.click(within(itemsCard).getByRole('button', { name: /Add/ }));
  await fillCardModal(name, price);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inventoryService.listSources).mockResolvedValue([]);
  vi.mocked(inventoryService.createAcquisition).mockResolvedValue(makeAcq(false, '0'));
  vi.mocked(inventoryService.updateAcquisition).mockResolvedValue(makeAcq(false, '0'));
  vi.mocked(inventoryService.deleteItem).mockResolvedValue(undefined);
  vi.mocked(inventoryService.updateItem).mockResolvedValue(makeAcq(false, '0').items[0]!);
  vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue([]);
  vi.mocked(financeService.listCurrencies).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  } as never);
});

describe('AcquisitionForm — accumulated ownership on CREATE (018 US1)', () => {
  // AC-01 (FR-001/FR-002): a cleared accumulated line is sent verbatim as a
  // user-managed zero — never silently replaced by the derived sum.
  it('sends the cleared accumulated line as user-managed zero on create', async () => {
    renderForm();
    await editCard(0, 'Thing', 500);
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('500'));
    fireEvent.change(accumulatedAmountInput(), { target: { value: '' } });
    fireEvent.blur(accumulatedAmountInput());
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.createAcquisition)).toHaveBeenCalled());
    const payload = vi.mocked(inventoryService.createAcquisition).mock.calls[0]![0]!;
    expect(payload.cost_factors).toEqual([
      expect.objectContaining({ type: 'accumulated', value: '0', user_managed: true }),
    ]);
  });

  // AC-02 (FR-006): an untouched accumulated line tracks item edits live and
  // is sent at its derived value as auto-managed.
  it('keeps an untouched accumulated line tracking item price edits', async () => {
    renderForm();
    await editCard(0, 'Thing', 500);
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('500'));
    await editCard(0, 'Thing', 600);
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('600'));
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.createAcquisition)).toHaveBeenCalled());
    const payload = vi.mocked(inventoryService.createAcquisition).mock.calls[0]![0]!;
    expect(payload.cost_factors).toEqual([
      expect.objectContaining({ type: 'accumulated', value: '600', user_managed: false }),
    ]);
  });

  // AC-03 (FR-005): Reset restores the derived sum AND re-enables tracking.
  it('re-enables live tracking after Reset on a manually cleared line', async () => {
    renderForm();
    await editCard(0, 'Thing', 500);
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('500'));
    fireEvent.change(accumulatedAmountInput(), { target: { value: '' } });
    fireEvent.blur(accumulatedAmountInput());
    fireEvent.click(screen.getByTitle('Reset accumulated'));
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('500'));
    // Tracking is live again: an item edit moves the line.
    await editCard(0, 'Thing', 600);
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('600'));
  });

  // AC-04: manual factors ride along unchanged next to the accumulated line.
  it('sends manual factors alongside the accumulated line', async () => {
    renderForm();
    await editCard(0, 'Thing', 500);
    await waitFor(() => expect(accumulatedAmountInput()).toHaveValue('500'));
    fireEvent.click(within(costCard()).getByRole('button', { name: /Add/ }));
    // New manual row's amount is the second spinbutton in the Cost card.
    fireEvent.change(within(costCard()).getAllByRole('spinbutton')[1]!, {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.createAcquisition)).toHaveBeenCalled());
    const payload = vi.mocked(inventoryService.createAcquisition).mock.calls[0]![0]!;
    expect(payload.cost_factors).toEqual([
      expect.objectContaining({ type: 'accumulated', value: '500', user_managed: false }),
      expect.objectContaining({ type: 'other', value: '5' }),
    ]);
  });
});

describe('AcquisitionForm — accumulated ownership on EDIT (018 US1)', () => {
  // AC-05 (FR-003/FR-004): a stored user-managed zero stays frozen through
  // item edits and is saved verbatim.
  it('never recalculates a stored user-managed accumulated line', async () => {
    renderForm(makeAcq(true, '0'));
    await screen.findByText('Thing');
    expect(accumulatedAmountInput()).toHaveValue('0');
    await editCard(0, 'Thing', 999);
    expect(accumulatedAmountInput()).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.updateAcquisition)).toHaveBeenCalled());
    const payload = vi.mocked(inventoryService.updateAcquisition).mock.calls[0]![1]!;
    expect(payload.cost_factors).toEqual([
      expect.objectContaining({ type: 'accumulated', currency: 'USD', value: '0', user_managed: true }),
    ]);
  });

  // AC-06 (edge): a user-managed line survives its currency losing every
  // priced item.
  it('keeps a user-managed line whose currency lost all priced items', async () => {
    renderForm(makeAcq(true, '0'));
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('delete'));
    await waitFor(() => expect(screen.queryByText('Thing')).toBeNull());
    await addCard('Replacement'); // unpriced
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.updateAcquisition)).toHaveBeenCalled());
    const payload = vi.mocked(inventoryService.updateAcquisition).mock.calls[0]![1]!;
    expect(payload.cost_factors).toEqual([
      expect.objectContaining({ type: 'accumulated', currency: 'USD', value: '0', user_managed: true }),
    ]);
  });

  // AC-07 (edge): an auto line in the same situation disappears (replaced by
  // the empty-currency zero placeholder), as before 018.
  it('drops an auto line whose currency lost all priced items', async () => {
    renderForm(makeAcq(false, '10'));
    const card = (await screen.findByText('Thing')).closest('.ant-card-small') as HTMLElement;
    fireEvent.click(within(card).getByLabelText('delete'));
    await waitFor(() => expect(screen.queryByText('Thing')).toBeNull());
    await addCard('Replacement'); // unpriced
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(vi.mocked(inventoryService.updateAcquisition)).toHaveBeenCalled());
    const payload = vi.mocked(inventoryService.updateAcquisition).mock.calls[0]![1]!;
    const accumulated = payload.cost_factors!.filter((f) => f.type === 'accumulated');
    expect(accumulated).toEqual([
      expect.objectContaining({ currency: '', value: '0', user_managed: false }),
    ]);
  });
});
