import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { AccountsPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';

vi.mock('@/services/unihub-backend/finance');

const ACCOUNT_WITH_DATETIME = {
  id: 'acc-dt',
  name: 'Savings',
  currency: 'USD',
  color: '',
  open_datetime: '2024-01-15T10:30:00Z',
  close_datetime: null,
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-15T10:30:00Z',
};
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <AccountsPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('AccountsPage — datetime tooltip suppression (US6)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listAccounts).mockResolvedValue({
      count: 1, next: null, previous: null, results: [ACCOUNT_WITH_DATETIME],
    });
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listExchangeRates).mockResolvedValue(EMPTY_PAGE as never);
  });

  it('open_datetime cell shows the formatted date without a Tooltip wrapper', async () => {
    const { container } = renderPage();
    // Wait for the account row to appear
    await screen.findByText('Savings');
    // The formatted date string should appear directly in the DOM
    const cells = container.querySelectorAll('td');
    const datetimeCellTexts = [...cells].map((td) => td.textContent ?? '');
    const hasFormattedDate = datetimeCellTexts.some((text) => text.includes('2024-01-15'));
    expect(hasFormattedDate).toBe(true);
    // Before the fix: an AntD Tooltip wraps the cell content.
    // The Tooltip renders a title attr or aria-describedby on hover; at rest,
    // the inner span has the title as a data attribute. We verify the tooltip
    // title (which was 'YYYY-MM-DD HH:mm:ss') is NOT present as a title attribute
    // on any element inside the table, since the Tooltip has been removed.
    const elementsWithTitle = container.querySelectorAll('td [title]');
    const titleValues = [...elementsWithTitle].map((el) => el.getAttribute('title') ?? '');
    // None of the title attributes should contain a seconds-level datetime
    const hasRedundantTooltip = titleValues.some((t) => /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(t));
    expect(hasRedundantTooltip).toBe(false);
  });
});
