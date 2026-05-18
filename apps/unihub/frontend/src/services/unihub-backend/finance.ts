import { API_BASE_URL } from './index';

// ── Types ────────────────────────────────────────────────────────────

export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  open_datetime: string | null;
  close_datetime: string | null;
  created_at: string;
  updated_at: string;
}

export interface BalanceSheet {
  id: string;
  date: string; // ISO datetime string
  created_at: string;
  updated_at: string;
}

export interface Balance {
  id: string;
  account_id: string;
  account_name: string;
  currency: string;
  amount: string; // decimal string
}

export interface PerCurrencyEntry {
  currency: string;
  net_worth: string;
}

export interface MissingRate {
  currency: string;
  message: string;
}

export interface NetWorthResult {
  balance_sheet_id: string;
  date: string;
  per_currency: PerCurrencyEntry[];
}

export interface ExchangeRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string; // decimal string
  date: string; // ISO datetime string
}

// ── Helpers ──────────────────────────────────────────────────────────

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match?.[1] ?? '';
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail ?? 'Request failed'), { status: resp.status, body });
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ── Currencies ────────────────────────────────────────────────────────

export function listCurrencies(params?: { search?: string; ordering?: string }): Promise<Currency[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return fetchJson<Currency[]>(`/api/v1/finance/currencies/${qs ? `?${qs}` : ''}`);
}

export function createCurrency(data: Currency): Promise<Currency> {
  return fetchJson<Currency>('/api/v1/finance/currencies/', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCurrency(code: string, data: Partial<Omit<Currency, 'code'>>): Promise<Currency> {
  return fetchJson<Currency>(`/api/v1/finance/currencies/${code}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteCurrency(code: string): Promise<void> {
  return fetchJson<void>(`/api/v1/finance/currencies/${code}/`, { method: 'DELETE' });
}

// ── Accounts ─────────────────────────────────────────────────────────

export function listAccounts(params?: { ordering?: string; search?: string; as_of?: string }): Promise<Account[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return fetchJson<Account[]>(`/api/v1/finance/accounts/${qs ? `?${qs}` : ''}`);
}

export function getAccount(id: string): Promise<Account> {
  return fetchJson<Account>(`/api/v1/finance/accounts/${id}/`);
}

export function createAccount(data: Pick<Account, 'name' | 'currency' | 'open_datetime' | 'close_datetime'>): Promise<Account> {
  return fetchJson<Account>('/api/v1/finance/accounts/', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAccount(id: string, data: Partial<Pick<Account, 'name' | 'currency' | 'open_datetime' | 'close_datetime'>>): Promise<Account> {
  return fetchJson<Account>(`/api/v1/finance/accounts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteAccount(id: string, confirm = false): Promise<void | { affected_balance_count: number; message: string }> {
  const qs = confirm ? '?confirm=true' : '';
  return fetchJson<void>(`/api/v1/finance/accounts/${id}/${qs}`, { method: 'DELETE' });
}

// ── Balance Sheets ────────────────────────────────────────────────────

export function listBalanceSheets(params?: { ordering?: string }): Promise<BalanceSheet[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return fetchJson<BalanceSheet[]>(`/api/v1/finance/balance-sheets/${qs ? `?${qs}` : ''}`);
}

export function createBalanceSheet(data: Pick<BalanceSheet, 'date'>): Promise<BalanceSheet> {
  return fetchJson<BalanceSheet>('/api/v1/finance/balance-sheets/', { method: 'POST', body: JSON.stringify(data) });
}

export function updateBalanceSheet(id: string, data: Partial<Pick<BalanceSheet, 'date'>>): Promise<BalanceSheet> {
  return fetchJson<BalanceSheet>(`/api/v1/finance/balance-sheets/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteBalanceSheet(id: string): Promise<void> {
  return fetchJson<void>(`/api/v1/finance/balance-sheets/${id}/`, { method: 'DELETE' });
}

export function listBalances(sheetId: string): Promise<Balance[]> {
  return fetchJson<Balance[]>(`/api/v1/finance/balance-sheets/${sheetId}/balances/`);
}

export function upsertBalance(sheetId: string, accountId: string, amount: string): Promise<Balance> {
  return fetchJson<Balance>(`/api/v1/finance/balance-sheets/${sheetId}/balances/${accountId}/`, {
    method: 'PUT',
    body: JSON.stringify({ amount }),
  });
}

export function deleteBalance(sheetId: string, accountId: string): Promise<void> {
  return fetchJson<void>(`/api/v1/finance/balance-sheets/${sheetId}/balances/${accountId}/delete/`, { method: 'DELETE' });
}

export function getNetWorth(sheetId: string): Promise<NetWorthResult> {
  return fetchJson<NetWorthResult>(`/api/v1/finance/balance-sheets/${sheetId}/net-worth/`);
}

// ── Exchange Rates ────────────────────────────────────────────────────

export function listExchangeRates(params?: { base_currency?: string; quote_currency?: string; ordering?: string }): Promise<ExchangeRate[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return fetchJson<ExchangeRate[]>(`/api/v1/finance/exchange-rates/${qs ? `?${qs}` : ''}`);
}

export function createExchangeRate(data: Pick<ExchangeRate, 'base_currency' | 'quote_currency' | 'rate' | 'date'>): Promise<ExchangeRate> {
  return fetchJson<ExchangeRate>('/api/v1/finance/exchange-rates/', { method: 'POST', body: JSON.stringify(data) });
}

export function updateExchangeRate(id: string, data: Partial<Pick<ExchangeRate, 'base_currency' | 'quote_currency' | 'rate' | 'date'>>): Promise<ExchangeRate> {
  return fetchJson<ExchangeRate>(`/api/v1/finance/exchange-rates/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteExchangeRate(id: string): Promise<void> {
  return fetchJson<void>(`/api/v1/finance/exchange-rates/${id}/`, { method: 'DELETE' });
}
