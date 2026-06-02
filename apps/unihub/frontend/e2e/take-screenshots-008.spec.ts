/**
 * Screenshot capture spec for PR 008-entity-operations.
 * Covers: EntityToolbar (filter/sort/column panels), sort highlighting,
 * paginated footers, and the balance-sheets toolbar.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '008-entity-operations';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) { return path.join(OUT_DIR, name); }

// ── Mock data ─────────────────────────────────────────────────────────────────

const CURRENCIES_RESULTS = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimal_digits: 2, is_base_currency: true },
  { code: 'USD', name: 'US Dollar',         symbol: '$',   decimal_digits: 2, is_base_currency: false },
  { code: 'EUR', name: 'Euro',              symbol: '€',   decimal_digits: 2, is_base_currency: false },
  { code: 'JPY', name: 'Japanese Yen',      symbol: '¥',   decimal_digits: 0, is_base_currency: false },
  { code: 'GBP', name: 'British Pound',     symbol: '£',   decimal_digits: 2, is_base_currency: false },
];

const ACCOUNTS_RESULTS = [
  { id: 'acc001', name: 'CTBC Bank',        currency: 'TWD', color: '#4caf50', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc002', name: 'Fubon Securities', currency: 'TWD', color: '#2196f3', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc003', name: 'Bitfinex',         currency: 'USD', color: '#ff9800', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc004', name: 'Ether.fi Vault',   currency: 'USD', color: '#9c27b0', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc005', name: 'Credit Card',      currency: 'TWD', color: '#f44336', open_datetime: '2022-01-01T00:00:00Z', close_datetime: '2025-01-01T00:00:00Z' },
];

const EXCHANGE_RATES_RESULTS = [
  { id: 'er001', base_currency: 'USD', quote_currency: 'TWD', rate: '31.5',  date: '2025-01-01T00:00:00Z' },
  { id: 'er002', base_currency: 'USD', quote_currency: 'TWD', rate: '31.0',  date: '2024-10-01T00:00:00Z' },
  { id: 'er003', base_currency: 'EUR', quote_currency: 'TWD', rate: '34.2',  date: '2025-01-01T00:00:00Z' },
  { id: 'er004', base_currency: 'JPY', quote_currency: 'TWD', rate: '0.21',  date: '2025-01-01T00:00:00Z' },
];

const SHEETS_RESULTS = [
  { id: 'sh001', date: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'sh002', date: '2024-10-01T00:00:00Z', created_at: '2024-10-01T00:00:00Z', updated_at: '2024-10-01T00:00:00Z' },
  { id: 'sh003', date: '2024-07-01T00:00:00Z', created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
];

function paginated(results: unknown[], count?: number) {
  return { count: count ?? results.length, next: null, previous: null, results };
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

async function mockAll(page: Page) {
  await page.route('**/api/v1/finance/currencies/**', (r) =>
    r.fulfill({ json: paginated(CURRENCIES_RESULTS) }));
  await page.route('**/api/v1/finance/accounts/**', (r) =>
    r.fulfill({ json: paginated(ACCOUNTS_RESULTS) }));
  await page.route('**/api/v1/finance/exchange-rates/**', (r) =>
    r.fulfill({ json: paginated(EXCHANGE_RATES_RESULTS) }));
  await page.route('**/api/v1/finance/balance-sheets/**balances**', (r) =>
    r.fulfill({ json: [] }));
  await page.route('**/api/v1/finance/balance-sheets/**', (r) =>
    r.fulfill({ json: paginated(SHEETS_RESULTS) }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Screenshots — 008-entity-operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('01-currencies-toolbar-default', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/currencies');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('01-currencies-toolbar-default.png'), fullPage: false });
  });

  test('02-currencies-filter-panel', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/currencies');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Filter")');
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('02-currencies-filter-panel.png'), fullPage: false });
  });

  test('03-currencies-sort-panel', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/currencies');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Sort")');
    // Wait for the sort panel — look for the Reset button which is always inside the panel
    await expect(page.locator('button:has-text("Reset")').first()).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: ss('03-currencies-sort-panel.png'), fullPage: false });
  });

  test('04-currencies-column-panel', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/currencies');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Columns")');
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('04-currencies-column-panel.png'), fullPage: false });
  });

  test('05-currencies-sort-highlight', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/currencies');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    // Click Code column header to sort
    await page.locator('.ant-table-thead th').filter({ hasText: /^Code/ }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: ss('05-currencies-sort-highlight.png'), fullPage: false });
  });

  test('06-accounts-toolbar', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/accounts');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('06-accounts-toolbar.png'), fullPage: false });
  });

  test('07-exchange-rates-sort-open', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/exchange-rates');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Sort")');
    await expect(page.locator('button:has-text("Reset")').first()).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: ss('07-exchange-rates-sort-panel.png'), fullPage: false });
  });

  test('08-balance-sheets-toolbar', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('08-balance-sheets-toolbar.png'), fullPage: false });
  });

  test('09-pagination-footer', async ({ page }) => {
    await mockAll(page);
    await page.goto('/finance/currencies');
    await expect(page.locator('.ant-table-footer')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: ss('09-pagination-footer.png'), fullPage: false });
  });
});
