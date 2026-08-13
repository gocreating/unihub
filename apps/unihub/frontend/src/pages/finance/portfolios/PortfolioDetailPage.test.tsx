import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Modal, message } from 'antd';
import enUS from '@/locales/en-US';
import { PortfolioDetailPage } from './detail';
import * as financeService from '@/services/unihub-backend/finance';

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
      asset: 'a1',
      asset_name: '00918.TW',
      asset_change_amount: '419.000000000000000000',
      value_change: null,
      remark: '',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
    {
      id: 'tr2',
      asset: 'a2',
      asset_name: 'TWD',
      asset_change_amount: '-1.000000000000000000',
      value_change: '-1.000000000000000000',
      remark: '手續費',
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

// Iteration 3 (US3): chain/tx metadata, transfer remarks, 18dp amounts.
describe('PortfolioDetailPage — transaction & transfer fields (iteration 3)', () => {
  it('transaction form offers Chain ID, Tx Hash, and per-transfer Remark fields', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.click(screen.getByRole('button', { name: /New Transaction/ }));
    expect(await screen.findByLabelText('Chain ID')).toBeTruthy();
    expect(screen.getByLabelText('Tx Hash')).toBeTruthy();
    expect(screen.getByPlaceholderText('Optional, e.g. fee')).toBeTruthy();
  });

  it('expanded transfer rows show remark and trailing-zero-trimmed amounts', async () => {
    vi.mocked(financeService.listTransactions).mockResolvedValue({
      count: 1, next: null, previous: null, results: [TXN],
    } as never);
    renderPage();
    await screen.findByText('DCA buy');
    fireEvent.click(document.querySelector('.ant-table-row-expand-icon') as HTMLElement);
    expect(await screen.findByText('手續費')).toBeTruthy();
    // 18dp storage must not leak trailing zeros into the display
    expect(screen.getByText('419')).toBeTruthy();
    expect(screen.queryByText('419.000000000000000000')).toBeNull();
  });

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
