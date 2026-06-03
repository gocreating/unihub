import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import { BalanceSheetNewPage } from './new';
import * as financeService from '@/services/unihub-backend/finance';

vi.mock('@/services/unihub-backend/finance');

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <BalanceSheetNewPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('BalanceSheetNewPage — amount input (US2)', () => {
  beforeEach(() => {
    vi.mocked(financeService.listAccounts).mockResolvedValue({
      count: 1, next: null, previous: null, results: [ACCOUNT],
    });
  });

  it('amount field is an InputNumber (renders as input[type=text] with role spinbutton)', async () => {
    renderPage();
    const inputs = await screen.findAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('amount field starts empty (no pre-filled zero)', async () => {
    renderPage();
    const input = await screen.findByRole('spinbutton');
    expect(input).toHaveValue('');
  });
});
