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

describe('ScenariosPage (iteration 14 — 3 columns)', () => {
  beforeEach(() => {
    vi.mocked(inventoryService.listScenarios).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: SCENARIOS,
    });
  });

  // SP-01: exactly Name, Description, Actions columns (FR-010).
  it('shows exactly Name, Description, and Actions columns', async () => {
    const { container } = renderPage();
    await screen.findByText('Camping');
    const headers = Array.from(container.querySelectorAll('.ant-table-thead th'))
      .map((th) => th.textContent?.trim() ?? '')
      .filter((h) => h !== '');
    const names = headers.map((h) => h.replace(/\s+$/, ''));
    expect(names.filter((h) => ['Name', 'Description', 'Actions'].some((k) => h.startsWith(k)))).toHaveLength(3);
    for (const gone of ['Items', 'Progress', 'Status', 'Ready']) {
      expect(names.some((h) => h.startsWith(gone))).toBe(false);
    }
  });

  // SP-02: description renders; empty description shows the standard placeholder.
  it('renders descriptions with the standard placeholder when empty', async () => {
    renderPage();
    expect(await screen.findByText('Weekend trip')).toBeInTheDocument();
    const row = screen.getByText('Studio shoot').closest('tr')!;
    expect(row.textContent).toContain('-');
  });
});
