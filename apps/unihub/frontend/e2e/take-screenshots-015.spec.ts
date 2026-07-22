/**
 * Screenshot capture spec for PR #015-data-migration-refinement.
 * Covers the graph-driven Sync tab: the bare commit rail (uniform badges,
 * single-line timestamps, kebab menus, load-more timeline node), the
 * uncommitted node's inline staged publish review, row-level staging,
 * checkout review, incompatible-commit gating, and the rewritten banner.
 * All API responses are mocked — no real data appears in any capture.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const BRANCH = '015-data-migration-refinement';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

// ── Shared mock data ──────────────────────────────────────────────────────────

const SHA_HEAD = 'a1b2c3d'.padEnd(40, '0');
const SHA_LOCAL = 'b2c3d4e'.padEnd(40, '0');
const SHA_INIT = 'c3d4e5f'.padEnd(40, '0');
const SHA_BAD = 'd4e5f6a'.padEnd(40, '0');
const DIGEST = 'e'.repeat(64);

const COMMITS = [
  {
    sha: SHA_HEAD,
    parents: [SHA_LOCAL],
    author_date: '2026-07-21T09:30:00Z',
    message: 'sync: 3 tables, 5 changes',
    is_remote_head: true,
    is_local_state: false,
    compatible: true,
    incompatible_reason: null,
  },
  {
    sha: SHA_LOCAL,
    parents: [SHA_INIT],
    author_date: '2026-07-19T18:12:00Z',
    message: 'sync: finance.account +1',
    is_remote_head: false,
    is_local_state: true,
    compatible: true,
    incompatible_reason: null,
  },
  {
    sha: SHA_INIT,
    parents: [SHA_BAD],
    author_date: '2026-07-15T08:00:00Z',
    message: 'sync: initial snapshot',
    is_remote_head: false,
    is_local_state: false,
    compatible: true,
    incompatible_reason: null,
  },
  {
    sha: SHA_BAD,
    parents: [],
    author_date: '2026-06-30T22:45:00Z',
    message: 'sync: legacy layout',
    is_remote_head: false,
    is_local_state: false,
    compatible: false,
    incompatible_reason: 'inventory.item: Missing required column: id:string.',
  },
];

const PUSH_PREVIEW = {
  status: 'has_changes',
  base_commit: SHA_HEAD,
  diff_digest: DIGEST,
  changes: [
    {
      table: 'finance.account',
      display_name: 'Accounts',
      added: 1,
      modified: 0,
      deleted: 0,
      is_new_table: false,
      rows: [
        {
          pk: 'acc006',
          operation: 'create',
          before: null,
          after: { 'id:string': 'acc006', 'name:text': 'Savings Account', 'currency:string': 'TWD' },
          changed_fields: [],
        },
      ],
    },
    {
      table: 'music.song',
      display_name: 'Songs',
      added: 2,
      modified: 0,
      deleted: 0,
      is_new_table: false,
      rows: [
        {
          pk: '1',
          operation: 'create',
          before: null,
          after: { 'title:text': 'Bohemian Rhapsody', 'artist:text': 'Queen' },
          changed_fields: [],
        },
        {
          pk: '2',
          operation: 'create',
          before: null,
          after: { 'title:text': 'Hotel California', 'artist:text': 'Eagles' },
          changed_fields: [],
        },
      ],
    },
  ],
};

const CHECKOUT_PREVIEW = {
  status: 'has_changes',
  base_commit: SHA_LOCAL,
  diff_digest: DIGEST,
  changes: [
    {
      table: 'finance.account',
      display_name: 'Accounts',
      added: 0,
      modified: 1,
      deleted: 0,
      rows: [
        {
          pk: 'acc001',
          operation: 'update',
          before: { 'name:text': 'CTBC Savings' },
          after: { 'name:text': 'CTBC Bank' },
          changed_fields: ['name:text'],
        },
      ],
    },
  ],
};

// ── Shared mocks ──────────────────────────────────────────────────────────────

async function mockAuth(page: Page) {
  await page.route('**/api/v1/auth/me/', (r) =>
    r.fulfill({ json: { id: 1, username: 'root', is_staff: true } }),
  );
}

async function mockSyncConfigured(page: Page) {
  await page.route('**/api/v1/sync/config/', (r) =>
    r.fulfill({
      json: {
        is_configured: true,
        repo_url: 'https://github.com/example/my-unihub-data',
        pat: null,
        last_published_at: '2026-07-21T09:30:00Z',
        last_published_commit: SHA_HEAD,
        last_applied_at: null,
        last_applied_commit: null,
        local_state_commit: SHA_LOCAL,
      },
    }),
  );
}

async function mockHistory(
  page: Page,
  opts: { hasLocalChanges?: boolean; rewritten?: boolean; hasMore?: boolean } = {},
) {
  await page.route('**/api/v1/sync/history/**', (r) =>
    r.fulfill({
      json: {
        commits: COMMITS,
        has_more: opts.hasMore ?? true,
        remote_head: SHA_HEAD,
        local_commit: SHA_LOCAL,
        has_local_changes: opts.hasLocalChanges ?? false,
        history_rewritten: opts.rewritten ?? false,
      },
    }),
  );
}

async function openSyncTab(page: Page) {
  // The io page loads the table registry on mount; an unmocked call fails
  // after retries and replaces the whole page with an error state.
  await page.route('**/api/v1/io/tables/', (r) =>
    r.fulfill({
      json: [
        { content_type_label: 'finance.account', display_name: 'Accounts', app_label: 'finance' },
        { content_type_label: 'music.song', display_name: 'Songs', app_label: 'music' },
      ],
    }),
  );
  await page.goto('/system/io');
  await page.getByText('Sync').click();
  await expect(page.getByText('a1b2c3d')).toBeVisible({ timeout: 15_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Screenshots — 015-data-migration-refinement', () => {
  // ── 01: The bare commit rail ───────────────────────────────────────────────

  test('01-commit-rail-overview', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page);
    await openSyncTab(page);
    await expect(page.getByText('Load more')).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('01-commit-rail-overview.png'), fullPage: false });
  });

  // ── 02: Uncommitted node renders the staged publish review inline ─────────

  test('02-uncommitted-inline-review', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page, { hasLocalChanges: true });
    await page.route('**/api/v1/sync/publish/preview/', (r) => r.fulfill({ json: PUSH_PREVIEW }));
    await openSyncTab(page);
    await expect(page.getByText('Publish Selected Changes')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('(music.song)')).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('02-uncommitted-inline-review.png'), fullPage: true });
  });

  // ── 03: Row-level staging — a whole table unstaged ────────────────────────

  test('03-staging-partial', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page, { hasLocalChanges: true });
    await page.route('**/api/v1/sync/publish/preview/', (r) => r.fulfill({ json: PUSH_PREVIEW }));
    await openSyncTab(page);
    await expect(page.getByText('Publish Selected Changes')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('checkbox', { name: 'Stage all: Songs' }).click();
    await expect(page.getByText('1 of 3 changes staged')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('03-staging-partial.png'), fullPage: true });
  });

  // ── 04: Per-node kebab menu ───────────────────────────────────────────────

  test('04-node-kebab-menu', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page);
    await openSyncTab(page);
    const localNode = page.getByTestId(`commit-node-${SHA_LOCAL}`);
    await localNode.getByRole('button', { name: 'Node actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Checkout' })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('04-node-kebab-menu.png'), fullPage: false });
  });

  // ── 05: Incompatible commit — dimmed node + tooltip reason ────────────────

  test('05-incompatible-tooltip', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page);
    await openSyncTab(page);
    await page.getByText('sync: legacy layout').hover();
    await expect(page.getByText(/Missing required column/)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('05-incompatible-tooltip.png'), fullPage: false });
  });

  // ── 06: Checkout review with overwrite warning + staging ──────────────────

  test('06-checkout-review', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page);
    await page.route('**/api/v1/sync/checkout/preview/**', (r) =>
      r.fulfill({ json: CHECKOUT_PREVIEW }),
    );
    await openSyncTab(page);
    const localNode = page.getByTestId(`commit-node-${SHA_LOCAL}`);
    await localNode.getByRole('button', { name: 'Node actions' }).click();
    await page.getByRole('menuitem', { name: 'Checkout' }).click();
    await expect(page.getByText('Restore this snapshot')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('06-checkout-review.png'), fullPage: true });
  });

  // ── 07: Rewritten (force-pushed) remote history banner ────────────────────

  test('07-rewritten-banner', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockHistory(page, { rewritten: true });
    await openSyncTab(page);
    await expect(page.getByText(/rewritten/)).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('07-rewritten-banner.png'), fullPage: false });
  });
});
