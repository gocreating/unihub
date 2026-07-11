/**
 * E2E — Inventory Acquisition create/edit regressions (iteration 6, FR-024).
 *
 * Locks:
 *   1. Breadcrumb's first crumb is "Catalog" (links to /inventory/catalog).
 *   2. An item card whose item has a URL has a header link with target="_blank".
 *   3. The cost "reset" control is an icon-only button (no text).
 *   4. Cost-factor rows stack (wrap) on a narrow content area.
 *   5. Accumulated rows are labelled "Items" (not "Accumulated").
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e --grep "inventory-acquisition"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

async function gotoNewAcquisition(page: Page) {
  await page.goto('/inventory/acquisitions/new');
  await page.waitForSelector('.ant-card', { timeout: 10_000 });
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('breadcrumb first crumb is "Catalog" and links to the catalog', async ({ page }) => {
  await gotoNewAcquisition(page);
  const firstCrumb = page.locator('.ant-breadcrumb li').first().locator('a');
  await expect(firstCrumb).toHaveText('Catalog');
  await expect(firstCrumb).toHaveAttribute('href', /\/inventory\/catalog/);
});

test('accumulated cost rows are labelled "Items" with an icon-only reset', async ({ page }) => {
  await gotoNewAcquisition(page);
  const cost = page.locator('.ant-card', { hasText: 'Cost' }).last();
  await expect(cost.getByText('Items', { exact: true }).first()).toBeVisible();
  // Reset is an icon-only button: it has the reload icon and no visible text.
  const reset = cost.locator('button', { has: page.locator('.anticon-reload') }).first();
  await expect(reset).toBeVisible();
  await expect(reset).toHaveText('');
});

test('item card header opens the URL in a new tab when a URL is set', async ({ page }) => {
  await gotoNewAcquisition(page);
  // Open the item modal, fill name + URL, save.
  await page.getByRole('button', { name: /Add Item/i }).click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal #name, .ant-modal input[id$="name"]').first().fill('Linked thing');
  // URL field (label "URL").
  const urlItem = page.locator('.ant-modal .ant-form-item', { hasText: 'URL' }).first();
  await urlItem.locator('input').fill('https://example.com/widget');
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(400);
  // The new card's header is an anchor opening a new tab.
  const link = page.locator('.ant-card-small .ant-card-head a', { hasText: 'Linked thing' }).first();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', 'https://example.com/widget');
});

test('cost-factor rows stack on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await gotoNewAcquisition(page);
  // Add a manual factor so there is a multi-field row to inspect.
  const cost = page.locator('.ant-card', { hasText: 'Cost' }).last();
  await cost.getByRole('button', { name: /Add Factor/i }).click();
  await page.waitForTimeout(300);
  // Narrow: the factor row's fields wrap (each full width) → the row is tall
  // enough to hold stacked controls rather than a single 32px line.
  const row = cost.locator('.ant-row').filter({ has: page.locator('.ant-select') }).last();
  const box = await row.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(60);
});
