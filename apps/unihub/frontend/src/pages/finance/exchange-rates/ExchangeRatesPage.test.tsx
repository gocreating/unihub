import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import enUS from '@/locales/en-US';
import { DEFAULT_PAGE_SIZE } from '@/components/EntityToolbar';
import { ExchangeRatesPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';
import * as coreService from '@/services/unihub-backend/core';

dayjs.extend(relativeTime);

vi.mock('@/services/unihub-backend/finance');
vi.mock('@/services/unihub-backend/core');

const RATE = {
  id: 'rate-1',
  base_currency: 'USD',
  quote_currency: 'TWD',
  rate: '32.500000',
  date: '2024-01-15T10:30:00Z',
};
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <ExchangeRatesPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('ExchangeRatesPage — entity views (016)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(financeService.listExchangeRates).mockResolvedValue({
      count: 1, next: null, previous: null, results: [RATE],
    });
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  it('reveals the view row with the default Table tab active', async () => {
    renderPage();
    // Wait for the exchange-rate row to appear.
    await screen.findByText('USD');
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});

// 016 round 12 (FR-039/SC-021): every entity table follows the same pattern —
// the page seeds no filter or sorting, and the account's stored default view is
// what actually applies on arrival, with nothing reported as unsaved.
describe('ExchangeRatesPage — the shared view pattern (round 12)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  const STORED_DEFAULT = {
    id: 'dflt00000001',
    table_key: 'finance-exchange-rates',
    name: 'Mine',
    config: { filters: [], sort: [], columns: [], pageSize: 100 },
    pinned: true,
    position: 0,
    is_default: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };

  it('seeds no filter and no sorting of its own', async () => {
    renderPage();
    await screen.findByText('USD');
    const call = vi.mocked(financeService.listExchangeRates).mock.calls.at(-1)![0]!;
    expect(call.filters).toBeUndefined();
    expect(call.ordering).toBeFalsy();
    expect(call.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('applies the stored default view on arrival, with no unsaved indicator', async () => {
    vi.mocked(coreService.listEntityViews).mockResolvedValue([STORED_DEFAULT]);
    renderPage();
    await screen.findByText('USD');

    await waitFor(() => {
      const call = vi.mocked(financeService.listExchangeRates).mock.calls.at(-1)![0]!;
      expect(call.limit).toBe(100);
    });
    // The row is always shown (round 13), so the dot is always the labelled one.
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
  });
});
