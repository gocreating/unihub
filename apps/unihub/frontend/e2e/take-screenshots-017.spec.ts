/**
 * Screenshot capture spec for PR 017-multiple-sticky-columns.
 * Playwright with FULLY MOCKED APIs and fictional data — PR screenshots must
 * never show real personal records. Covers: per-row pin buttons in the Columns
 * panel, multiple left-pinned columns during horizontal scroll, pins on both
 * sides at once, and the catalog's seeded default pins (caret left, Actions
 * right).
 */

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '017-multiple-sticky-columns';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) { return path.join(OUT_DIR, name); }

test.use({ deviceScaleFactor: 2 });

// ── Mock data (fictional) ──────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', is_base_currency: false },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', is_base_currency: false },
];

const T0 = '2026-07-12T09:00:00Z';

const ACCOUNTS = [
  ['ac-1', 'Everyday Checking', 'TWD', '#2196f3', '2023-02-01T09:00:00Z'],
  ['ac-2', 'Rainy-day Savings', 'TWD', '#4caf50', '2023-02-01T09:05:00Z'],
  ['ac-3', 'Travel Fund', 'JPY', '#ff9800', '2024-05-12T08:30:00Z'],
  ['ac-4', 'Brokerage Cash', 'USD', '#9c27b0', '2024-11-03T10:00:00Z'],
  ['ac-5', 'Household Wallet', 'TWD', '', '2025-01-20T12:00:00Z'],
  ['ac-6', 'Gift Card Pool', 'TWD', '#795548', '2025-06-15T15:00:00Z'],
  ['ac-7', 'Coffee Club Prepaid', 'JPY', '#607d8b', '2026-01-08T09:00:00Z'],
  ['ac-8', 'Emergency Reserve', 'USD', '#f44336', '2026-03-01T09:00:00Z'],
].map(([id, name, currency, color, open_datetime]) => ({
  id, name, currency, color, open_datetime,
  close_datetime: null, created_at: T0, updated_at: T0,
}));

// Slim inventory catalog fixtures (fictional gear, no real records).
const DEFS = [
  ['ad-color', 'color', 'text', '', '🎨'],
  ['ad-size', 'size', 'text', '', '👕'],
  ['ad-weight', 'weight', 'dimension', 'weight', '⚖'],
  ['ad-volume', 'volume', 'dimension', 'volume', '🧴'],
].map(([id, name, data_type, unit_family, emoji], i) => ({
  id, content_type: 7, content_type_label: 'inventory.item', name, data_type,
  unit_family, is_system: true, display_order: i, options: [], emoji,
}));

function param(defId: string, value: string, unit = '', num: string | null = null) {
  const d = DEFS.find((x) => x.id === defId)!;
  return {
    definition_id: d.id, name: d.name, data_type: d.data_type,
    unit_family: d.unit_family, emoji: d.emoji, value, unit,
    value_number: num, value_number_max: null,
  };
}

const ACQ_A_SUMMARY = {
  id: 'acq-a', source: 'Outdoor Gear Shop', request_time: '2026-07-08T10:00:00Z',
  obtained_at: T0, net_cost: [{ currency: 'TWD', total: '3170.0000' }],
};
const ACQ_B_SUMMARY = {
  id: 'acq-b', source: 'Kanto Coffee Lab', request_time: '2026-07-10T10:00:00Z',
  obtained_at: null, net_cost: [{ currency: 'JPY', total: '5800.0000' }],
};

function item(
  id: string, name: string,
  opts: {
    spec?: string; remark?: string; quantity?: number; sku?: string | null;
    cur?: string; params?: ReturnType<typeof param>[];
    acq?: typeof ACQ_A_SUMMARY | null;
  } = {},
) {
  return {
    id, name, alias_name: '', quantity: opts.quantity ?? 1,
    spec: opts.spec ?? '', remark: opts.remark ?? '',
    sku_price: opts.sku ?? null, sku_price_currency: opts.cur ?? (opts.sku ? 'TWD' : ''),
    total_price: opts.sku ?? null, url: '',
    status: 'active', deprecated: false, deprecate_time: null,
    parameters: opts.params ?? [], acquisition: opts.acq ?? null,
    created_at: T0, updated_at: T0,
  };
}

const PACK = item('it-pack', 'Trailblazer 45L Backpack', {
  spec: 'Forest green / roll-top', sku: '2480.0000',
  params: [param('ad-weight', '1.2', 'kg', '1200.0000'), param('ad-volume', '45', 'L', '45000.0000')],
  acq: ACQ_A_SUMMARY,
});
const MUG = item('it-mug', 'Titanium Camp Mug', {
  spec: 'Single-wall, foldable handles', sku: '690.0000',
  params: [param('ad-volume', '450', 'mL', '450.0000'), param('ad-color', 'Matte silver')],
  acq: ACQ_A_SUMMARY,
});
const KETTLE = item('it-kettle', 'Pour-over Kettle 900 mL', {
  spec: 'Gooseneck spout', sku: '5800.0000', cur: 'JPY',
  params: [param('ad-volume', '900', 'mL', '900.0000'), param('ad-color', 'Matte black')],
  acq: ACQ_B_SUMMARY,
});

const ACQS = [
  {
    id: 'acq-a', source: 'Outdoor Gear Shop', request_time: ACQ_A_SUMMARY.request_time,
    obtained_at: T0, remark: 'Summer sale',
    cost_factors: [{ id: 'cf-a1', value: '3170.0000', currency: 'TWD', type: 'accumulated', display_order: 0 }],
    net_cost: ACQ_A_SUMMARY.net_cost, items: [PACK, MUG], item_count: 2,
    created_at: T0, updated_at: T0,
  },
  {
    id: 'acq-b', source: 'Kanto Coffee Lab', request_time: ACQ_B_SUMMARY.request_time,
    obtained_at: null, remark: 'Pre-order — ships next week',
    cost_factors: [{ id: 'cf-b1', value: '5800.0000', currency: 'JPY', type: 'accumulated', display_order: 0 }],
    net_cost: ACQ_B_SUMMARY.net_cost, items: [KETTLE], item_count: 1,
    created_at: T0, updated_at: T0,
  },
];

function paginated(results: unknown[], totals?: Record<string, number>) {
  return { count: results.length, next: null, previous: null, results, ...(totals ? { totals } : null) };
}

async function mockApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem('unihub-locale', 'en-US'));
  // Catch-all first — later, more specific routes take precedence.
  await page.route('**/api/**', (r) => r.fulfill({ json: paginated([]) }));
  await page.route('**/api/v1/auth/me/**', (r) =>
    r.fulfill({ json: { id: 1, username: 'demo', is_staff: true } }),
  );
  await page.route('**/api/v1/finance/currencies/**', (r) =>
    r.fulfill({ json: paginated(CURRENCIES) }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/finance/accounts/',
    (r) => r.fulfill({ json: paginated(ACCOUNTS) }),
  );
  // Plain array — the definitions endpoint is NOT paginated.
  await page.route('**/api/v1/core/attribute-definitions/**', (r) =>
    r.fulfill({ json: DEFS }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/acquisitions/',
    (r) => r.fulfill({ json: paginated(ACQS, { acquisitions: 2, items: 3 }) }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

async function openColumnPanel(page: Page) {
  await page.click('button:has-text("Columns")');
  await page.waitForSelector('[data-column-row] [data-sticky-pin]', { timeout: 5_000 });
}

async function clickPin(page: Page, colKey: string, side: 'left' | 'right') {
  await page.click(`[data-column-row="${colKey}"] [data-sticky-pin="${side}"]`);
}

async function applyPanel(page: Page) {
  const applyBtn = page.locator('button:has-text("Apply")').last();
  await expect(applyBtn).toBeEnabled({ timeout: 2_000 });
  await applyBtn.click();
  await page.waitForTimeout(600);
}

async function scrollTable(page: Page, x: number) {
  await page.evaluate((sx) => {
    const body = document.querySelector<HTMLElement>('.ant-table-body');
    if (body) body.scrollLeft = sx;
  }, x);
  await page.waitForTimeout(400);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('01 columns panel: per-row pin buttons with applied pins', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('/finance/accounts');
  await expect(page.getByText('Everyday Checking')).toBeVisible({ timeout: 15_000 });

  await openColumnPanel(page);
  await clickPin(page, 'name', 'left');
  await clickPin(page, 'currency', 'left');
  await clickPin(page, 'actions', 'right');
  await applyPanel(page);

  // Reopen so the panel shows the ACTIVE pin state (filled blue pushpins).
  await openColumnPanel(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: ss('01-columns-panel-per-row-pins.png') });
});

test('02 accounts: two left-pinned columns during horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 760 });
  await page.goto('/finance/accounts');
  await expect(page.getByText('Everyday Checking')).toBeVisible({ timeout: 15_000 });

  await openColumnPanel(page);
  await clickPin(page, 'name', 'left');
  await clickPin(page, 'currency', 'left');
  await applyPanel(page);

  await scrollTable(page, 260);
  await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-left').first()).toBeVisible();
  await page.screenshot({ path: ss('02-two-left-pins-scrolled.png') });
});

test('03 accounts: pins on both sides — only the middle scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 760 });
  await page.goto('/finance/accounts');
  await expect(page.getByText('Everyday Checking')).toBeVisible({ timeout: 15_000 });

  await openColumnPanel(page);
  await clickPin(page, 'name', 'left');
  await clickPin(page, 'currency', 'left');
  await clickPin(page, 'actions', 'right');
  await applyPanel(page);

  await scrollTable(page, 200);
  await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-right').first()).toBeVisible();
  await page.screenshot({ path: ss('03-both-sides-pinned-scrolled.png') });
});

test('04 catalog: seeded default pins (caret left, Actions right)', async ({ page }) => {
  await page.setViewportSize({ width: 860, height: 780 });
  await page.goto('/inventory/catalog');
  await expect(page.getByText('Trailblazer 45L Backpack')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);

  await scrollTable(page, 180);
  await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-left').first()).toBeVisible();
  await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-right').first()).toBeVisible();
  await page.screenshot({ path: ss('04-catalog-default-pins-scrolled.png') });
});
