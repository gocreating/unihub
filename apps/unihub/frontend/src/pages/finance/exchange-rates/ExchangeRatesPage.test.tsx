import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import enUS from '@/locales/en-US';
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
    fireEvent.click(screen.getByLabelText('Show views'));
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});
