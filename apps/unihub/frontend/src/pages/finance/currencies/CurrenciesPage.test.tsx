import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { CurrenciesPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';
import * as coreService from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/finance');
vi.mock('@/services/unihub-backend/core');

const CURRENCY = {
  code: 'TWD',
  name: 'New Taiwan Dollar',
  symbol: 'NT$',
  is_base_currency: true,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <CurrenciesPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('CurrenciesPage — entity views (016)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(financeService.listCurrencies).mockResolvedValue({
      count: 1, next: null, previous: null, results: [CURRENCY],
    });
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  // 016 US1: the view row renders above the toolbar with the pinned Tabular tab.
  it('renders the entity-views row with the default Tabular tab active', async () => {
    renderPage();
    await screen.findByText('New Taiwan Dollar');
    const tab = screen.getByRole('tab', { name: /tabular/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });
});
