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
        <MemoryRouter initialEntries={['/finance/portfolios/p1']}>
          <Routes>
            <Route path="/finance/portfolios/:id" element={<PortfolioDetailPage />} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('PortfolioDetailPage — breadcrumb + Portfolio panel (iteration 2, US2)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    Modal.destroyAll();
    message.destroy();
    vi.mocked(financeService.getPortfolio).mockResolvedValue(PORTFOLIO as never);
    vi.mocked(financeService.listTransactions).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.listAssets).mockResolvedValue(EMPTY_PAGE as never);
    vi.mocked(financeService.deletePortfolio).mockResolvedValue(undefined as never);
    vi.mocked(financeService.updatePortfolio).mockResolvedValue(PORTFOLIO as never);
  });

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
    expect(financeService.updatePortfolio).not.toHaveBeenCalled();
  });

  // FR-015: kebab → Delete → confirm → delete service + navigate back to the list
  it('deletes via kebab → confirm and navigates back to the Portfolios list', async () => {
    renderPage();
    await screen.findAllByText('Tech Fund');
    fireEvent.click(screen.getByLabelText('portfolio-actions'));
    fireEvent.click(await screen.findByText('Delete'));
    expect((await screen.findAllByText('Delete Portfolio')).length).toBeGreaterThan(0);
    const okBtn = await waitFor(() => {
      const btn = document.querySelector('.ant-modal-confirm-btns .ant-btn-dangerous');
      expect(btn).toBeTruthy();
      return btn as HTMLElement;
    });
    fireEvent.click(okBtn);
    await waitFor(() => {
      expect(financeService.deletePortfolio).toHaveBeenCalledWith('p1');
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
    const okBtn = await waitFor(() => {
      const btn = document.querySelector('.ant-modal-confirm-btns .ant-btn-dangerous');
      expect(btn).toBeTruthy();
      return btn as HTMLElement;
    });
    fireEvent.click(okBtn);
    expect(
      await screen.findByText('This portfolio has associated transactions and cannot be deleted.'),
    ).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith('/finance/portfolios');
  });
});
