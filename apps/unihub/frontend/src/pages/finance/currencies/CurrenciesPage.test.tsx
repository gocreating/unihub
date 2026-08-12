import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { DEFAULT_PAGE_SIZE } from '@/components/EntityToolbar';
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

  // 016 round 2: the view row auto-hides with only the default view; the
  // reveal affordance shows the default "Table" tab active.
  it('reveals the entity-views row with the default Table tab active', async () => {
    renderPage();
    await screen.findByText('New Taiwan Dollar');
    fireEvent.click(screen.getByLabelText('Show views'));
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });
});

// 016 round 12 (FR-039/SC-021): every entity table follows the same pattern —
// the page seeds no filter or sorting, and the account's stored default view is
// what actually applies on arrival, with nothing reported as unsaved.
describe('CurrenciesPage — the shared view pattern (round 12)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  const STORED_DEFAULT = {
    id: 'dflt00000001',
    table_key: 'finance-currencies',
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
    await screen.findByText('New Taiwan Dollar');
    const call = vi.mocked(financeService.listCurrencies).mock.calls.at(-1)![0]!;
    expect(call.filters).toBeUndefined();
    expect(call.ordering).toBeFalsy();
    expect(call.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('applies the stored default view on arrival, with no unsaved indicator', async () => {
    vi.mocked(coreService.listEntityViews).mockResolvedValue([STORED_DEFAULT]);
    renderPage();
    await screen.findByText('New Taiwan Dollar');

    await waitFor(() => {
      const call = vi.mocked(financeService.listCurrencies).mock.calls.at(-1)![0]!;
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
