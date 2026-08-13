import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { DEFAULT_PAGE_SIZE } from '@/components/EntityToolbar';
import { PortfoliosPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';
import * as coreService from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/finance');
vi.mock('@/services/unihub-backend/core');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const PORTFOLIO = {
  id: 'p1',
  name: 'Tech Fund',
  base_currency: 'USD',
  description: 'monthly DCA plan',
  state: 'active' as const,
  first_transaction_time: '2026-01-05T09:00:00Z',
  last_transaction_time: '2026-07-01T09:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-07-01T09:00:00Z',
};
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter initialEntries={['/finance/portfolios']}>
          <PortfoliosPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
  mockNavigate.mockReset();
  vi.mocked(financeService.listPortfolios).mockResolvedValue({
    count: 1, next: null, previous: null, results: [PORTFOLIO],
  } as never);
  vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
  vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
});

describe('PortfoliosPage — hyperlinked rows, no row edit/delete (iteration 2, US2)', () => {
  // FR-013a: the Name cell is a real anchor to the detail page
  it('renders the Name cell as a real hyperlink to the portfolio detail page', async () => {
    renderPage();
    const nameLink = await screen.findByRole('link', { name: 'Tech Fund' });
    expect(nameLink.getAttribute('href')).toBe('/finance/portfolios/p1');
  });

  // FR-013b: the View action is a real anchor with the same href
  it('renders the View action as a real hyperlink to the detail page', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    const viewLink = screen.getByRole('link', { name: /View/ });
    expect(viewLink.getAttribute('href')).toBe('/finance/portfolios/p1');
  });

  // FR-013c: plain click SPA-navigates; ctrl/meta-click leaves navigation to the browser
  it('SPA-navigates on plain click but not on ctrl/meta click (browser handles those)', async () => {
    renderPage();
    const nameLink = await screen.findByRole('link', { name: 'Tech Fund' });

    fireEvent.click(nameLink);
    expect(mockNavigate).toHaveBeenCalledWith('/finance/portfolios/p1');

    mockNavigate.mockReset();
    fireEvent.click(nameLink, { ctrlKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(nameLink, { metaKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // FR-013d: no row-level Edit or Delete actions remain in the list
  it('exposes no Edit or Delete buttons in the table rows', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  // Close/Reopen is a non-navigating action and stays a button; Create stays intact
  it('keeps the Close/Reopen toggle button and the New Portfolio action', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    expect(screen.getByRole('button', { name: /Close/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /New Portfolio/ })).toBeTruthy();
  });
});

// FR-008e (iteration 3): portfolios carry an optional description.
describe('PortfoliosPage — description field (iteration 3)', () => {
  it('shows the description column with the portfolio description', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    expect(screen.getByText('monthly DCA plan')).toBeInTheDocument();
  });

  it('create form offers a description field', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    fireEvent.click(screen.getByRole('button', { name: /New Portfolio/ }));
    await screen.findByLabelText('Name');
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });
});

// 016 FR-039/SC-021: the shared view pattern.
describe('PortfoliosPage — the shared view pattern', () => {
  const STORED_DEFAULT = {
    id: 'dflt00000002',
    table_key: 'finance-portfolios',
    name: 'Mine',
    config: { filters: [], sort: [], columns: [], pageSize: 100 },
    pinned: true,
    position: 0,
    is_default: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };

  it('shows the default Table view tab', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('seeds no filter and no sorting of its own', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    const call = vi.mocked(financeService.listPortfolios).mock.calls.at(-1)![0]!;
    expect(call.filters).toBeUndefined();
    expect(call.ordering).toBeFalsy();
    expect(call.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('applies the stored default view on arrival, with no unsaved indicator', async () => {
    vi.mocked(coreService.listEntityViews).mockResolvedValue([STORED_DEFAULT]);
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    await waitFor(() => {
      const call = vi.mocked(financeService.listPortfolios).mock.calls.at(-1)![0]!;
      expect(call.limit).toBe(100);
    });
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
  });
});

// Quick search (019).
describe('PortfoliosPage — quick search', () => {
  it('typing then pausing calls the service with the search param', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'tech' } });
    await waitFor(() => {
      const call = vi.mocked(financeService.listPortfolios).mock.calls.at(-1)![0]!;
      expect(call.search).toBe('tech');
    });
  });

  it('highlights the matched fragment in visible cells', async () => {
    const { container } = renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'tech' } });
    await waitFor(() => {
      const marks = Array.from(container.querySelectorAll('.ant-table-tbody mark'));
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) expect(mark.textContent?.toLowerCase()).toBe('tech');
    });
  });
});
