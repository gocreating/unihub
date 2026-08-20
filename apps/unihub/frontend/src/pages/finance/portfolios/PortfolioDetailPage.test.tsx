import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Modal, message } from 'antd';
import enUS from '@/locales/en-US';
import { PortfolioDetailPage } from './detail';
import * as financeService from '@/services/unihub-backend/finance';
import { ResizeObserverMock } from '@/test-setup';

vi.mock('@/services/unihub-backend/finance');

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
  value_invested: '-474391',
  value_returned: null,
  net_value_change: '-474391',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-07-01T09:00:00Z',
};
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

const TXN = {
  id: 'tx1',
  portfolio: 'p1',
  portfolio_name: 'Tech Fund',
  timestamp: '2026-06-01T00:00:00Z',
  description: 'DCA buy',
  chain_id: '',
  tx_hash: '',
  transfers: [
    {
      id: 'tr1',
      pnl_change: null,
      currency: null,
      currency_symbol: null,
      currency_amount: null,
      asset: 'a1',
      asset_name: '00918.TW',
      asset_change_amount: '419.000000000000000000',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
    {
      id: 'tr2',
      pnl_change: '-1.000000000000000000',
      currency: 'TWD',
      currency_symbol: 'NT$',
      currency_amount: '-1.000000000000000000',
      asset: null,
      asset_name: null,
      asset_change_amount: null,
      created_at: '2026-06-01T00:00:01Z',
      updated_at: '2026-06-01T00:00:01Z',
    },
  ],
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter initialEntries={['/finance/portfolios/p1']}>
          <Routes>
            <Route path="/finance/portfolios/:id" element={<PortfolioDetailPage />} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

async function confirmSharedDialogOk() {
  const footer = await screen.findByTestId('confirm-dialog-footer');
  expect(document.querySelector('.ant-modal-confirm')).toBeNull();
  const ok = footer.querySelector('.ant-btn-primary') as HTMLElement;
  expect(ok).toBeTruthy();
  fireEvent.click(ok);
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
  mockNavigate.mockReset();
  Modal.destroyAll();
  message.destroy();
  vi.mocked(financeService.getPortfolio).mockResolvedValue(PORTFOLIO as never);
  vi.mocked(financeService.listTransactions).mockResolvedValue(EMPTY_PAGE as never);
  vi.mocked(financeService.listAssets).mockResolvedValue(EMPTY_PAGE as never);
  vi.mocked(financeService.deletePortfolio).mockResolvedValue(undefined as never);
  vi.mocked(financeService.updatePortfolio).mockResolvedValue(PORTFOLIO as never);
  vi.mocked(financeService.deleteTransaction).mockResolvedValue(undefined as never);
  vi.mocked(financeService.getPortfolioHoldings).mockResolvedValue([
    { asset_id: 'a1', asset_name: '00918.TW', quantity: '2145' },
  ] as never);
});

describe('PortfolioDetailPage — breadcrumb + Portfolio panel (iteration 2, US2)', () => {
  // FR-014a: breadcrumb Portfolios → name, Portfolios crumb is a real link
  it('renders a breadcrumb Portfolios → portfolio name with a real Portfolios link', async () => {
    renderPage();
    const crumb = await screen.findByRole('link', { name: 'Portfolios' });
    expect(crumb.getAttribute('href')).toBe('/finance/portfolios');
    fireEvent.click(crumb);
    expect(mockNavigate).toHaveBeenCalledWith('/finance/portfolios');
    expect((await screen.findAllByText('Tech Fund')).length).toBeGreaterThan(0);
  });

  // FR-014b: the ad-hoc arrow back-link is gone
  it('renders no ArrowLeft back button', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Tech Fund');
    expect(container.querySelector('.anticon-arrow-left')).toBeNull();
  });

  // FR-014c: a Card titled "Portfolio" holds the entity fields
  it('shows a "Portfolio" panel with name, base currency tag, state, and transaction times', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    expect(screen.getByText('Portfolio')).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('First Transaction')).toBeTruthy();
    expect(screen.getByText('Last Transaction')).toBeTruthy();
  });

  // FR-008e (iteration 3): the panel shows the portfolio description
  it('shows the portfolio description on the panel', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    expect(screen.getByText('monthly DCA plan')).toBeTruthy();
  });

  // FR-014d: panel header carries visible Edit and a kebab holding Delete
  it('shows a visible Edit button and a kebab menu containing Delete in the panel header', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    expect(screen.getByRole('button', { name: /Edit/ })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('portfolio-actions'));
    expect(await screen.findByText('Delete')).toBeTruthy();
  });

  // FR-014e: Edit opens the portfolio form modal prefilled (staged — no API call before Save)
  // FR-036: state is owned by Close/Reopen and base currency is immutable.
  it('edit modal offers no State select and no Base Currency input', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }));
    await screen.findByText('Edit Portfolio');
    expect(screen.queryByLabelText('State')).toBeNull();
    expect(screen.queryByLabelText('Base Currency')).toBeNull();
    // Still shown read-only for context.
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0);
  });

  it('opens the edit modal prefilled with the portfolio name on Edit click', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(await screen.findByText('Edit Portfolio')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Tech Fund')).toBeTruthy();
    });
    // The edit form also carries the description (iteration 3)
    expect(screen.getByDisplayValue('monthly DCA plan')).toBeTruthy();
    expect(financeService.updatePortfolio).not.toHaveBeenCalled();
  });

  // FR-015 + FR-017: kebab → Delete → shared confirm dialog → delete + navigate
  it('deletes via kebab → shared confirm dialog and navigates back to the Portfolios list', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.click(screen.getByLabelText('portfolio-actions'));
    fireEvent.click(await screen.findByText('Delete'));
    expect((await screen.findAllByText('Delete Portfolio')).length).toBeGreaterThan(0);
    await confirmSharedDialogOk();
    await waitFor(() => {
      expect(vi.mocked(financeService.deletePortfolio).mock.calls.at(-1)![0]).toBe('p1');
      expect(mockNavigate).toHaveBeenCalledWith('/finance/portfolios');
    });
  });

  // FR-015 / FR-010: blocked delete shows the protected error and stays on the page
  it('shows the dependency error and does not navigate when delete is blocked (409)', async () => {
    const err = Object.assign(new Error('protected'), { status: 409 });
    vi.mocked(financeService.deletePortfolio).mockRejectedValue(err as never);
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.click(screen.getByLabelText('portfolio-actions'));
    fireEvent.click(await screen.findByText('Delete'));
    expect((await screen.findAllByText('Delete Portfolio')).length).toBeGreaterThan(0);
    await confirmSharedDialogOk();
    expect(
      await screen.findByText('This portfolio has associated transactions and cannot be deleted.'),
    ).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith('/finance/portfolios');
  });
});

// Iteration 4 (FR-020, FR-021): the panel is a responsive Descriptions block
// and Close/Reopen is a visible header action beside Edit.
describe('PortfolioDetailPage — Descriptions panel + Close/Reopen (iteration 4)', () => {
  it('presents every field inside an AntD Descriptions block', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Tech Fund');
    const desc = container.querySelector('.ant-descriptions');
    expect(desc).toBeTruthy();
    const labels = Array.from(desc!.querySelectorAll('.ant-descriptions-item-label')).map(
      (el) => el.textContent?.trim(),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        'Name',
        'Base Currency',
        'State',
        'Description',
        'First Transaction',
        'Last Transaction',
      ]),
    );
    // The name lives in the Descriptions block, not in a separate panel title
    // (the page-level PageTable heading below is a different element).
    expect(desc!.closest('.ant-card-body')!.querySelector('h4')).toBeNull();
  });

  // NOTE: AntD icons contribute their own aria-label to the accessible name
  // ("stop Close"), so these matchers are suffix-anchored, not exact.
  it('shows Close as a visible header button that flips the state', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    const closeBtn = screen.getByRole('button', { name: /Close$/ });
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(vi.mocked(financeService.updatePortfolio).mock.calls.at(-1)![1]).toEqual({
        state: 'closed',
      });
    });
  });

  it('shows Reopen instead when the portfolio is closed', async () => {
    vi.mocked(financeService.getPortfolio).mockResolvedValue({
      ...PORTFOLIO,
      state: 'closed',
    } as never);
    renderPage();
    await screen.findAllByText('Tech Fund');
    expect(screen.getByRole('button', { name: /Reopen$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Close$/ })).toBeNull();
  });

  // FR-021 / constitution VI: narrowness is judged by MEASURED CONTENT width,
  // not the viewport — a collapsed-sidebar-narrow panel must stack too, which
  // AntD's own xs/sm breakpoints (viewport-based) would miss.
  it('collapses the Descriptions to one column when the panel itself is narrow', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Tech Fund');
    const panel = container.querySelector('.ant-descriptions')!.closest('div[class]')!
      .parentElement!;
    const observed = ResizeObserverMock.instances.find((i) => i.targets.length > 0);
    expect(observed).toBeTruthy();
    const target = observed!.targets[0]!;

    const rowsAtWidth = async (width: number) => {
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
        width, height: 200, top: 0, left: 0, right: width, bottom: 200, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      await act(async () => {
        observed!.trigger();
      });
      // Scope to the Portfolio panel — the Value panel has its own Descriptions.
      return container.querySelectorAll('.ant-descriptions')[0]!.querySelectorAll('.ant-descriptions-row').length;
    };

    expect(panel).toBeTruthy();
    // 6 items: 3 columns → 2 rows; 1 column → 6 rows.
    expect(await rowsAtWidth(1200)).toBe(2);
    expect(await rowsAtWidth(400)).toBe(6);
  });

  it('keeps Delete in the kebab, not as a visible button', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
    fireEvent.click(screen.getByLabelText('portfolio-actions'));
    expect(await screen.findByText('Delete')).toBeTruthy();
  });
});

// Iteration 3 (US3): chain/tx metadata, transfer remarks, 18dp amounts.
describe('PortfolioDetailPage — transaction & transfer fields (iteration 3)', () => {
  it('deletes a transaction through the shared confirm dialog', async () => {
    vi.mocked(financeService.listTransactions).mockResolvedValue({
      count: 1, next: null, previous: null, results: [TXN],
    } as never);
    renderPage();
    await screen.findByText('DCA buy');
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await screen.findByText('Delete Transaction');
    await confirmSharedDialogOk();
    await waitFor(() => {
      expect(vi.mocked(financeService.deleteTransaction).mock.calls.at(-1)![0]).toBe('tx1');
    });
  });
});

// FR-026 / FR-028 (iteration 5): a closed portfolio disables its controls, and
// the footer reports both counts.
describe('PortfolioDetailPage — closed freeze + footer counts (iteration 5)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listTransactions).mockResolvedValue({
      count: 1, next: null, previous: null, results: [TXN],
    } as never);
  });

  it('disables the transaction controls while the portfolio is closed', async () => {
    vi.mocked(financeService.getPortfolio).mockResolvedValue({
      ...PORTFOLIO, state: 'closed',
    } as never);
    renderPage();
    await screen.findByText('DCA buy');
    expect(screen.getByRole('button', { name: /New Transaction/ })).toBeDisabled();
    // Both the panel Edit and the row Edit must be frozen.
    for (const btn of screen.getAllByRole('button', { name: /Edit$/ })) {
      expect(btn).toBeDisabled();
    }
    for (const btn of screen.getAllByRole('button', { name: /Delete$/ })) {
      expect(btn).toBeDisabled();
    }
    // Reopen is the one action that must stay live.
    expect(screen.getByRole('button', { name: /Reopen$/ })).not.toBeDisabled();
  });

  it('leaves the controls enabled while the portfolio is active', async () => {
    renderPage();
    await screen.findByText('DCA buy');
    expect(screen.getByRole('button', { name: /New Transaction/ })).not.toBeDisabled();
    for (const btn of screen.getAllByRole('button', { name: /Delete$/ })) {
      expect(btn).not.toBeDisabled();
    }
  });

  it('reports transaction AND transfer counts in the footer', async () => {
    renderPage();
    await screen.findByText('DCA buy');
    // TXN carries 2 transfers.
    expect(await screen.findByText(/1 transaction, 2 transfers/)).toBeInTheDocument();
  });
});

// FR-032 / SC-016: vocabulary is the requirement. An OPEN portfolio must not
// present a cash-flow figure as PnL — -474,391 TWD is 49 buys with no sales.
describe('PortfolioDetailPage — PnL panel (iteration 6)', () => {
  it('labels the figure just "PnL" — no inline "realized" or "net" qualifier', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Tech Fund');
    const labels = [...container.querySelectorAll('.ant-descriptions-item-label')].map(
      (el) => el.textContent ?? '',
    );
    expect(labels).toContain('PnL');
    // FR-040: the qualifier the user called annoying moved into a tooltip.
    // Nothing on screen may say "realized" or "net invested" any more.
    expect(container.textContent).not.toMatch(/realized|net invested/i);
  });

  it('an OPEN portfolio lists the positions it still holds', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    expect(await screen.findByText(/00918\.TW/)).toBeInTheDocument();
    expect(screen.getByText(/2,145/)).toBeInTheDocument();
  });

  it('a CLOSED portfolio prints the same PnL label, signed and coloured', async () => {
    vi.mocked(financeService.getPortfolio).mockResolvedValue({
      ...PORTFOLIO, state: 'closed', net_value_change: '2737', value_returned: '2737',
    } as never);
    const { container } = renderPage();
    await screen.findAllByText('Tech Fund');
    const labels = [...container.querySelectorAll('.ant-descriptions-item-label')].map(
      (el) => el.textContent ?? '',
    );
    expect(labels).toContain('PnL');
    // Symbol-first, explicit sign; the registry is unseeded in tests so the
    // symbol falls back to the currency code.
    expect(await screen.findByText('+ USD 2,737')).toBeInTheDocument();
  });

  it('shows the empty placeholder when the portfolio has no transfers', async () => {
    vi.mocked(financeService.getPortfolio).mockResolvedValue({
      ...PORTFOLIO, value_invested: null, value_returned: null, net_value_change: null,
    } as never);
    vi.mocked(financeService.getPortfolioHoldings).mockResolvedValue([] as never);
    const { container } = renderPage();
    await screen.findAllByText('Tech Fund');
    // "no data" must not read as 0.
    expect(container.textContent).not.toMatch(/PnL\s*0/);
  });
});

// FR-030 / SC-014: every column needs a header. The iteration-4 merged column
// set shipped 6 of 8 blank — only the caret may legitimately be label-less.
describe('PortfolioDetailPage — every column has a header (iteration 6)', () => {
  it('renders no blank column header except the caret control column', async () => {
    vi.mocked(financeService.listTransactions).mockResolvedValue({
      count: 1, next: null, previous: null, results: [TXN],
    } as never);
    const { container } = renderPage();
    await screen.findByText('DCA buy');
    const headers = [...container.querySelectorAll('.ant-table-thead th')].map(
      (th) => (th.textContent ?? '').trim(),
    );
    // The caret column is deliberately label-less; everything else must speak.
    const blanks = headers.filter((h) => h === '');
    expect(blanks).toHaveLength(1);
    expect(headers).toEqual(
      expect.arrayContaining(['Time', 'PnL', 'Position', 'Description', 'Actions']),
    );
  });
});

// FR-022 / SC-009: transfers are child ROWS of the same table (the inventory
// catalog pattern), not a nested table with its own header.
describe('PortfolioDetailPage — transactions tree table (iteration 4)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listTransactions).mockResolvedValue({
      count: 1, next: null, previous: null, results: [TXN],
    } as never);
  });

  const bodyRows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.ant-table-tbody tr.ant-table-row'));

  it('adds one row per transfer, sharing the parent columns, with no nested table', async () => {
    const { container } = renderPage();
    await screen.findByText('DCA buy');
    expect(bodyRows(container)).toHaveLength(1);

    fireEvent.click(container.querySelector('[data-row-link-ignore]') as HTMLElement);
    await screen.findAllByText(/00918\.TW/);

    // 1 transaction + its 2 transfers, all rows of the SAME table.
    expect(bodyRows(container)).toHaveLength(3);
    // Exactly one header — a nested ProTable would add a second.
    expect(container.querySelectorAll('.ant-table-thead')).toHaveLength(1);
  });

  it('toggles the caret open and closed', async () => {
    const { container } = renderPage();
    await screen.findByText('DCA buy');
    const bodyRows = () =>
      container.querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
    expect(bodyRows()).toBe(1);

    fireEvent.click(container.querySelector('[data-row-link-ignore]') as HTMLElement);
    await waitFor(() => expect(bodyRows()).toBe(3)); // parent + 2 legs

    fireEvent.click(container.querySelector('[data-row-link-ignore]') as HTMLElement);
    await waitFor(() => expect(bodyRows()).toBe(1));
  });

  it('renders row actions on the parent only', async () => {
    const { container } = renderPage();
    await screen.findByText('DCA buy');
    fireEvent.click(container.querySelector('[data-row-link-ignore]') as HTMLElement);
    await screen.findAllByText(/00918\.TW/);
    const rows = bodyRows(container);
    expect(rows[0]!.querySelectorAll('button').length).toBeGreaterThan(0);
    const childRows = rows.slice(1);
    for (const row of childRows) expect(row.querySelectorAll('button')).toHaveLength(0);
  });
});

// Quick search (019 / FR-017): the panel narrows server-side INSIDE the
// portfolio filter — search joins the request, the portfolio condition stays.
describe('PortfolioDetailPage — transactions quick search (iteration 3)', () => {
  it('typing issues a request carrying search AND the portfolio filter', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'fee' } });
    await waitFor(() => {
      const call = vi.mocked(financeService.listTransactions).mock.calls.at(-1)![0]!;
      expect(call.search).toBe('fee');
      const conditions = call.filters!.groups.flatMap((g: { conditions: unknown[] }) => g.conditions);
      expect(conditions).toContainEqual({ attr: 'portfolio', op: 'eq', val: 'p1' });
    });
  });

  it('highlights matches in the transactions table', async () => {
    vi.mocked(financeService.listTransactions).mockResolvedValue({
      count: 1, next: null, previous: null, results: [TXN],
    } as never);
    const { container } = renderPage();
    await screen.findByText('DCA buy');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'dca' } });
    await waitFor(() => {
      const marks = Array.from(container.querySelectorAll('.ant-table-tbody mark'));
      expect(marks.length).toBeGreaterThan(0);
    });
  });
});
