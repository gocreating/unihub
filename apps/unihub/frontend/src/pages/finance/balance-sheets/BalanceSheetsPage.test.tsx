import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { BalanceSheetsPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';

vi.mock('echarts-for-react', () => ({ default: () => null }));
vi.mock('@/services/unihub-backend/finance');

const SHEET_ID = 'sheet-abc';
const SHEET = { id: SHEET_ID, date: '2024-01-15T10:00:00Z', created_at: '2024-01-15T10:00:00Z', updated_at: '2024-01-15T10:00:00Z' };
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };
const ONE_PAGE = { count: 1, next: null, previous: null, results: [SHEET] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <BalanceSheetsPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('BalanceSheetsPage — action column hyperlinks (US1)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listBalanceSheets).mockResolvedValue(ONE_PAGE);
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listExchangeRates).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listBalances).mockResolvedValue([]);
  });

  it('View button renders as an anchor with href pointing to the detail page', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /view/i });
    expect(link).toHaveAttribute('href', `/finance/balance-sheets/${SHEET_ID}`);
  });

  it('Edit button renders as an anchor with href pointing to the edit page', async () => {
    renderPage();
    const links = await screen.findAllByRole('link', { name: /edit/i });
    const editActionLink = links.find((el) => el.getAttribute('href') === `/finance/balance-sheets/${SHEET_ID}/edit`);
    expect(editActionLink).toBeDefined();
  });

  it('Delete button is a plain button with no href', async () => {
    renderPage();
    const deleteBtn = await screen.findByRole('button', { name: /delete/i });
    expect(deleteBtn).not.toHaveAttribute('href');
  });
});

function renderPageWithSentinels() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const overridden = {
    ...enUS,
    'pages.finance.balanceSheets.tab.equityCurve': 'SENTINEL_EQUITY',
    'pages.finance.balanceSheets.tab.accountTrend': 'SENTINEL_ACCOUNT',
  };
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={overridden}>
        <MemoryRouter>
          <BalanceSheetsPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('BalanceSheetsPage — chart card tab labels (US4)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listBalanceSheets).mockResolvedValue(EMPTY_PAGE);
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listExchangeRates).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listBalances).mockResolvedValue([]);
  });

  it('chart card tab labels come from the i18n layer (not hardcoded)', async () => {
    renderPageWithSentinels();
    // The chart card tabs should show the overridden sentinel values,
    // proving the labels are sourced from the i18n messages rather than hardcoded.
    // Before the fix: tabs show 'Equity Curve' and 'Account Trend' → test fails.
    // After the fix: tabs show 'SENTINEL_EQUITY' and 'SENTINEL_ACCOUNT' → test passes.
    const tabs = await screen.findAllByRole('tab');
    const labels = tabs.map((el) => el.textContent?.trim());
    expect(labels).toContain('SENTINEL_EQUITY');
    expect(labels).toContain('SENTINEL_ACCOUNT');
  });
});
