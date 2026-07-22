/**
 * Screenshot capture spec for PR 018-inventory-enhancements.
 * Playwright with FULLY MOCKED APIs and fictional data — PR screenshots must
 * never show real personal records. Covers: catalog default pins (Toggle +
 * Acquisition left, Actions right) during horizontal scroll, the user-managed
 * accumulated cost line (cleared value survives item edits, Reset control),
 * and the length-parameter unit selector defaulting to cm.
 */

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '018-inventory-enhancements';
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

const DEFS = [
  ['ad-color', 'color', 'text', '', '🎨'],
  ['ad-length', 'length', 'dimension', 'length', '📏'],
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
  params: [param('ad-weight', '1.2', 'kg', '1200.0000'), param('ad-length', '74', 'cm', '740.0000')],
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
    cost_factors: [{ id: 'cf-a1', value: '3170.0000', currency: 'TWD', type: 'accumulated', display_order: 0, user_managed: false }],
    net_cost: ACQ_A_SUMMARY.net_cost, items: [PACK, MUG], item_count: 2,
    created_at: T0, updated_at: T0,
  },
  {
    id: 'acq-b', source: 'Kanto Coffee Lab', request_time: ACQ_B_SUMMARY.request_time,
    obtained_at: null, remark: 'Pre-order — ships next week',
    cost_factors: [{ id: 'cf-b1', value: '5800.0000', currency: 'JPY', type: 'accumulated', display_order: 0, user_managed: false }],
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
  // Plain array — the definitions endpoint is NOT paginated.
  await page.route('**/api/v1/core/attribute-definitions/**', (r) =>
    r.fulfill({ json: DEFS }),
  );
  // Plain array — the sources autocomplete endpoint is NOT paginated.
  await page.route('**/api/v1/inventory/sources/**', (r) => r.fulfill({ json: [] }));
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/acquisitions/',
    (r) => r.fulfill({ json: paginated(ACQS, { acquisitions: 2, items: 3 }) }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

async function scrollTable(page: Page, x: number) {
  await page.evaluate((sx) => {
    const body = document.querySelector<HTMLElement>('.ant-table-body');
    if (body) body.scrollLeft = sx;
  }, x);
  await page.waitForTimeout(400);
}

// Fill the seed item card via the modal: name, price, currency (no page save).
async function fillSeedCard(page: Page, name: string, price: string) {
  await page.locator('.ant-card-small .anticon-edit').first().click();
  const modal = page.locator('.ant-modal:visible').first();
  await modal.locator('input').first().fill(name);
  await modal.locator('.ant-input-number input').nth(1).fill(price);
  await modal.locator('.ant-select').first().click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'TWD' }).first().click();
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(500);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

// US3: fresh catalog — Toggle AND Acquisition pinned left by default, Actions
// right; mid-scroll shows all three holding their edges while Item/SKU scroll.
test('01 catalog: default pins (Toggle + Acquisition left) during scroll', async ({ page }) => {
  await page.setViewportSize({ width: 860, height: 780 });
  await page.goto('/inventory/catalog');
  await expect(page.getByText('Trailblazer 45L Backpack')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);

  await scrollTable(page, 200);
  const leftPinned = page.locator('.ant-table-thead th.ant-table-cell-fix-left');
  await expect(leftPinned).toHaveCount(2);
  await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-right').first()).toBeVisible();
  await page.screenshot({ path: ss('01-catalog-default-pins-scrolled.png') });
});

// US1: an untouched accumulated line auto-derives from item prices.
test('02 acquisition form: accumulated auto-derived from the item', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/inventory/acquisitions/new');
  await page.waitForSelector('.ant-card', { timeout: 15_000 });

  await fillSeedCard(page, 'Trailblazer 45L Backpack', '2480');
  const costCard = page.locator('.ant-card', { hasText: 'Cost' }).last();
  await expect(costCard.locator('.ant-input-number input').first()).toHaveValue('2480');
  await page.waitForTimeout(500);
  await page.screenshot({ path: ss('02-accumulated-auto-derived.png'), fullPage: true });
});

// US1: clearing the accumulated line makes it user-managed — a later item
// price edit (2480 → 2680) no longer recalculates it; Reset (↻) is the only
// way back to the derived sum.
test('03 acquisition form: cleared accumulated survives item edits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/inventory/acquisitions/new');
  await page.waitForSelector('.ant-card', { timeout: 15_000 });

  await fillSeedCard(page, 'Trailblazer 45L Backpack', '2480');
  const costCard = page.locator('.ant-card', { hasText: 'Cost' }).last();
  const accInput = costCard.locator('.ant-input-number input').first();
  await expect(accInput).toHaveValue('2480');

  // Clear → user-managed zero.
  await accInput.click();
  await accInput.press('ControlOrMeta+a');
  await accInput.press('Backspace');
  await accInput.blur();
  await expect(accInput).toHaveValue('0');

  // Edit the item's price — the cleared line must NOT move.
  await page.locator('.ant-card-small .anticon-edit').first().click();
  const modal = page.locator('.ant-modal:visible').first();
  await modal.locator('.ant-input-number input').nth(1).fill('2680');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(500);
  await expect(accInput).toHaveValue('0');
  await page.screenshot({ path: ss('03-accumulated-user-managed-zero.png'), fullPage: true });
});

// US2: picking a length-family parameter key pre-selects cm (was mm).
test('04 item modal: length parameter defaults to cm', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/inventory/acquisitions/new');
  await page.waitForSelector('.ant-card', { timeout: 15_000 });

  await page.locator('.ant-card-small .anticon-edit').first().click();
  const modal = page.locator('.ant-modal:visible').first();
  await modal.locator('input').first().fill('Trekking Pole');
  await modal.locator('button:has-text("Add parameter")').click();
  await modal.locator('.ant-select').last().click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: /length/i })
    .first()
    .click();
  await expect(modal.locator('.ant-select-selection-item[title="cm"]').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ss('04-length-parameter-defaults-cm.png') });
});
