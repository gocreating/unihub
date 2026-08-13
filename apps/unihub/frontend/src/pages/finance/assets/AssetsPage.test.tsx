import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { DEFAULT_PAGE_SIZE } from '@/components/EntityToolbar';
import { AssetsPage } from './index';
import * as financeService from '@/services/unihub-backend/finance';
import * as coreService from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/finance');
vi.mock('@/services/unihub-backend/core');

const ASSET = {
  id: 'asset0000001',
  name: 'Apple Inc.',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <AssetsPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(financeService.listAssets).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [ASSET],
  });
  vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
});

// FR-002 (amended 2026-08-13): the category attribute is removed everywhere.
describe('AssetsPage — category removal (iteration 3)', () => {
  it('renders no Category column', async () => {
    renderPage();
    await screen.findByText('Apple Inc.');
    expect(screen.queryByText('Category')).toBeNull();
  });

  it('create form offers only the name field', async () => {
    renderPage();
    await screen.findByText('Apple Inc.');
    fireEvent.click(screen.getByRole('button', { name: /new asset/i }));
    await screen.findByLabelText('Name');
    expect(screen.queryByLabelText('Category')).toBeNull();
  });
});

// FR-017: destructive confirmations use the shared dialog, never Modal.confirm.
describe('AssetsPage — shared confirm dialog', () => {
  it('delete flows through confirmDialog and calls the service on OK', async () => {
    vi.mocked(financeService.deleteAsset).mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Apple Inc.');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    const footer = await screen.findByTestId('confirm-dialog-footer');
    expect(footer).toBeInTheDocument();
    expect(document.querySelector('.ant-modal-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(vi.mocked(financeService.deleteAsset).mock.calls.at(-1)![0]).toBe(ASSET.id);
    });
  });
});

// 016 FR-039/SC-021: the shared view pattern — no page-seeded filter/sort, the
// stored default view is what applies on arrival, with nothing unsaved.
describe('AssetsPage — the shared view pattern', () => {
  const STORED_DEFAULT = {
    id: 'dflt00000001',
    table_key: 'finance-assets',
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
    await screen.findByText('Apple Inc.');
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('seeds no filter and no sorting of its own', async () => {
    renderPage();
    await screen.findByText('Apple Inc.');
    const call = vi.mocked(financeService.listAssets).mock.calls.at(-1)![0]!;
    expect(call.filters).toBeUndefined();
    expect(call.ordering).toBeFalsy();
    expect(call.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('applies the stored default view on arrival, with no unsaved indicator', async () => {
    vi.mocked(coreService.listEntityViews).mockResolvedValue([STORED_DEFAULT]);
    renderPage();
    await screen.findByText('Apple Inc.');
    await waitFor(() => {
      const call = vi.mocked(financeService.listAssets).mock.calls.at(-1)![0]!;
      expect(call.limit).toBe(100);
    });
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
  });
});

// Quick search (019): request narrowing + highlight marks.
describe('AssetsPage — quick search', () => {
  it('typing then pausing calls the service with the search param', async () => {
    renderPage();
    await screen.findByText('Apple Inc.');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'apple' } });
    await waitFor(() => {
      const call = vi.mocked(financeService.listAssets).mock.calls.at(-1)![0]!;
      expect(call.search).toBe('apple');
    });
  });

  it('clearing the search removes the param from the request', async () => {
    renderPage();
    await screen.findByText('Apple Inc.');
    const input = screen.getByPlaceholderText('Search');
    fireEvent.change(input, { target: { value: 'apple' } });
    await waitFor(() => {
      expect(vi.mocked(financeService.listAssets).mock.calls.at(-1)![0]!.search).toBe('apple');
    });
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      const call = vi.mocked(financeService.listAssets).mock.calls.at(-1)![0]!;
      expect('search' in call).toBe(false);
    });
  });

  it('highlights the matched fragment in the name cell', async () => {
    const { container } = renderPage();
    await screen.findByText('Apple Inc.');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'apple' } });
    await waitFor(() => {
      const marks = Array.from(container.querySelectorAll('.ant-table-tbody mark'));
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) expect(mark.textContent?.toLowerCase()).toBe('apple');
    });
  });
});
