import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { ScenariosPage } from './index';
import * as inventoryService from '@/services/unihub-backend/inventory';
import * as coreService from '@/services/unihub-backend/core';

vi.mock('@/services/unihub-backend/inventory');
vi.mock('@/services/unihub-backend/core');

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
    window.sessionStorage.clear();
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
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

  // SP-05 (016 round 2): the view row auto-hides; reveal shows the default
  // "Table" tab active.
  it('reveals the entity-views row with the default Table tab active', async () => {
    renderPage();
    await screen.findByText('Camping');
    fireEvent.click(screen.getByLabelText('Show views'));
    const tab = screen.getByRole('tab', { name: /table/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });
});

describe('ScenariosPage (iteration 45 — real links + tab title)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(coreService.listEntityViews).mockResolvedValue([]);
    vi.mocked(inventoryService.listScenarios).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: SCENARIOS,
    });
  });

  // SP-03 (FR-010): the Name cell is a REAL hyperlink (href), not an onClick
  // anchor — new-tab/middle-click/copy-link must work.
  it('renders the name as a real router link with an href', async () => {
    renderPage();
    const link = (await screen.findByText('Camping')).closest('a')!;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/inventory/scenarios/sc-1');
  });

  // SP-04 (FR-035): the list page sets the browser tab title and restores it.
  it('sets document.title while mounted and restores on unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Camping');
    expect(document.title).toBe('Scenarios · Unihub');
    unmount();
    expect(document.title).toBe('Unihub');
  });
});
