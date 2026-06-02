import { API_BASE_URL } from './index';
import type { EntityListParams, OffsetPaginatedResponse } from '@/components/EntityToolbar';

// ── Types ────────────────────────────────────────────────────────────

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  is_base_currency: boolean;
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  color: string;  // hex e.g. '#2196f3', empty string = no custom color
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
  color: string;  // account's custom color (may be empty string)
  amount: string; // decimal string, e.g. "1234.5678"
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

// ── Entity list helpers ───────────────────────────────────────────────

function buildEntityListQs(params?: EntityListParams): string {
  if (!params) return '';
  const p = new URLSearchParams();
  if (params.filters) p.set('filters', JSON.stringify(params.filters));
  if (params.ordering) p.set('ordering', params.ordering);
  if (params.limit !== undefined) p.set('limit', String(params.limit));
  if (params.offset !== undefined) p.set('offset', String(params.offset));
  if (params.cursor) p.set('cursor', params.cursor);
  // Pass through any extra params (e.g. as_of, base_currency)
  const knownKeys = new Set(['filters', 'ordering', 'limit', 'offset', 'cursor']);
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (!knownKeys.has(k) && v !== undefined) {
      p.set(k, String(v));
    }
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Currencies ────────────────────────────────────────────────────────

export function listCurrencies(params?: EntityListParams): Promise<OffsetPaginatedResponse<Currency>> {
  return fetchJson<OffsetPaginatedResponse<Currency>>(`/api/v1/finance/currencies/${buildEntityListQs(params)}`);
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

export function listAccounts(
  params?: EntityListParams & { as_of?: string },
): Promise<OffsetPaginatedResponse<Account>> {
  return fetchJson<OffsetPaginatedResponse<Account>>(`/api/v1/finance/accounts/${buildEntityListQs(params)}`);
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

export function listBalanceSheets(params?: EntityListParams): Promise<OffsetPaginatedResponse<BalanceSheet>> {
  return fetchJson<OffsetPaginatedResponse<BalanceSheet>>(`/api/v1/finance/balance-sheets/${buildEntityListQs(params)}`);
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

export function listExchangeRates(
  params?: EntityListParams & { base_currency?: string; quote_currency?: string },
): Promise<OffsetPaginatedResponse<ExchangeRate>> {
  return fetchJson<OffsetPaginatedResponse<ExchangeRate>>(`/api/v1/finance/exchange-rates/${buildEntityListQs(params)}`);
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
