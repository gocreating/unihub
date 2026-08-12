/**
 * Screenshot capture spec for PR 016-entity-views.
 * Playwright with FULLY MOCKED APIs and fictional data — PR screenshots must
 * never show real personal records. Covers the view tab row (always visible),
 * the per-tab menu, the unsaved indicator with Reset changes, the row kebab
 * with its Open submenu, the Rename dialog, the delete confirmation, and the
 * scrollbar-free strip with edge shadows.
 */

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '016-entity-views';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

test.use({ deviceScaleFactor: 2 });

// ── Mock data (fictional) ──────────────────────────────────────────────────────

const T0 = '2026-07-12T09:00:00Z';

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', is_base_currency: false },
];

const DEFS = [
  ['ad-color', 'color', 'text', '', '🎨'],
  ['ad-weight', 'weight', 'dimension', 'weight', '⚖'],
  ['ad-volume', 'volume', 'dimension', 'volume', '🧴'],
].map(([id, name, data_type, unit_family, emoji], i) => ({
  id,
  content_type: 7,
  content_type_label: 'inventory.item',
  name,
  data_type,
  unit_family,
  is_system: true,
  display_order: i,
  options: [],
  emoji,
}));

function param(defId: string, value: string, unit = '', num: string | null = null) {
  const d = DEFS.find((x) => x.id === defId)!;
  return {
    definition_id: d.id,
    name: d.name,
    data_type: d.data_type,
    unit_family: d.unit_family,
    emoji: d.emoji,
    value,
    unit,
    value_number: num,
    value_number_max: null,
  };
}

const ACQ_A = {
  id: 'acq-a',
  source: 'Outdoor Gear Shop',
  request_time: '2026-07-08T10:00:00Z',
  obtained_at: T0,
  net_cost: [{ currency: 'TWD', total: '3170.0000' }],
};
const ACQ_B = {
  id: 'acq-b',
  source: 'Kanto Coffee Lab',
  request_time: '2026-07-10T10:00:00Z',
  obtained_at: null,
  net_cost: [{ currency: 'JPY', total: '5800.0000' }],
};

function item(
  id: string,
  name: string,
  opts: {
    spec?: string;
    sku?: string | null;
    cur?: string;
    params?: ReturnType<typeof param>[];
    acq?: typeof ACQ_A | null;
  } = {},
) {
  return {
    id,
    name,
    alias_name: '',
    quantity: 1,
    spec: opts.spec ?? '',
    remark: '',
    sku_price: opts.sku ?? null,
    sku_price_currency: opts.cur ?? (opts.sku ? 'TWD' : ''),
    total_price: opts.sku ?? null,
    url: '',
    status: 'active',
    deprecated: false,
    deprecate_time: null,
    parameters: opts.params ?? [],
    acquisition: opts.acq ?? null,
    created_at: T0,
    updated_at: T0,
  };
}

const ACQS = [
  {
    id: 'acq-a',
    source: 'Outdoor Gear Shop',
    request_time: ACQ_A.request_time,
    obtained_at: T0,
    remark: 'Summer sale',
    cost_factors: [
      {
        id: 'cf-a1',
        value: '3170.0000',
        currency: 'TWD',
        type: 'accumulated',
        display_order: 0,
        user_managed: false,
      },
    ],
    net_cost: ACQ_A.net_cost,
    items: [
      item('it-pack', 'Trailblazer 45L Backpack', {
        spec: 'Forest green / roll-top',
        sku: '2480.0000',
        params: [param('ad-weight', '1.2', 'kg', '1200.0000')],
        acq: ACQ_A,
      }),
      item('it-mug', 'Titanium Camp Mug', {
        spec: 'Single-wall, foldable handles',
        sku: '690.0000',
        params: [param('ad-volume', '450', 'mL', '450.0000'), param('ad-color', 'Matte silver')],
        acq: ACQ_A,
      }),
    ],
    item_count: 2,
    created_at: T0,
    updated_at: T0,
  },
  {
    id: 'acq-b',
    source: 'Kanto Coffee Lab',
    request_time: ACQ_B.request_time,
    obtained_at: null,
    remark: 'Pre-order — ships next week',
    cost_factors: [
      {
        id: 'cf-b1',
        value: '5800.0000',
        currency: 'JPY',
        type: 'accumulated',
        display_order: 0,
        user_managed: false,
      },
    ],
    net_cost: ACQ_B.net_cost,
    items: [
      item('it-kettle', 'Pour-over Kettle 900 mL', {
        spec: 'Gooseneck spout',
        sku: '5800.0000',
        cur: 'JPY',
        params: [param('ad-color', 'Matte black')],
        acq: ACQ_B,
      }),
    ],
    item_count: 1,
    created_at: T0,
    updated_at: T0,
  },
];

/** Saved views for the catalog. A stored config of empty facets equals the
 *  page baseline, so every tab opens clean — the indicator only appears once
 *  something is actually changed. */
function view(
  id: string,
  name: string,
  opts: { pinned?: boolean; position?: number; is_default?: boolean } = {},
) {
  return {
    id,
    table_key: 'inventory-catalog',
    name,
    config: { filters: [], sort: [], columns: [], pageSize: 25 },
    pinned: opts.pinned ?? false,
    position: opts.position ?? 0,
    is_default: opts.is_default ?? false,
    created_at: T0,
    updated_at: T0,
  };
}

const VIEWS = [
  view('view-default1', 'Table', { pinned: true, position: 0, is_default: true }),
  view('view-recent01', 'Recent acquisitions', { pinned: true, position: 1 }),
  view('view-kitchen1', 'Kitchen gear', { pinned: true, position: 2 }),
  view('view-archive1', 'Archive 2025', { pinned: false, position: 3 }),
];

function paginated(results: unknown[], totals?: Record<string, number>) {
  return { count: results.length, next: null, previous: null, results, ...(totals ? { totals } : null) };
}

async function mockApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem('unihub-locale', 'en-US'));
  await page.route('**/api/**', (r) => r.fulfill({ json: paginated([]) }));
  await page.route('**/api/v1/auth/me/**', (r) =>
    r.fulfill({ json: { id: 1, username: 'demo', is_staff: true } }),
  );
  await page.route('**/api/v1/finance/currencies/**', (r) =>
    r.fulfill({ json: paginated(CURRENCIES) }),
  );
  // Plain array — the definitions endpoint is NOT paginated.
  await page.route('**/api/v1/core/attribute-definitions/**', (r) => r.fulfill({ json: DEFS }));
  await page.route('**/api/v1/inventory/sources/**', (r) => r.fulfill({ json: [] }));
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/acquisitions/',
    (r) => r.fulfill({ json: paginated(ACQS, { acquisitions: 2, items: 3 }) }),
  );
  // Entity views — a plain array; writes are accepted but never persisted.
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/core/entity-views'),
    (r) => {
      if (r.request().method() === 'GET') return r.fulfill({ json: VIEWS });
      return r.fulfill({ json: VIEWS[0] });
    },
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

/** Open the catalog and wait for both the table and the complete tab row. */
async function openCatalog(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 860 });
  await page.goto('/inventory/catalog');
  await expect(page.getByText('Trailblazer 45L Backpack')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('view-tabs-row')).toBeVisible();
  await expect(page.getByTestId('view-tabs-strip').getByRole('tab')).toHaveCount(3);
  await page.waitForTimeout(600);
}

const row = (page: Page) => page.getByTestId('view-tabs-row');

// ── Tests ──────────────────────────────────────────────────────────────────────

// The row itself: pinned views open as tabs beside the default "Table" tab,
// and the row is always visible (round 13 withdrew the auto-hide).
test('01 view row: saved views as tabs above the toolbar', async ({ page }) => {
  await openCatalog(page);
  await page.screenshot({ path: ss('01-view-row-tabs.png') });
});

// Left-clicking the ACTIVE tab opens its own menu (right-click opens it on any
// tab). Every action addresses THAT tab, not whichever one is active.
test('02 tab menu: every action addresses this tab', async ({ page }) => {
  await openCatalog(page);
  await row(page).getByRole('tab').first().click();
  await expect(page.getByRole('menuitem', { name: 'Set as default' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ss('02-tab-menu.png') });
});

// Changing the table marks that tab unsaved; Reset changes (enabled only while
// dirty) puts it back without touching what is stored.
test('03 unsaved indicator and Reset changes', async ({ page }) => {
  await openCatalog(page);

  await page.getByText('25 / page').first().click();
  await page.getByTitle('50 / page').click();
  await expect(row(page).getByLabel('Unsaved changes').first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: ss('03-unsaved-indicator.png') });

  await row(page).getByRole('tab').first().click();
  await expect(page.getByRole('menuitem', { name: 'Reset changes' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ss('04-reset-changes.png') });
});

// The kebab at the row's right edge: add a blank view, or open one that is not
// currently a tab.
test('04 view kebab: add empty view, open an existing one', async ({ page }) => {
  await openCatalog(page);
  await row(page).getByLabel('View menu').click();
  await expect(page.getByRole('menuitem', { name: 'Add empty view' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: ss('05-view-kebab.png') });

  await page.getByRole('menuitem', { name: 'Open' }).hover();
  await expect(page.getByRole('menuitem', { name: 'Archive 2025' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ss('06-view-kebab-open-submenu.png') });
});

// Rename opens a prefilled dialog (round 4 replaced the inline input).
test('05 rename dialog', async ({ page }) => {
  await openCatalog(page);
  await row(page).getByRole('tab').first().click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await expect(page.getByLabel('View name')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ss('07-rename-dialog.png') });
});

// Deleting a view is gated by the shared confirmation dialog — Cancel LEFT of
// the danger action, per the constitution.
test('06 delete confirmation', async ({ page }) => {
  await openCatalog(page);
  await row(page).getByRole('tab', { name: 'Kitchen gear' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.locator('[data-testid="confirm-dialog-footer"]')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ss('08-delete-confirmation.png') });
});

// A narrow viewport: the strip scrolls with NO scrollbar, and an edge shadow
// hints at the tabs scrolled out of view.
test('07 tab strip: no scrollbar, edge shadows', async ({ page }) => {
  await openCatalog(page);
  for (let i = 0; i < 4; i += 1) {
    await row(page).getByLabel('View menu').click();
    await page.getByRole('menuitem', { name: 'Add empty view' }).click();
  }
  await page.setViewportSize({ width: 560, height: 860 });

  const strip = page.getByTestId('view-tabs-strip');
  await expect
    .poll(async () => strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1))
    .toBe(true);
  await strip.evaluate((el) => {
    el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(page.getByTestId('view-tabs-shadow-left')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: ss('09-tab-strip-overflow.png') });
});
