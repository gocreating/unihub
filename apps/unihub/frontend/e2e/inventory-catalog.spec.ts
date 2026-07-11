/**
 * E2E — Inventory Catalog regressions (iteration 6, FR-024).
 *
 * Locks the repeatedly-reported Catalog behaviours so they can't regress:
 *   1. Caret disclosure icon (not plus/minus).
 *   2. Tree expanded by default (item rows visible on load).
 *   3. The "Requested" (request_time) column is present.
 *   4. Column widths fit content (Actions buttons not clipped).
 *   5. Filtering/sorting an item-level column flattens to a flat item list.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *   3. At least one acquisition with ≥1 item exists.
 *
 * Run: pnpm test:e2e --grep "inventory-catalog"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

async function gotoCatalog(page: Page) {
  await page.goto('/inventory/catalog');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.waitForTimeout(600);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await gotoCatalog(page);
});

test('uses a caret disclosure icon, not plus/minus', async ({ page }) => {
  // AntD caret icons render as .anticon-caret-right / .anticon-caret-down.
  const carets = page.locator('.anticon-caret-right, .anticon-caret-down');
  await expect(carets.first()).toBeVisible();
  // The default plus/minus expand icons must NOT be present.
  await expect(page.locator('.ant-table-row-expand-icon-collapsed')).toHaveCount(0);
});

test('tree is expanded by default (item rows visible without clicking)', async ({ page }) => {
  // Expanded rows carry the ant-table-row-level-1 class (child/item rows).
  await expect(page.locator('.ant-table-row-level-1').first()).toBeVisible();
});

test('has the Requested column', async ({ page }) => {
  await expect(page.locator('.ant-table-thead th', { hasText: /^Requested/ })).toBeVisible();
});

test('Actions column fits its content (buttons not clipped)', async ({ page }) => {
  const actionCell = page.locator('td [data-actions-col]').first();
  await expect(actionCell).toBeVisible();
  const buttons = actionCell.locator('button');
  const cell = actionCell.locator('xpath=ancestor::td[1]');
  const cellBox = await cell.boundingBox();
  const count = await buttons.count();
  // Every action button must lie within the cell's horizontal bounds.
  for (let i = 0; i < count; i++) {
    const b = await buttons.nth(i).boundingBox();
    if (b && cellBox) {
      expect(b.x + b.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1);
    }
  }
});

test('sorting an item column flattens the tree to a flat item list', async ({ page }) => {
  // Baseline: tree mode shows parent (level-0) + child (level-1) rows.
  await expect(page.locator('.ant-table-row-level-1').first()).toBeVisible();

  // Sort by an item column (Name) via the column header sorter.
  const nameTh = page.locator('.ant-table-thead th', { hasText: /^Name/ }).first();
  await nameTh.click();
  await page.waitForTimeout(500);

  // Flat mode: no nested child rows and no expand carets remain.
  await expect(page.locator('.ant-table-row-level-1')).toHaveCount(0);
  await expect(page.locator('.anticon-caret-right, .anticon-caret-down')).toHaveCount(0);
});
