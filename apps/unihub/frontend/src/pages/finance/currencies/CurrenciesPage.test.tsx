import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    // The row is always shown (round 13), so the dot is always the labelled one.
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
  });
});

// Quick search (019): typing issues a debounced request carrying `search`;
// clearing removes the param entirely (never `search: ''`).
describe('CurrenciesPage — quick search (019)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(financeService.listCurrencies).mockResolvedValue({
      count: 1, next: null, previous: null, results: [CURRENCY],
    });
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  it('typing then pausing calls the service with the search param', async () => {
    renderPage();
    await screen.findByText('New Taiwan Dollar');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'taiwan' } });
    await waitFor(() => {
      const call = vi.mocked(financeService.listCurrencies).mock.calls.at(-1)![0]!;
      expect(call.search).toBe('taiwan');
    });
  });

  it('clearing the search removes the param from the request', async () => {
    renderPage();
    await screen.findByText('New Taiwan Dollar');
    const input = screen.getByPlaceholderText('Search');
    fireEvent.change(input, { target: { value: 'taiwan' } });
    await waitFor(() => {
      expect(vi.mocked(financeService.listCurrencies).mock.calls.at(-1)![0]!.search).toBe(
        'taiwan',
      );
    });
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      const call = vi.mocked(financeService.listCurrencies).mock.calls.at(-1)![0]!;
      expect('search' in call).toBe(false);
    });
  });
});

// Quick search (019 US3): matched fragments in visible columns render as
// <mark>; cells not containing the query carry none.
describe('CurrenciesPage — search highlighting (019)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(financeService.listCurrencies).mockResolvedValue({
      count: 1, next: null, previous: null, results: [CURRENCY],
    });
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  it('highlights the matched fragment in visible cells only', async () => {
    const { container } = renderPage();
    await screen.findByText('New Taiwan Dollar');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'taiwan' } });
    await waitFor(() => {
      const marks = Array.from(container.querySelectorAll('.ant-table-tbody mark'));
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) expect(mark.textContent?.toLowerCase()).toBe('taiwan');
    });
    // The non-matching Code cell carries no mark.
    const codeCell = screen.getByText('TWD');
    expect(codeCell.querySelector?.('mark') ?? null).toBeNull();
  });

  it('clearing the query removes all marks', async () => {
    const { container } = renderPage();
    await screen.findByText('New Taiwan Dollar');
    const input = screen.getByPlaceholderText('Search');
    fireEvent.change(input, { target: { value: 'taiwan' } });
    await waitFor(() => {
      expect(container.querySelectorAll('.ant-table-tbody mark').length).toBeGreaterThan(0);
    });
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      expect(container.querySelectorAll('.ant-table-tbody mark')).toHaveLength(0);
    });
  });
});

// Quick search (019 US4/FR-009): a lookup for a superseded query resolving
// AFTER the newer one must never overwrite the latest results — React Query
// key isolation is the guard.
describe('CurrenciesPage — stale search responses (019)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
  });

  it('out-of-order responses never overwrite the latest query results', async () => {
    const stale = {
      count: 1, next: null, previous: null,
      results: [{ code: 'OLD', name: 'Stale Result', symbol: 'o', is_base_currency: false }],
    };
    const fresh = {
      count: 1, next: null, previous: null,
      results: [{ code: 'NEW', name: 'Fresh Result', symbol: 'n', is_base_currency: false }],
    };
    let resolveStale: ((v: typeof stale) => void) | undefined;
    vi.mocked(financeService.listCurrencies).mockImplementation((params) => {
      if (params?.search === 'a')
        return new Promise((res) => {
          resolveStale = res;
        });
      if (params?.search === 'ab') return Promise.resolve(fresh);
      return Promise.resolve({ count: 1, next: null, previous: null, results: [CURRENCY] });
    });

    renderPage();
    await screen.findByText('New Taiwan Dollar');
    const input = screen.getByPlaceholderText('Search');

    fireEvent.change(input, { target: { value: 'a' } });
    // Wait until the (never-resolving) "a" lookup is actually issued.
    await waitFor(() => {
      expect(
        vi.mocked(financeService.listCurrencies).mock.calls.some(([p]) => p?.search === 'a'),
      ).toBe(true);
    });

    fireEvent.change(input, { target: { value: 'ab' } });
    await screen.findByText('Fresh Result');

    // The stale "a" response arrives LAST — the table must keep "ab" results.
    act(() => {
      resolveStale?.(stale);
    });
    await waitFor(() => {
      expect(screen.queryByText('Stale Result')).toBeNull();
    });
    expect(screen.getByText('Fresh Result')).toBeInTheDocument();
  });
});
