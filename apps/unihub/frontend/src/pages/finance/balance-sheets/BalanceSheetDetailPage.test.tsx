import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { BalanceSheetDetailPage } from './detail';
import * as financeService from '@/services/unihub-backend/finance';

vi.mock('echarts-for-react', () => ({ default: () => null }));
vi.mock('@/services/unihub-backend/finance');

const SHEET_ID = 'sheet-detail-1';
const SHEET = { id: SHEET_ID, date: '2024-01-15T10:00:00Z', created_at: '2024-01-15T10:00:00Z', updated_at: '2024-01-15T10:00:00Z' };
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function renderPageWithSentinels() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const overridden = {
    ...enUS,
    'pages.finance.balanceSheets.detail.tab.assetVsDebt': 'SENTINEL_AL',
    'pages.finance.balanceSheets.detail.tab.assetsBreakdown': 'SENTINEL_ASSETS',
    'pages.finance.balanceSheets.detail.tab.debtsBreakdown': 'SENTINEL_DEBTS',
    'pages.finance.balanceSheets.detail.tab.statistics': 'SENTINEL_STATS',
  };
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={overridden}>
        <MemoryRouter initialEntries={[`/finance/balance-sheets/${SHEET_ID}`]}>
          <Routes>
            <Route path="/finance/balance-sheets/:id" element={<BalanceSheetDetailPage />} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('BalanceSheetDetailPage — chart card tab labels (US4)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listBalanceSheets).mockResolvedValue({
      count: 1, next: null, previous: null, results: [SHEET],
    });
    vi.mocked(financeService.listBalances).mockResolvedValue([]);
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listExchangeRates).mockResolvedValue(EMPTY_PAGE as never);
  });

  it('chart card tab labels come from the i18n layer (not hardcoded)', async () => {
    renderPageWithSentinels();
    // Before the fix: tabs show 'A/L', 'Assets Breakdown', 'Debts Breakdown', 'Statistics'
    // (hardcoded) → sentinel values NOT found → test fails.
    // After the fix: tabs show the sentinel values → test passes.
    const tabs = await screen.findAllByRole('tab');
    const labels = tabs.map((el) => el.textContent?.trim());
    expect(labels).toContain('SENTINEL_AL');
    expect(labels).toContain('SENTINEL_ASSETS');
    expect(labels).toContain('SENTINEL_DEBTS');
    expect(labels).toContain('SENTINEL_STATS');
  });
});
