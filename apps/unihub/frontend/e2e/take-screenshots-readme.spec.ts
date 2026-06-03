/**
 * Dedicated screenshot spec for README.md.
 *
 * Three Finance screenshots chosen to showcase the app at its best:
 *   01 — Balance Sheets list with Equity Curve (net worth over time)
 *   02 — Accounts list (multi-currency entity management with toolbar)
 *   03 — Balance Sheet detail, Assets Breakdown (Nightingale chart)
 *
 * Mock data is designed to look like a realistic personal finance portfolio:
 * five accounts across three currencies, six quarterly snapshots over 18 months
 * showing steady net-worth growth.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = 'readme';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

// ── Mock data ──────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true  },
  { code: 'USD', name: 'US Dollar',          symbol: '$',   is_base_currency: false },
  { code: 'EUR', name: 'Euro',               symbol: '€',   is_base_currency: false },
];

const ACCOUNTS = [
  { id: 'a01', name: 'CTBC Savings',      currency: 'TWD', color: '#52c41a', open_datetime: '2021-01-01T00:00:00Z', close_datetime: null, created_at: '2021-01-01T00:00:00Z', updated_at: '2024-12-01T00:00:00Z' },
  { id: 'a02', name: 'Fubon Brokerage',   currency: 'TWD', color: '#1677ff', open_datetime: '2021-01-01T00:00:00Z', close_datetime: null, created_at: '2021-01-01T00:00:00Z', updated_at: '2024-12-01T00:00:00Z' },
  { id: 'a03', name: 'Interactive Brokers', currency: 'USD', color: '#fa8c16', open_datetime: '2022-06-01T00:00:00Z', close_datetime: null, created_at: '2022-06-01T00:00:00Z', updated_at: '2024-12-01T00:00:00Z' },
  { id: 'a04', name: 'N26 Checking',      currency: 'EUR', color: '#722ed1', open_datetime: '2023-03-01T00:00:00Z', close_datetime: null, created_at: '2023-03-01T00:00:00Z', updated_at: '2024-12-01T00:00:00Z' },
  { id: 'a05', name: 'Credit Card',       currency: 'TWD', color: '#ff4d4f', open_datetime: '2021-01-01T00:00:00Z', close_datetime: null, created_at: '2021-01-01T00:00:00Z', updated_at: '2024-12-01T00:00:00Z' },
];

const EXCHANGE_RATES = [
  { id: 'er01', base_currency: 'USD', quote_currency: 'TWD', rate: '32.5',  date: '2024-12-01T00:00:00Z' },
  { id: 'er02', base_currency: 'EUR', quote_currency: 'TWD', rate: '35.2',  date: '2024-12-01T00:00:00Z' },
];

// Six quarterly balance sheets: 2023-Q3 → 2024-Q4 (showing steady growth)
const SHEETS = [
  { id: 's01', date: '2024-12-01T00:00:00Z', created_at: '2024-12-01T00:00:00Z', updated_at: '2024-12-01T00:00:00Z' },
  { id: 's02', date: '2024-09-01T00:00:00Z', created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: 's03', date: '2024-06-01T00:00:00Z', created_at: '2024-06-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' },
  { id: 's04', date: '2024-03-01T00:00:00Z', created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' },
  { id: 's05', date: '2023-12-01T00:00:00Z', created_at: '2023-12-01T00:00:00Z', updated_at: '2023-12-01T00:00:00Z' },
  { id: 's06', date: '2023-09-01T00:00:00Z', created_at: '2023-09-01T00:00:00Z', updated_at: '2023-09-01T00:00:00Z' },
];

// Latest snapshot balances — most detailed, used for the detail page
const BALANCES_LATEST = [
  { id: 'b01', account_id: 'a01', account_name: 'CTBC Savings',        currency: 'TWD', amount: '1850000', color: '#52c41a' },
  { id: 'b02', account_id: 'a02', account_name: 'Fubon Brokerage',     currency: 'TWD', amount: '3200000', color: '#1677ff' },
  { id: 'b03', account_id: 'a03', account_name: 'Interactive Brokers', currency: 'USD', amount: '42000',   color: '#fa8c16' },
  { id: 'b04', account_id: 'a04', account_name: 'N26 Checking',        currency: 'EUR', amount: '8500',    color: '#722ed1' },
  { id: 'b05', account_id: 'a05', account_name: 'Credit Card',         currency: 'TWD', amount: '-62000',  color: '#ff4d4f' },
];

// Older snapshot balances (slightly smaller values for the growth curve)
const BALANCES_OLDER = [
  { id: 'c01', account_id: 'a01', account_name: 'CTBC Savings',        currency: 'TWD', amount: '1200000', color: '#52c41a' },
  { id: 'c02', account_id: 'a02', account_name: 'Fubon Brokerage',     currency: 'TWD', amount: '2400000', color: '#1677ff' },
  { id: 'c03', account_id: 'a03', account_name: 'Interactive Brokers', currency: 'USD', amount: '28000',   color: '#fa8c16' },
  { id: 'c04', account_id: 'a04', account_name: 'N26 Checking',        currency: 'EUR', amount: '5000',    color: '#722ed1' },
  { id: 'c05', account_id: 'a05', account_name: 'Credit Card',         currency: 'TWD', amount: '-45000',  color: '#ff4d4f' },
];

function paginated(results: unknown[]) {
  return { count: results.length, next: null, previous: null, results };
}

async function mockAuth(page: Page) {
  await page.route('**/api/v1/auth/me/', (r) =>
    r.fulfill({ json: { id: 1, username: 'demo', is_staff: true } }),
  );
}

async function mockFinance(page: Page) {
  await mockAuth(page);

  await page.route('**/api/v1/finance/currencies/**', (r) =>
    r.fulfill({ json: paginated(CURRENCIES) }),
  );

  await page.route(
    (url) => url.pathname === '/api/v1/finance/accounts/',
    (r) => r.fulfill({ json: paginated(ACCOUNTS) }),
  );

  await page.route('**/api/v1/finance/exchange-rates/**', (r) =>
    r.fulfill({ json: paginated(EXCHANGE_RATES) }),
  );

  await page.route(
    (url) => url.pathname === '/api/v1/finance/balance-sheets/',
    (r) => r.fulfill({ json: paginated(SHEETS) }),
  );

  // Latest snapshot → rich balances
  await page.route('**/api/v1/finance/balance-sheets/s01/balances/**', (r) =>
    r.fulfill({ json: BALANCES_LATEST }),
  );

  // All older snapshots → slightly smaller values (creates the growth curve)
  for (const sh of SHEETS.slice(1)) {
    await page.route(`**/api/v1/finance/balance-sheets/${sh.id}/balances/**`, (r) =>
      r.fulfill({ json: BALANCES_OLDER }),
    );
  }
}

async function setLocale(page: Page, locale: string) {
  await page.addInitScript((loc) => {
    localStorage.setItem('unihub-locale', loc);
  }, locale);
}

// ── Screenshots ────────────────────────────────────────────────────────────────

test.describe('Screenshots — README', () => {

  // 01: Balance Sheets list → Equity Curve chart
  //     Shows: financial analytics, multi-account net worth over time, sidebar navigation
  test('01-balance-sheets-equity-curve', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByRole('heading', { name: 'Balance Sheets' })).toBeVisible({ timeout: 15_000 });
    // Wait for the Equity Curve chart to render (canvas or SVG element)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: ss('01-balance-sheets-equity-curve.png'), fullPage: false });
  });

  // 02: Accounts list with Filter / Sort / Columns toolbar
  //     Shows: multi-currency entity management, entity operations toolbar
  test('02-accounts-list', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/accounts');
    await expect(page.getByText('CTBC Savings')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('02-accounts-list.png'), fullPage: false });
  });

  // 03: Balance Sheet detail → Assets Breakdown (Nightingale chart)
  //     Shows: per-snapshot portfolio analytics, colorful breakdown by account
  test('03-balance-sheet-assets-breakdown', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets/s01');
    // Wait for the tab navigation to appear then click Assets Breakdown
    await expect(page.getByText('A/L')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Assets Breakdown').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: ss('03-balance-sheet-assets-breakdown.png'), fullPage: false });
  });

});
