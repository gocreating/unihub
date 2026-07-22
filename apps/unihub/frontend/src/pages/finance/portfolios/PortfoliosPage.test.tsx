import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { PortfoliosPage } from './index';
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
        <MemoryRouter initialEntries={['/finance/portfolios']}>
          <PortfoliosPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('PortfoliosPage — hyperlinked rows, no row edit/delete (iteration 2, US2)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(financeService.listPortfolios).mockResolvedValue({
      count: 1, next: null, previous: null, results: [PORTFOLIO],
    } as never);
    vi.mocked(financeService.listCurrencies).mockResolvedValue(EMPTY_PAGE as never);
  });

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
