import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { TransactionFormModal } from './TransactionFormModal';
import type { Asset, Currency, Transaction } from '@/services/unihub-backend/finance';

const ASSETS = [
  { id: 'a1', name: '0050.TW' },
  { id: 'a2', name: 'ETH' },
] as unknown as Asset[];

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
] as unknown as Currency[];

const EDITING = {
  id: 't1',
  portfolio: 'p1',
  portfolio_name: 'P',
  timestamp: '2026-02-01T00:00:00Z',
  description: 'Buy 0050',
  chain_id: '',
  tx_hash: '',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  transfers: [
    {
      id: 'tr1',
      pnl_change: '-1000',
      currency: 'TWD',
      currency_symbol: 'NT$',
      currency_amount: '-1000',
      asset: null,
      asset_name: null,
      asset_change_amount: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'tr2',
      pnl_change: null,
      currency: null,
      currency_symbol: null,
      currency_amount: null,
      asset: 'a1',
      asset_name: '0050.TW',
      asset_change_amount: '10',
      created_at: '',
      updated_at: '',
    },
  ],
} as unknown as Transaction;

function renderModal(overrides: Partial<Parameters<typeof TransactionFormModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <IntlProvider locale="en-US" messages={enUS}>
      <TransactionFormModal
        open
        editing={null}
        assets={ASSETS}
        currencies={CURRENCIES}
        baseCurrency="TWD"
        submitting={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
        {...overrides}
      />
    </IntlProvider>,
  );
  // The modal renders in a portal, so assertions on markup read document.body.
  return { onSubmit, onCancel, body: document.body };
}

describe('TransactionFormModal (FR-045)', () => {
  it('splits the form into General and Transfers tabs', () => {
    renderModal();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((el) => el.textContent)).toEqual(['General', 'Transfers']);
  });

  it('puts the primary action right and Cancel left-most (Principle VI)', () => {
    renderModal();
    const save = screen.getByRole('button', { name: 'Save' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const footer = save.parentElement!;
    // The two buttons share a space-between row, Cancel first in DOM order.
    expect(footer).toBe(cancel.parentElement);
    expect(getComputedStyle(footer).justifyContent).toBe('space-between');
    expect(Array.from(footer.children).indexOf(cancel)).toBeLessThan(
      Array.from(footer.children).indexOf(save),
    );
  });

  it('lays transfers out as a TABLE, not free-floating controls', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((el) => el.textContent);
    expect(headers).toEqual(['Kind', 'Asset / Currency', 'Change', 'PnL (TWD)', '']);
  });

  it('scrolls transfer rows inside the table rather than past the modal edge', () => {
    const { body } = renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));
    // AntD only emits the scroll wrapper when `scroll.x` is set — its absence
    // is exactly the overflow defect this rule exists to prevent.
    expect(body.querySelector('.ant-table-content, .ant-table-body')).not.toBeNull();
  });

  it('offers "Add transfer" as a link button, not a dashed block', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));
    const add = screen.getByRole('button', { name: /Add transfer/i });
    expect(add.className).toContain('ant-btn-link');
    expect(add.className).not.toContain('ant-btn-dashed');
  });

  it('adds and removes transfer rows', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + one seeded row

    fireEvent.click(screen.getByRole('button', { name: /Add transfer/i }));
    expect(screen.getAllByRole('row')).toHaveLength(3);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('seeds an edit from the transaction, mapping each leg to its kind', () => {
    renderModal({ editing: EDITING });
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    // First transfer is a cash leg, second a position leg (FR-037).
    expect(within(rows[0]!).getByText('Cash')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Position')).toBeInTheDocument();
  });

  it('never lets one row carry both a currency and an asset (FR-037)', async () => {
    const { onSubmit } = renderModal({ editing: EDITING });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    for (const tr of onSubmit.mock.calls[0]![0].transfers) {
      expect(Boolean(tr.currency) !== Boolean(tr.asset)).toBe(true);
    }
  });

  it('jumps to the Transfers tab when a transfer field fails validation', async () => {
    renderModal();
    // The seeded row has no asset selected, so Save must fail there — and the
    // user must be able to SEE the failing field.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Transfers' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });

  it('has no Remark field anywhere (FR-039)', () => {
    const { body } = renderModal({ editing: EDITING });
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));
    expect(body.textContent).not.toMatch(/remark/i);
  });
});
