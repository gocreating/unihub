/**
 * Screenshot capture spec for PR #006-finance-app-enhancement.
 * Uses route mocks so the backend does not need to be running.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const BRANCH = '006-finance-app-enhancement';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

// ── Shared mock data ──────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', is_base_currency: false },
];

const ACCOUNTS = [
  { id: 'acc001', name: 'CTBC Bank',         currency: 'TWD', color: '#4caf50', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc002', name: 'Fubon Securities',  currency: 'TWD', color: '#2196f3', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc003', name: 'Bitfinex',          currency: 'USD', color: '#ff9800', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc004', name: 'Ether.fi Vault',    currency: 'USD', color: '#9c27b0', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
  { id: 'acc005', name: 'Credit Card Debt',  currency: 'TWD', color: '#f44336', open_datetime: '2022-01-01T00:00:00Z', close_datetime: null },
];

const SHEETS = [
  { id: 'sh001', date: '2024-01-01T00:00:00Z', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
  { id: 'sh002', date: '2024-04-01T00:00:00Z', created_at: '2024-04-01T00:00:00Z', updated_at: '2024-04-01T00:00:00Z' },
  { id: 'sh003', date: '2024-07-01T00:00:00Z', created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
  { id: 'sh004', date: '2024-10-01T00:00:00Z', created_at: '2024-10-01T00:00:00Z', updated_at: '2024-10-01T00:00:00Z' },
  { id: 'sh005', date: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
];

const BALANCES: Record<string, { account_id: string; account_name: string; currency: string; amount: string; color: string }[]> = {
  sh001: [
    { account_id: 'acc001', account_name: 'CTBC Bank',        currency: 'TWD', amount: '800000',    color: '#4caf50' },
    { account_id: 'acc002', account_name: 'Fubon Securities', currency: 'TWD', amount: '1200000',   color: '#2196f3' },
    { account_id: 'acc003', account_name: 'Bitfinex',         currency: 'USD', amount: '12000',     color: '#ff9800' },
    { account_id: 'acc004', account_name: 'Ether.fi Vault',   currency: 'USD', amount: '8000',      color: '#9c27b0' },
    { account_id: 'acc005', account_name: 'Credit Card Debt', currency: 'TWD', amount: '-45000',    color: '#f44336' },
  ],
  sh002: [
    { account_id: 'acc001', account_name: 'CTBC Bank',        currency: 'TWD', amount: '950000',    color: '#4caf50' },
    { account_id: 'acc002', account_name: 'Fubon Securities', currency: 'TWD', amount: '1500000',   color: '#2196f3' },
    { account_id: 'acc003', account_name: 'Bitfinex',         currency: 'USD', amount: '15000',     color: '#ff9800' },
    { account_id: 'acc004', account_name: 'Ether.fi Vault',   currency: 'USD', amount: '12000',     color: '#9c27b0' },
    { account_id: 'acc005', account_name: 'Credit Card Debt', currency: 'TWD', amount: '-60000',    color: '#f44336' },
  ],
  sh003: [
    { account_id: 'acc001', account_name: 'CTBC Bank',        currency: 'TWD', amount: '1100000',   color: '#4caf50' },
    { account_id: 'acc002', account_name: 'Fubon Securities', currency: 'TWD', amount: '1800000',   color: '#2196f3' },
    { account_id: 'acc003', account_name: 'Bitfinex',         currency: 'USD', amount: '18000',     color: '#ff9800' },
    { account_id: 'acc004', account_name: 'Ether.fi Vault',   currency: 'USD', amount: '15000',     color: '#9c27b0' },
    { account_id: 'acc005', account_name: 'Credit Card Debt', currency: 'TWD', amount: '-72000',    color: '#f44336' },
  ],
  sh004: [
    { account_id: 'acc001', account_name: 'CTBC Bank',        currency: 'TWD', amount: '1250000',   color: '#4caf50' },
    { account_id: 'acc002', account_name: 'Fubon Securities', currency: 'TWD', amount: '2100000',   color: '#2196f3' },
    { account_id: 'acc003', account_name: 'Bitfinex',         currency: 'USD', amount: '22000',     color: '#ff9800' },
    { account_id: 'acc004', account_name: 'Ether.fi Vault',   currency: 'USD', amount: '20000',     color: '#9c27b0' },
    { account_id: 'acc005', account_name: 'Credit Card Debt', currency: 'TWD', amount: '-85000',    color: '#f44336' },
  ],
  sh005: [
    { account_id: 'acc001', account_name: 'CTBC Bank',        currency: 'TWD', amount: '1400000',   color: '#4caf50' },
    { account_id: 'acc002', account_name: 'Fubon Securities', currency: 'TWD', amount: '2400000',   color: '#2196f3' },
    { account_id: 'acc003', account_name: 'Bitfinex',         currency: 'USD', amount: '28000',     color: '#ff9800' },
    { account_id: 'acc004', account_name: 'Ether.fi Vault',   currency: 'USD', amount: '25000',     color: '#9c27b0' },
    { account_id: 'acc005', account_name: 'Credit Card Debt', currency: 'TWD', amount: '-98000',    color: '#f44336' },
  ],
};

const EXCHANGE_RATES = [
  { id: 'er001', base_currency: 'USD', quote_currency: 'TWD', rate: '31.5', date: '2025-01-01T00:00:00Z' },
  { id: 'er002', base_currency: 'USD', quote_currency: 'TWD', rate: '31.0', date: '2024-10-01T00:00:00Z' },
  { id: 'er003', base_currency: 'USD', quote_currency: 'TWD', rate: '30.5', date: '2024-07-01T00:00:00Z' },
  { id: 'er004', base_currency: 'USD', quote_currency: 'TWD', rate: '30.0', date: '2024-04-01T00:00:00Z' },
  { id: 'er005', base_currency: 'USD', quote_currency: 'TWD', rate: '29.5', date: '2024-01-01T00:00:00Z' },
];

// ── Route setup helpers ───────────────────────────────────────────────────────

async function mockFinanceRoutes(page: Page) {
  await page.route('**/api/v1/finance/currencies/**', (r) =>
    r.fulfill({ json: CURRENCIES }),
  );
  await page.route('**/api/v1/finance/accounts/**', (r) =>
    r.fulfill({ json: ACCOUNTS }),
  );
  await page.route('**/api/v1/finance/balance-sheets/', (r) =>
    r.fulfill({ json: SHEETS }),
  );
  await page.route('**/api/v1/finance/exchange-rates/**', (r) =>
    r.fulfill({ json: EXCHANGE_RATES }),
  );
  for (const [sheetId, balances] of Object.entries(BALANCES)) {
    await page.route(`**/api/v1/finance/balance-sheets/${sheetId}/balances/`, (r) =>
      r.fulfill({ json: balances }),
    );
  }
  // Mock auth/session so pages don't redirect to login.
  await page.route('**/api/v1/auth/me/', (r) =>
    r.fulfill({ json: { id: 1, username: 'root', is_staff: true } }),
  );
}

async function mockDetailRoutes(page: Page, sheetId: string) {
  await mockFinanceRoutes(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Screenshots — 006-finance-app-enhancement', () => {
  // ── Balance sheet list — Equity Curve ──────────────────────────────────────

  test('01-equity-curve', async ({ page }) => {
    await mockFinanceRoutes(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByText('Equity Curve')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200); // let chart settle
    await page.screenshot({ path: ss('01-equity-curve.png'), fullPage: false });
  });

  test('02-account-trend', async ({ page }) => {
    await mockFinanceRoutes(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByText('Account Trend')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Account Trend').click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: ss('02-account-trend.png'), fullPage: false });
  });

  // ── Balance sheet detail ───────────────────────────────────────────────────

  test('03-detail-al-chart', async ({ page }) => {
    await mockDetailRoutes(page, 'sh005');
    await page.goto('/finance/balance-sheets/sh005');
    await expect(page.getByText('A/L')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: ss('03-detail-al-chart.png'), fullPage: false });
  });

  test('04-detail-assets-breakdown', async ({ page }) => {
    await mockDetailRoutes(page, 'sh005');
    await page.goto('/finance/balance-sheets/sh005');
    await expect(page.getByText('Assets Breakdown')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Assets Breakdown').click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('04-detail-assets-breakdown.png'), fullPage: false });
  });

  test('05-detail-debts-breakdown', async ({ page }) => {
    await mockDetailRoutes(page, 'sh005');
    await page.goto('/finance/balance-sheets/sh005');
    await expect(page.getByText('Debts Breakdown')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Debts Breakdown').click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('05-detail-debts-breakdown.png'), fullPage: false });
  });

  test('06-detail-statistics-default', async ({ page }) => {
    await mockDetailRoutes(page, 'sh005');
    await page.goto('/finance/balance-sheets/sh005');
    await expect(page.getByText('Statistics')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Statistics').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('06-detail-statistics-default.png'), fullPage: false });
  });

  test('07-detail-statistics-expanded', async ({ page }) => {
    await mockDetailRoutes(page, 'sh005');
    await page.goto('/finance/balance-sheets/sh005');
    await expect(page.getByText('Statistics')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Statistics').click();
    await page.waitForTimeout(600);
    // Expand all rows by clicking each expandable row
    const expandButtons = page.locator('.ant-table-row-expand-icon-collapsed');
    const count = await expandButtons.count();
    for (let i = 0; i < count; i++) {
      await expandButtons.nth(0).click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: ss('07-detail-statistics-expanded.png'), fullPage: false });
  });

  // ── Account list — color picker ────────────────────────────────────────────

  test('08-accounts-color-column', async ({ page }) => {
    await mockFinanceRoutes(page);
    await page.goto('/finance/accounts');
    await expect(page.getByText('CTBC Bank')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('08-accounts-color-column.png'), fullPage: false });
  });
});
