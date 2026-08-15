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

/** The description column ships hidden (FR-027) — turn it on via the toolbar. */
async function revealDescription() {
  fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
  const toggle = await screen.findByRole('checkbox', { name: /Description/ });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
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

  // (The iteration-2 "View action is a hyperlink" test is gone: constitution
  // v1.25.0 removes the View action entirely — see the iteration-4 block below.)

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

  it('keeps the New Portfolio action', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    expect(screen.getByRole('button', { name: /New Portfolio/ })).toBeTruthy();
  });
});

// Constitution v1.25.0 / FR-013, FR-018, FR-020: the row IS the link, the View
// button is gone, Close/Reopen moved to the detail panel — which leaves the
// list with no row actions at all, so the Actions column itself disappears.
describe('PortfoliosPage — whole-row navigation (iteration 4)', () => {
  it('renders no View button and no Actions column', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    // Exact-match: the entity-views kebab is legitimately named "View menu".
    expect(screen.queryByRole('button', { name: /^View$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^View$/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('no longer offers Close/Reopen in the list', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    expect(screen.queryByRole('button', { name: /^Close$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reopen$/ })).toBeNull();
  });

  it('navigates when the row is clicked', async () => {
    renderPage();
    const nameLink = await screen.findByRole('link', { name: 'Tech Fund' });
    const row = nameLink.closest('tr')!;
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/finance/portfolios/p1');
  });

  it('opens a new tab on ctrl-click of the row instead of navigating', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    const nameLink = await screen.findByRole('link', { name: 'Tech Fund' });
    const row = nameLink.closest('tr')!;
    mockNavigate.mockReset();
    fireEvent.click(row, { ctrlKey: true });
    expect(openSpy).toHaveBeenCalledWith(
      '/finance/portfolios/p1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('marks rows as clickable', async () => {
    renderPage();
    const nameLink = await screen.findByRole('link', { name: 'Tech Fund' });
    expect(nameLink.closest('tr')!.style.cursor).toBe('pointer');
  });
});

// FR-008e (iteration 3): portfolios carry an optional description.
describe('PortfoliosPage — description field (iteration 3)', () => {
  // FR-027: present but hidden by default; the user reveals it.
  it('hides the description column by default', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    expect(screen.queryByText('monthly DCA plan')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Description/ })).toBeNull();
  });

  it('shows the description once revealed through the Columns control', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    await revealDescription();
    expect(await screen.findByText('monthly DCA plan')).toBeInTheDocument();
  });

  it('create form offers a description field', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    fireEvent.click(screen.getByRole('button', { name: /New Portfolio/ }));
    await screen.findByLabelText('Name');
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });
});

// FR-023/FR-024 (constitution v1.26.0): PageTable sizes the column and the
// cell clamps. The reported bug was a 280px cap with untruncated text, which
// produced three-line rows whose content still overflowed to 356px.
describe('PortfoliosPage — description column sizing (iteration 5)', () => {
  const LONG = 'Roll PT-USD0++-27FEB2025 to PT-USD0++-26JUN2025 and then onwards';

  beforeEach(() => {
    vi.mocked(financeService.listPortfolios).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ ...PORTFOLIO, description: LONG }],
    } as never);
  });

  it('clamps the description cell to two lines instead of letting it wrap', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    await revealDescription();
    const cell = await screen.findByText(LONG);
    expect(cell.style.webkitLineClamp).toBe('2');
    expect(cell).toHaveStyle({ overflow: 'hidden' });
  });

  it('caps the description column at its declared max width', async () => {
    const { container } = renderPage();
    await screen.findByRole('link', { name: 'Tech Fund' });
    await revealDescription();
    const headers = [...container.querySelectorAll('.ant-table-thead th')];
    const idx = headers.findIndex((h) => h.textContent?.trim().startsWith('Description'));
    expect(idx).toBeGreaterThanOrEqual(0);
    // AntD carries resolved widths on <colgroup><col>, not on the th.
    const col = container.querySelectorAll('colgroup col')[idx] as HTMLElement;
    // PageTable resolved this from autoWidth (max 280) — the page never measured.
    expect(col.style.width).toBe('280px');
  });

  it('the page performs no width measurement of its own', async () => {
    // Guard for SC-010: the module must not import the measuring helpers.
    const src = await import('./index?raw').catch(() => null);
    if (src) expect(String((src as { default?: string }).default ?? '')).not.toContain('measureTextWidth');
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
