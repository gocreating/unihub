/**
 * Screenshot capture spec for PR 019-quick-search.
 * Playwright with FULLY MOCKED APIs and fictional data — PR screenshots must
 * never show real personal records. Covers the toolbar search input (stretched
 * to fill the row after the Columns button), live narrowing with <mark>
 * highlighting on the currencies table, and a catalog search matching only a
 * dynamic parameter value (flat mode, marks inside the parameter tags) with
 * the view row visibly clean (no unsaved dot) and the URL param-free.
 *
 * Run against a server serving the CURRENT build (the :3001 docker container
 * may be stale):  pnpm preview  →  BASE_URL=http://localhost:4173 \
 *   pnpm exec playwright test e2e/take-screenshots-019.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const BRANCH = '019-quick-search';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

// CHROMIUM_PATH: escape hatch for machines where the pinned browser build is
// absent and the proxy blocks `playwright install` (round-9 precedent) —
// point it at any installed chromium, e.g.
// ~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
const EXEC = process.env['CHROMIUM_PATH'];
test.use({
  deviceScaleFactor: 2,
  ...(EXEC ? { launchOptions: { executablePath: EXEC } } : {}),
});

// ── Mock data (fictional) ─────────────────────────────────────────────────────

const T0 = '2026-07-12T09:00:00Z';

const CURRENCIES = [
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', is_base_currency: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', is_base_currency: false },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', is_base_currency: false },
  { code: 'EUR', name: 'Euro', symbol: '€', is_base_currency: false },
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

const ITEMS = [
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
  item('it-kettle', 'Pour-over Kettle 900 mL', {
    spec: 'Gooseneck spout',
    sku: '5800.0000',
    cur: 'JPY',
    params: [param('ad-color', 'Matte black')],
    acq: ACQ_B,
  }),
];

const ACQS = [
  {
    ...ACQ_A,
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
    items: [ITEMS[0], ITEMS[1]],
    item_count: 2,
    created_at: T0,
    updated_at: T0,
  },
  {
    ...ACQ_B,
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
    items: [ITEMS[2]],
    item_count: 1,
    created_at: T0,
    updated_at: T0,
  },
];

function paginated(results: unknown[], totals?: Record<string, number>) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
    ...(totals ? { totals } : null),
  };
}

/** The searchable text of a mock item — mirrors the server's union semantics
 *  (name/spec/parameter values) closely enough for the demo. */
function itemHaystack(it: (typeof ITEMS)[number]): string {
  return [it.name, it.spec, ...it.parameters.map((p) => `${p.value} ${p.unit}`)]
    .join(' ')
    .toLowerCase();
}

async function mockApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem('unihub-locale', 'en-US'));
  await page.route('**/api/**', (r) => r.fulfill({ json: paginated([]) }));
  await page.route('**/api/v1/auth/me/**', (r) =>
    r.fulfill({ json: { id: 1, username: 'demo', is_staff: true } }),
  );
  // Search-aware currencies list — the union across code/name/symbol.
  await page.route('**/api/v1/finance/currencies/**', (r) => {
    const url = new URL(r.request().url());
    const q = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const rows = q
      ? CURRENCIES.filter((c) => `${c.code} ${c.name} ${c.symbol}`.toLowerCase().includes(q))
      : CURRENCIES;
    r.fulfill({ json: paginated(rows) });
  });
  // Plain array — the definitions endpoint is NOT paginated.
  await page.route('**/api/v1/core/attribute-definitions/**', (r) => r.fulfill({ json: DEFS }));
  await page.route('**/api/v1/inventory/sources/**', (r) => r.fulfill({ json: [] }));
  // Tree mode (no search ever reaches this endpoint — R5).
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/acquisitions/',
    (r) => r.fulfill({ json: paginated(ACQS, { acquisitions: 2, items: 3 }) }),
  );
  // Flat mode — carries the search param while a query is active.
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/items/',
    (r) => {
      const url = new URL(r.request().url());
      const q = (url.searchParams.get('search') ?? '').trim().toLowerCase();
      const rows = q ? ITEMS.filter((it) => itemHaystack(it).includes(q)) : ITEMS;
      const acqs = new Set(rows.map((it) => it.acquisition?.id));
      r.fulfill({ json: paginated(rows, { acquisitions: acqs.size, items: rows.length }) });
    },
  );
  // Entity views — plain array, keyed by table.
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/core/entity-views'),
    (r) => {
      const url = new URL(r.request().url());
      if (url.searchParams.get('table_key') === 'inventory-catalog') {
        return r.fulfill({
          json: [
            {
              id: 'view-default1',
              table_key: 'inventory-catalog',
              name: 'Table',
              config: { filters: [], sort: [], columns: [], pageSize: 25 },
              pinned: true,
              position: 0,
              is_default: true,
              created_at: T0,
              updated_at: T0,
            },
          ],
        });
      }
      return r.fulfill({ json: [] });
    },
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1280, height: 800 });
});

const searchBox = (page: Page) => page.getByPlaceholder('Search');

// ── Tests ─────────────────────────────────────────────────────────────────────

// The toolbar gained a free-text search input after the Columns button,
// stretched to fill the row's remaining width (FR-001).
test('01 toolbar search input, stretched to the row edge', async ({ page }) => {
  await page.goto('/finance/currencies');
  await expect(page.getByText('New Taiwan Dollar')).toBeVisible({ timeout: 15_000 });
  await expect(searchBox(page)).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('01-search-input-toolbar.png') });
});

// Typing live-narrows the table (no Enter) and the matched fragment renders
// highlighted in every visible cell that contains it (FR-002/FR-007).
test('02 live narrowing with match highlighting', async ({ page }) => {
  await page.goto('/finance/currencies');
  await expect(page.getByText('Japanese Yen')).toBeVisible({ timeout: 15_000 });
  await searchBox(page).fill('dollar');
  await expect(page.locator('.ant-table-tbody mark').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Japanese Yen')).toBeHidden();
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('02-currencies-live-narrowing.png') });
});

// A query matching ONLY a dynamic parameter value still finds the rows: the
// catalog flattens (R5) and the marks land inside the parameter tags — while
// the view row stays clean (no unsaved dot) and the URL keeps no params.
test('03 catalog parameter-value match in flat mode', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await expect(page.getByText('Trailblazer 45L Backpack')).toBeVisible({ timeout: 15_000 });
  await searchBox(page).fill('matte');
  await expect(page.locator('.ant-table-tbody .ant-tag mark').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Trailblazer 45L Backpack')).toBeHidden();
  expect(new URL(page.url()).search).toBe('');
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('03-catalog-parameter-match.png') });
});
