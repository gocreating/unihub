import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ScenariosPage } from './index';
import * as inventoryService from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/inventory');

const SCENARIOS = [
  {
    id: 'sc-1',
    name: 'Camping',
    description: 'Weekend trip',
    item_count: 3,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 'sc-2',
    name: 'Studio shoot',
    description: '',
    item_count: 0,
    created_at: '2026-07-02T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <ScenariosPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('ScenariosPage (iteration 18 — 2 columns, actions in detail)', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.listScenarios).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: SCENARIOS,
    });
  });

  // SP-01 (FR-010): exactly Name + Description — the Actions column is gone.
  it('shows exactly Name and Description columns without row actions', async () => {
    const { container } = renderPage();
    await screen.findByText('Camping');
    const headers = Array.from(container.querySelectorAll('.ant-table-thead th'))
      .map((th) => th.textContent?.trim() ?? '')
      .filter((h) => h !== '');
    const names = headers.map((h) => h.replace(/\s+$/, ''));
    expect(names.filter((h) => ['Name', 'Description'].some((k) => h.startsWith(k)))).toHaveLength(2);
    for (const gone of ['Actions', 'Items', 'Progress', 'Status', 'Ready']) {
      expect(names.some((h) => h.startsWith(gone))).toBe(false);
    }
    // No Edit/Delete row buttons — they live on the detail page now.
    const row = screen.getByText('Camping').closest('tr')!;
    expect(row.querySelectorAll('button')).toHaveLength(0);
  });

  // SP-02: description renders; empty description shows the standard placeholder.
  it('renders descriptions with the standard placeholder when empty', async () => {
    renderPage();
    expect(await screen.findByText('Weekend trip')).toBeInTheDocument();
    const row = screen.getByText('Studio shoot').closest('tr')!;
    expect(row.textContent).toContain('-');
  });
});
