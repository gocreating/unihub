/**
 * Screenshot capture spec for PR #007-data-sync-migration-fix.
 * Covers the updated Sync tab UI: Preview Push / Preview Pull buttons,
 * unified preview panels, and Cancel behaviour.
 */

import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const BRANCH = '007-data-sync-migration-fix';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

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
        last_published_at: '2026-05-31T10:00:00Z',
        last_published_commit: 'abc1234def5678',
        last_applied_at: null,
        last_applied_commit: null,
      },
    }),
  );
}

async function mockSyncStatus(page: Page, status = 'ahead') {
  await page.route('**/api/v1/sync/status/', (r) =>
    r.fulfill({
      json: {
        status,
        ahead_count: status === 'ahead' ? 1 : 0,
        behind_count: status === 'behind' ? 2 : 0,
        remote_commit: 'abc1234',
        error_message: null,
      },
    }),
  );
}

const PUSH_PREVIEW_CHANGES = [
  {
    table: 'language.language',
    display_name: 'Languages',
    added: 0,
    modified: 0,
    deleted: 0,
    is_new_table: true,
    rows: [],
  },
  {
    table: 'language.wordcard',
    display_name: 'Word Cards',
    added: 0,
    modified: 0,
    deleted: 0,
    is_new_table: true,
    rows: [],
  },
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
];

const PULL_PREVIEW_CHANGES = [
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
        before: { 'name:text': 'CTBC Bank' },
        after: { 'name:text': 'CTBC Savings' },
        changed_fields: ['name:text'],
      },
    ],
  },
  {
    table: 'music.song',
    display_name: 'Songs',
    added: 2,
    modified: 0,
    deleted: 0,
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
];

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Screenshots — 007-data-sync-migration-fix', () => {
  // ── 01: Sync tab idle state ────────────────────────────────────────────────

  test('01-sync-tab-idle', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockSyncStatus(page, 'ahead');
    await page.route('**/api/v1/sync/publish/preview/', (r) => r.abort());
    await page.goto('/system/io');
    await page.getByText('Sync').click();
    await expect(page.getByText('Preview Push')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: ss('01-sync-tab-idle.png'), fullPage: false });
  });

  // ── 02: Push preview — new tables + changed records ───────────────────────

  test('02-push-preview', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockSyncStatus(page, 'ahead');
    await page.route('**/api/v1/sync/publish/preview/', (r) =>
      r.fulfill({ json: { status: 'has_changes', changes: PUSH_PREVIEW_CHANGES } }),
    );
    await page.goto('/system/io');
    await page.getByText('Sync').click();
    await expect(page.getByText('Preview Push')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Preview Push').click();
    await expect(page.getByText('Languages')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('02-push-preview.png'), fullPage: false });
  });

  // ── 03: Push preview expanded — show row-level detail ─────────────────────

  test('03-push-preview-expanded', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockSyncStatus(page, 'ahead');
    await page.route('**/api/v1/sync/publish/preview/', (r) =>
      r.fulfill({ json: { status: 'has_changes', changes: PUSH_PREVIEW_CHANGES } }),
    );
    await page.goto('/system/io');
    await page.getByText('Sync').click();
    await expect(page.getByText('Preview Push')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Preview Push').click();
    await expect(page.getByText('Accounts')).toBeVisible({ timeout: 10_000 });
    // Expand the Accounts panel (it has row data)
    const accountsPanel = page.locator('.ant-collapse-item').filter({ hasText: 'Accounts' });
    await accountsPanel.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('03-push-preview-expanded.png'), fullPage: false });
  });

  // ── 04: Pull preview ──────────────────────────────────────────────────────

  test('04-pull-preview', async ({ page }) => {
    await mockAuth(page);
    await mockSyncConfigured(page);
    await mockSyncStatus(page, 'behind');
    await page.route('**/api/v1/sync/apply/preview/', (r) =>
      r.fulfill({ json: { status: 'has_changes', changes: PULL_PREVIEW_CHANGES } }),
    );
    await page.goto('/system/io');
    await page.getByText('Sync').click();
    await expect(page.getByText('Preview Pull')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Preview Pull').click();
    await expect(page.getByText('Songs')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('04-pull-preview.png'), fullPage: false });
  });

  // ── 05: IO export — all domain tables listed ──────────────────────────────

  test('05-io-export-all-tables', async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/v1/io/tables/', (r) =>
      r.fulfill({
        json: [
          { content_type_label: 'finance.currency', display_name: 'Currencies', app_label: 'finance' },
          { content_type_label: 'finance.account', display_name: 'Accounts', app_label: 'finance' },
          { content_type_label: 'finance.balancesheet', display_name: 'Balance Sheets', app_label: 'finance' },
          { content_type_label: 'finance.exchangerate', display_name: 'Exchange Rates', app_label: 'finance' },
          { content_type_label: 'finance.balance', display_name: 'Balances', app_label: 'finance' },
          { content_type_label: 'core.attributedefinition', display_name: 'Attribute Definitions', app_label: 'core' },
          { content_type_label: 'language.language', display_name: 'Languages', app_label: 'language' },
          { content_type_label: 'language.wordcard', display_name: 'Word Cards', app_label: 'language' },
          { content_type_label: 'language.grammarsheet', display_name: 'Grammar Sheets', app_label: 'language' },
          { content_type_label: 'music.song', display_name: 'Songs', app_label: 'music' },
          { content_type_label: 'people.person', display_name: 'Persons', app_label: 'people' },
          { content_type_label: 'people.relationship', display_name: 'Relationships', app_label: 'people' },
        ],
      }),
    );
    await page.goto('/system/io');
    await expect(page.getByText('Export')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Songs')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: ss('05-io-export-all-tables.png'), fullPage: false });
  });
});
