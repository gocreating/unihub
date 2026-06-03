import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { BalanceSheetEditPage } from './edit';
import * as financeService from '@/services/unihub-backend/finance';

vi.mock('@/services/unihub-backend/finance');

const SHEET_ID = 'sheet-1';
const SHEET = { id: SHEET_ID, date: '2024-06-01T10:00:00Z', created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' };
const ACCOUNT = {
  id: 'acc-1',
  name: 'Checking',
  currency: 'USD',
  color: '',
  open_datetime: null,
  close_datetime: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};
const BALANCE = { id: 'bal-1', account_id: 'acc-1', account_name: 'Checking', currency: 'USD', color: '', amount: '1234.56' };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter initialEntries={[`/finance/balance-sheets/${SHEET_ID}/edit`]}>
          <Routes>
            <Route path="/finance/balance-sheets/:id/edit" element={<BalanceSheetEditPage />} />
          </Routes>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('BalanceSheetEditPage — amount input (US2)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listBalanceSheets).mockResolvedValue({
      count: 1, next: null, previous: null, results: [SHEET],
    });
    vi.mocked(financeService.listAccounts).mockResolvedValue({
      count: 1, next: null, previous: null, results: [ACCOUNT],
    });
    vi.mocked(financeService.listBalances).mockResolvedValue([BALANCE]);
  });

  it('amount field is an InputNumber (renders with role spinbutton)', async () => {
    renderPage();
    const inputs = await screen.findAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('amount field is pre-seeded with the existing balance value', async () => {
    renderPage();
    const input = await screen.findByRole('spinbutton');
    expect(input).toHaveValue('1234.56');
  });
});
