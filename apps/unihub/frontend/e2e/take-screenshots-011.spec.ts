/**
 * Screenshot capture spec for PR 011-ui-fixes-enhancements.
 * Covers: hyperlink nav buttons, amount input, side-menu overlay, tab i18n,
 * tooltip suppression, and user dropdown alignment.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '011-ui-fixes-enhancements';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) { return path.join(OUT_DIR, name); }

// ── Mock data ──────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', is_base_currency: false },
];

const ACCOUNTS = [
  { id: 'acc001', name: 'CTBC Bank',        currency: 'TWD', color: '#4caf50', open_datetime: '2022-03-15T09:00:00Z', close_datetime: null, created_at: '2022-03-15T09:00:00Z', updated_at: '2022-03-15T09:00:00Z' },
  { id: 'acc002', name: 'Fubon Securities', currency: 'TWD', color: '#2196f3', open_datetime: '2022-03-15T09:00:00Z', close_datetime: null, created_at: '2022-03-15T09:00:00Z', updated_at: '2022-03-15T09:00:00Z' },
  { id: 'acc003', name: 'Bitfinex',         currency: 'USD', color: '#ff9800', open_datetime: '2021-06-01T00:00:00Z', close_datetime: null, created_at: '2021-06-01T00:00:00Z', updated_at: '2021-06-01T00:00:00Z' },
  { id: 'acc004', name: 'Ether.fi Vault',   currency: 'USD', color: '#9c27b0', open_datetime: '2023-01-01T00:00:00Z', close_datetime: null, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z' },
  { id: 'acc005', name: 'Credit Card Debt', currency: 'TWD', color: '#f44336', open_datetime: '2020-01-01T00:00:00Z', close_datetime: null, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' },
];

const SHEETS = [
  { id: 'sh001', date: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'sh002', date: '2024-10-01T00:00:00Z', created_at: '2024-10-01T00:00:00Z', updated_at: '2024-10-01T00:00:00Z' },
  { id: 'sh003', date: '2024-07-01T00:00:00Z', created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
  { id: 'sh004', date: '2024-04-01T00:00:00Z', created_at: '2024-04-01T00:00:00Z', updated_at: '2024-04-01T00:00:00Z' },
  { id: 'sh005', date: '2024-01-01T00:00:00Z', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
];

const BALANCES_SH001 = [
  { id: 'b1', account_id: 'acc001', account_name: 'CTBC Bank',        currency: 'TWD', amount: '1400000', color: '#4caf50' },
  { id: 'b2', account_id: 'acc002', account_name: 'Fubon Securities', currency: 'TWD', amount: '2400000', color: '#2196f3' },
  { id: 'b3', account_id: 'acc003', account_name: 'Bitfinex',         currency: 'USD', amount: '28000',   color: '#ff9800' },
  { id: 'b4', account_id: 'acc004', account_name: 'Ether.fi Vault',   currency: 'USD', amount: '25000',   color: '#9c27b0' },
  { id: 'b5', account_id: 'acc005', account_name: 'Credit Card Debt', currency: 'TWD', amount: '-98000',  color: '#f44336' },
];

const EXCHANGE_RATES = [
  { id: 'er001', base_currency: 'USD', quote_currency: 'TWD', rate: '31.5', date: '2025-01-01T00:00:00Z' },
];

function paginated(results: unknown[]) {
  return { count: results.length, next: null, previous: null, results };
}

async function setLocale(page: Page, locale: string) {
  await page.addInitScript((loc) => {
    localStorage.setItem('unihub-locale', loc);
  }, locale);
}

async function mockAuth(page: Page) {
  await page.route('**/api/v1/auth/me/', (r) =>
    r.fulfill({ json: { id: 1, username: 'root', is_staff: true } }),
  );
}

async function mockFinance(page: Page) {
  await mockAuth(page);
  await page.route('**/api/v1/finance/currencies/**', (r) =>
    r.fulfill({ json: paginated(CURRENCIES) }),
  );
  // Use URL predicate so query-param requests (?limit=10&...) are also matched
  await page.route(
    (url) => url.pathname === '/api/v1/finance/accounts/',
    (r) => r.fulfill({ json: paginated(ACCOUNTS) }),
  );
  await page.route('**/api/v1/finance/exchange-rates/**', (r) =>
    r.fulfill({ json: paginated(EXCHANGE_RATES) }),
  );
  // Balance-sheet list: path predicate to match with or without query params
  await page.route(
    (url) => url.pathname === '/api/v1/finance/balance-sheets/',
    (r) => r.fulfill({ json: paginated(SHEETS) }),
  );
  for (const sh of SHEETS) {
    await page.route(`**/api/v1/finance/balance-sheets/${sh.id}/balances/**`, (r) =>
      r.fulfill({ json: BALANCES_SH001 }),
    );
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Screenshots — 011-ui-fixes-enhancements', () => {

  // Fix 1: Hyperlink View/Edit/New buttons
  test('01-balance-sheet-list-hyperlink-buttons', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByRole('heading', { name: 'Balance Sheets' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('01-balance-sheet-list-hyperlink-buttons.png') });
  });

  // Fix 2: Amount input — right-aligned, empty default, InputNumber
  test('02-balance-sheet-new-amount-input', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets/new');
    await expect(page.getByText('CTBC Bank')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('02-balance-sheet-new-amount-input.png') });
  });

  // Fix 4: Tab labels i18n — zh-TW shows correct translated tab names
  test('03-balance-sheet-list-tabs-zh', async ({ page }) => {
    await setLocale(page, 'zh-TW');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByText('淨值曲線')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: ss('03-balance-sheet-list-tabs-zh.png') });
  });

  // Fix 4: Detail page tabs in zh-TW
  test('04-balance-sheet-detail-tabs-zh', async ({ page }) => {
    await setLocale(page, 'zh-TW');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets/sh001');
    await expect(page.getByText('資產/負債')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('04-balance-sheet-detail-tabs-zh.png') });
  });

  // Fix 3: Side menu expanded — overlay anchored to viewport (scroll position)
  test('05-side-menu-expanded-overlay', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByRole('heading', { name: 'Balance Sheets' })).toBeVisible({ timeout: 15_000 });
    // Scroll down to demonstrate overlay stays anchored
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(300);
    // Find and click the ProLayout sider toggle button
    const toggle = page.locator('[class*="collapsedButton"], .ant-layout-sider-trigger').first();
    if (await toggle.count() > 0) {
      await toggle.click();
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: ss('05-side-menu-expanded-overlay.png') });
  });

  // Fix 6: Accounts page — datetime shown directly, no tooltip wrapper
  test('06-accounts-datetime-direct', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/accounts');
    await expect(page.getByText('CTBC Bank')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('06-accounts-datetime-direct.png') });
  });

  // Fix 7: User dropdown right-aligned — show header with dropdown trigger
  test('07-user-dropdown-right-aligned', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets');
    await expect(page.getByRole('heading', { name: 'Balance Sheets' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    // Open user menu by clicking the username text in the header
    const userTrigger = page.locator('.ant-pro-global-header-right .ant-pro-avatar-container, .ant-pro-global-header .ant-pro-menu-item').last();
    if (await userTrigger.count() > 0) {
      await userTrigger.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: ss('07-user-dropdown-right-aligned.png') });
  });

  // Fix 5: Delete confirmation dialog (codified in constitution)
  test('08-delete-confirmation-dialog', async ({ page }) => {
    await setLocale(page, 'en-US');
    await mockFinance(page);
    await page.goto('/finance/balance-sheets');
    // Wait for View links — confirms rows are loaded
    await expect(page.getByRole('link', { name: 'View' }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);
    // Click the first Delete button
    await page.getByRole('button', { name: 'Delete' }).first().click();
    // Wait for the visible confirmation dialog (not the pre-rendered hidden modal)
    await expect(page.locator('.ant-modal-content').filter({ hasText: 'Delete Balance Sheet' })).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: ss('08-delete-confirmation-dialog.png') });
  });
});
