import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { DEFAULT_PAGE_SIZE } from '@/components/EntityToolbar';
import { AccountsPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';
import * as coreService from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/finance');
vi.mock('@/services/unihub-backend/core');

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

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(financeService.listAccounts).mockResolvedValue({
    count: 1, next: null, previous: null, results: [ACCOUNT_WITH_DATETIME],
  });
  vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
  vi.mocked(financeService.listExchangeRates).mockResolvedValue(EMPTY_PAGE as never);
  vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
});

describe('AccountsPage — datetime tooltip suppression (US6)', () => {

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

describe('AccountsPage — entity views (016)', () => {
  // 016 round 2: the row auto-hides with only the default view; reveal shows
  // the default "Table" tab active.
  it('reveals the view row with the default Table tab active', async () => {
    renderPage();
    await screen.findByText('Savings');
    fireEvent.click(screen.getByLabelText('Show views'));
    const defaultTab = screen.getByRole('tab', { name: /table/i });
    expect(defaultTab).toHaveAttribute('aria-selected', 'true');
  });
});

// 016 round 12 (FR-039/SC-021): every entity table follows the same pattern —
// the page seeds no filter or sorting, and the account's stored default view is
// what actually applies on arrival, with nothing reported as unsaved.
describe('AccountsPage — the shared view pattern (round 12)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  const STORED_DEFAULT = {
    id: 'dflt00000001',
    table_key: 'finance-accounts',
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
    await screen.findByText('Savings');
    const call = vi.mocked(financeService.listAccounts).mock.calls.at(-1)![0]!;
    expect(call.filters).toBeUndefined();
    expect(call.ordering).toBeFalsy();
    expect(call.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('applies the stored default view on arrival, with no unsaved indicator', async () => {
    vi.mocked(coreService.listEntityViews).mockResolvedValue([STORED_DEFAULT]);
    renderPage();
    await screen.findByText('Savings');

    await waitFor(() => {
      const call = vi.mocked(financeService.listAccounts).mock.calls.at(-1)![0]!;
      expect(call.limit).toBe(100);
    });
    const reveal = screen.queryByLabelText('Show views');
    if (reveal) fireEvent.click(reveal);
    // Expanded row: the dot carries an aria-label. Collapsed row: it is the
    // reveal affordance's badge. Neither may be present.
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
    expect(document.querySelector('.ant-badge-dot')).toBeNull();
  });
});
