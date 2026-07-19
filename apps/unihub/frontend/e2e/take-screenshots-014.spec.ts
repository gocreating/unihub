/**
 * Screenshot capture spec for PR 014-inventory-app.
 * Captures the REAL running app (docker stack with the imported legacy data):
 * catalog tree + parameter badges, deprecate-modal preview, acquisition edit,
 * scenario list/detail organize panes, and the Add-items modal.
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

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('unihub-locale', 'en-US'));
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('01+02+03 catalog: overview, badges, deprecate preview', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await expect(page.locator('tr.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ss('01-catalog-overview.png') });

  // Close-up of a row block with parameter badges (emoji ink centering).
  const tagRow = page.locator('tr.ant-table-row:has([data-testid="key-emoji"])').first();
  await tagRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await tagRow.screenshot({ path: ss('02-catalog-parameter-badges.png') });

  // Deprecate modal with the item preview (FR-003c).
  const depBtn = page.locator('tr.ant-table-row button', { hasText: 'Deprecate' }).first();
  await depBtn.scrollIntoViewIfNeeded();
  await depBtn.click();
  await expect(page.getByTestId('deprecate-preview')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(600);
  await page.locator('.ant-modal-content').first().screenshot({ path: ss('03-deprecate-modal-preview.png') });
});

test('04 acquisition edit: item cards + cost factors', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await expect(page.locator('tr.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
  const edit = page.locator('tr.ant-table-row a', { hasText: 'Edit' }).first();
  await edit.click();
  await expect(page.locator('.ant-card').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ss('04-acquisition-edit.png') });
});

test('05+06+07 scenarios: list, organize panes, add modal', async ({ page }) => {
  await page.goto('/inventory/scenarios');
  await expect(page.locator('tr.ant-table-row').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('05-scenario-list.png') });

  // Pick a scenario whose organize panes hold rows with parameter badges.
  const links = page.locator('tr.ant-table-row a');
  const n = await links.count();
  for (let s = 0; s < n; s++) {
    await page.goto('/inventory/scenarios');
    await expect(page.locator('tr.ant-table-row a').first()).toBeVisible({ timeout: 15_000 });
    await links.nth(s).click();
    await expect(page.locator('.ant-splitter').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    if ((await page.locator('[data-testid="key-emoji"]').count()) > 3) break;
  }
  await page.screenshot({ path: ss('06-scenario-organize.png') });

  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(modal.locator('.ant-list-item').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('07-scenario-add-modal.png') });
});
