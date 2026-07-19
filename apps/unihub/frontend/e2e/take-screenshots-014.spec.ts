/**
 * Screenshot capture spec for PR 014-inventory-app.
 * Playwright with FULLY MOCKED APIs and fictional data — PR screenshots must
 * never show real personal records. Covers: catalog tree + parameter badges,
 * deprecate-modal preview, acquisition edit, scenario list/detail organize
 * panes, and the Add-items modal.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '014-inventory-app';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) { return path.join(OUT_DIR, name); }

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// ── Mock data (fictional) ──────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', is_base_currency: false },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', is_base_currency: false },
];

const DEFS = [
  ['ad-color', 'color', 'text', '', '🎨'],
  ['ad-size', 'size', 'text', '', '👕'],
  ['ad-weight', 'weight', 'dimension', 'weight', '⚖'],
  ['ad-length', 'length', 'dimension', 'length', '📏'],
  ['ad-width', 'width', 'dimension', 'length', '📏'],
  ['ad-height', 'height', 'dimension', 'length', '📏'],
  ['ad-volume', 'volume', 'dimension', 'volume', '🧴'],
  ['ad-temperature', 'temperature', 'dimension', 'temperature', '🌡'],
].map(([id, name, data_type, unit_family, emoji], i) => ({
  id, content_type: 7, content_type_label: 'inventory.item', name, data_type,
  unit_family, is_system: true, display_order: i, options: [], emoji,
}));

function param(defId: string, value: string, unit = '', num: string | null = null, max: string | null = null) {
  const d = DEFS.find((x) => x.id === defId)!;
  return {
    definition_id: d.id, name: d.name, data_type: d.data_type,
    unit_family: d.unit_family, emoji: d.emoji, value, unit,
    value_number: num, value_number_max: max,
  };
}

const T0 = '2026-07-12T09:00:00Z';

function item(
  id: string, name: string,
  opts: {
    spec?: string; remark?: string; quantity?: number; sku?: string | null;
    cur?: string; url?: string; params?: ReturnType<typeof param>[];
    acq?: { id: string; source: string; request_time: string | null; obtained_at: string | null; net_cost: { currency: string; total: string }[] } | null;
  } = {},
) {
  return {
    id, name, alias_name: '', quantity: opts.quantity ?? 1,
    spec: opts.spec ?? '', remark: opts.remark ?? '',
    sku_price: opts.sku ?? null, sku_price_currency: opts.cur ?? (opts.sku ? 'TWD' : ''),
    total_price: opts.sku ?? null, url: opts.url ?? '',
    status: 'active', deprecated: false, deprecate_time: null,
    parameters: opts.params ?? [], acquisition: opts.acq ?? null,
    created_at: T0, updated_at: T0,
  };
}

const ACQ_A_SUMMARY = {
  id: 'acq-a', source: 'Outdoor Gear Shop', request_time: '2026-07-08T10:00:00Z',
  obtained_at: T0, net_cost: [{ currency: 'TWD', total: '3980.0000' }],
};
const ACQ_B_SUMMARY = {
  id: 'acq-b', source: 'Home Essentials Mart', request_time: null,
  obtained_at: '2026-07-05T14:00:00Z', net_cost: [{ currency: 'TWD', total: '760.0000' }],
};
const ACQ_C_SUMMARY = {
  id: 'acq-c', source: 'Kanto Coffee Lab', request_time: '2026-07-15T08:00:00Z',
  obtained_at: null, net_cost: [{ currency: 'JPY', total: '5800.0000' }],
};

const BACKPACK = item('it-pack', 'Trailblazer 45L Backpack', {
  spec: 'Forest green / roll-top', sku: '2480.0000', url: 'https://example.com/pack',
  params: [
    param('ad-weight', '1.2', 'kg', '1200.0000'),
    param('ad-length', '30', 'cm', '300.0000'),
    param('ad-width', '26', 'cm', '260.0000'),
    param('ad-height', '55', 'cm', '550.0000'),
    param('ad-volume', '45', 'L', '45000.0000'),
  ],
  acq: ACQ_A_SUMMARY,
});
const MUG = item('it-mug', 'Titanium Camp Mug', {
  spec: 'Single-wall, foldable handles', sku: '690.0000',
  params: [param('ad-volume', '450', 'mL', '450.0000'), param('ad-weight', '68', 'g', '68.0000')],
  acq: ACQ_A_SUMMARY,
});
const SHELL_JACKET = item('it-shell', 'Packable Rain Shell', {
  spec: 'DWR coated', remark: 'Runs small — size up', sku: '810.0000',
  params: [param('ad-size', 'L'), param('ad-color', 'Slate blue')],
  acq: ACQ_A_SUMMARY,
});
const STORAGE_BOX = item('it-box', 'Foldable Storage Box 21L', {
  spec: 'Stackable lid', quantity: 2, sku: '380.0000',
  params: [
    param('ad-length', '40', 'cm', '400.0000'),
    param('ad-width', '28', 'cm', '280.0000'),
    param('ad-height', '24', 'cm', '240.0000'),
    param('ad-volume', '21', 'L', '21000.0000'),
    param('ad-temperature', '-20~110', '°C', '-20.0000', '110.0000'),
  ],
  acq: ACQ_B_SUMMARY,
});
const KETTLE = item('it-kettle', 'Pour-over Kettle 900 mL', {
  spec: 'Gooseneck spout', sku: '5800.0000', cur: 'JPY',
  params: [param('ad-volume', '900', 'mL', '900.0000'), param('ad-color', 'Matte black')],
  acq: ACQ_C_SUMMARY,
});

const ITEMS = [BACKPACK, MUG, SHELL_JACKET, STORAGE_BOX, KETTLE];

const ACQS = [
  {
    id: 'acq-a', source: 'Outdoor Gear Shop', request_time: ACQ_A_SUMMARY.request_time,
    obtained_at: T0, remark: 'Summer sale — member discount applied',
    cost_factors: [{ id: 'cf-a1', value: '3980.0000', currency: 'TWD', type: 'accumulated', display_order: 0 }],
    net_cost: ACQ_A_SUMMARY.net_cost, items: [BACKPACK, MUG, SHELL_JACKET], item_count: 3,
    created_at: T0, updated_at: T0,
  },
  {
    id: 'acq-b', source: 'Home Essentials Mart', request_time: null,
    obtained_at: ACQ_B_SUMMARY.obtained_at, remark: '',
    cost_factors: [{ id: 'cf-b1', value: '760.0000', currency: 'TWD', type: 'accumulated', display_order: 0 }],
    net_cost: ACQ_B_SUMMARY.net_cost, items: [STORAGE_BOX], item_count: 1,
    created_at: T0, updated_at: T0,
  },
  {
    id: 'acq-c', source: 'Kanto Coffee Lab', request_time: ACQ_C_SUMMARY.request_time,
    obtained_at: null, remark: 'Pre-order — ships next week',
    cost_factors: [
      { id: 'cf-c1', value: '5300.0000', currency: 'JPY', type: 'accumulated', display_order: 0 },
      { id: 'cf-c2', value: '500.0000', currency: 'JPY', type: 'shipping', display_order: 1 },
    ],
    net_cost: ACQ_C_SUMMARY.net_cost, items: [KETTLE], item_count: 1,
    created_at: T0, updated_at: T0,
  },
];

const SCENARIOS = [
  { id: 'sc-camp', name: 'Weekend Camping', description: 'Two-day mountain trip', item_count: 4, created_at: T0, updated_at: T0 },
  { id: 'sc-trip', name: 'Business Trip', description: 'Carry-on only', item_count: 0, created_at: T0, updated_at: T0 },
  { id: 'sc-beach', name: 'Beach Day', description: '', item_count: 0, created_at: T0, updated_at: T0 },
];

const SCENARIO_ITEMS = [
  { id: 'si-pack', item: BACKPACK, container: null, display_order: 0, organized: true, notes: '', created_at: T0 },
  { id: 'si-mug', item: MUG, container: { id: 'si-pack', item_name: BACKPACK.name }, display_order: 0, organized: true, notes: '', created_at: T0 },
  { id: 'si-shell', item: SHELL_JACKET, container: { id: 'si-pack', item_name: BACKPACK.name }, display_order: 1, organized: true, notes: '', created_at: T0 },
  { id: 'si-kettle', item: KETTLE, container: null, display_order: 0, organized: false, notes: '', created_at: T0 },
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
  await page.route('**/api/v1/core/attribute-definitions/**', (r) =>
    r.fulfill({ json: DEFS }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/acquisitions/',
    (r) => r.fulfill({ json: paginated(ACQS, { acquisitions: 3, items: 5 }) }),
  );
  await page.route('**/api/v1/inventory/acquisitions/acq-a/**', (r) =>
    r.fulfill({ json: ACQS[0] }),
  );
  await page.route('**/api/v1/inventory/acquisitions/sources/**', (r) =>
    r.fulfill({ json: ACQS.map((a) => a.source) }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/items/',
    (r) => r.fulfill({ json: paginated(ITEMS) }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/scenarios/',
    (r) => r.fulfill({ json: paginated(SCENARIOS) }),
  );
  await page.route('**/api/v1/inventory/scenarios/sc-camp/', (r) =>
    r.fulfill({ json: SCENARIOS[0] }),
  );
  await page.route('**/api/v1/inventory/scenarios/sc-camp/items/**', (r) =>
    r.fulfill({ json: SCENARIO_ITEMS }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test('01+02+03 catalog: overview, badges, deprecate preview', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await expect(page.getByText('Trailblazer 45L Backpack')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ss('01-catalog-overview.png') });


  // Deprecate modal with the item preview (FR-003c).
  const depBtn = page.locator('tr.ant-table-row button', { hasText: 'Deprecate' }).first();
  await depBtn.click();
  await expect(page.getByTestId('deprecate-preview')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(600);
  await page.locator('.ant-modal-content').first().screenshot({ path: ss('03-deprecate-modal-preview.png') });
});

test('04 acquisition edit: item cards + cost factors', async ({ page }) => {
  await page.goto('/inventory/acquisitions/acq-a/edit');
  await expect(page.getByText('Titanium Camp Mug')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ss('04-acquisition-edit.png') });
});

test('05+06+07 scenarios: list, organize panes, add modal', async ({ page }) => {
  await page.goto('/inventory/scenarios');
  await expect(page.getByText('Weekend Camping')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('05-scenario-list.png') });

  await page.getByText('Weekend Camping').click();
  await expect(page.locator('.ant-splitter')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Pour-over Kettle 900 mL').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: ss('06-scenario-organize.png') });

  // Close-up of a full parameter-badge row (emoji ink centering) — the
  // backpack's five badges on the organize row, where no sticky column clips.
  const badgeRow = page
    .locator('[data-testid^="org-row-"] .ant-space:has([data-testid="key-emoji"])')
    .filter({ hasText: 'Height: 55 cm' })
    .first();
  await badgeRow.screenshot({ path: ss('02-parameter-badges.png') });

  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(modal.locator('.ant-list-item').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('07-scenario-add-modal.png') });
});
