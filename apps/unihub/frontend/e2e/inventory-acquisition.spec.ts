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

test('a manual cost-factor type shows its localized label, not the raw key', async ({ page }) => {
  await gotoNewAcquisition(page);
  const cost = page.locator('.ant-card', { hasText: 'Cost' }).last();
  await cost.getByRole('button', { name: /Add Factor/i }).click();
  await page.waitForTimeout(300);
  // Pick the "Shipping" suggestion; the field must display the label "Shipping",
  // never the raw key "shipping".
  const typeInput = cost.locator('.ant-select-selection-search input, input.ant-input').first();
  await typeInput.click();
  await page.getByText('Shipping', { exact: true }).first().click();
  await expect(cost.locator('input[value="Shipping"], input').first()).toHaveValue(/Shipping/);
});

test('item cards render available attributes as Tag badges', async ({ page }) => {
  await gotoNewAcquisition(page);
  await page.getByRole('button', { name: /Add Item/i }).click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').first().fill('Badged item');
  const colorItem = page.locator('.ant-modal .ant-form-item', { hasText: 'Color' }).first();
  await colorItem.locator('input').fill('Blue');
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(400);
  const card = page.locator('.ant-card-small', { hasText: 'Badged item' }).first();
  await expect(card.locator('.ant-card-body .ant-tag', { hasText: 'Blue' })).toBeVisible();
});

test('number inputs are right-aligned (cost panel + Add-Item modal)', async ({ page }) => {
  await gotoNewAcquisition(page);
  // Cost panel value input.
  const costInput = page.locator('.ant-card', { hasText: 'Cost' }).last().locator('.ant-input-number-input').first();
  await expect(costInput).toBeVisible();
  expect(await costInput.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
  // Add-Item modal quantity input.
  await page.getByRole('button', { name: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  const qty = page.locator('.ant-modal .ant-input-number-input').first();
  expect(await qty.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
});

test('Add-Item modal fields stack at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await gotoNewAcquisition(page);
  await page.getByRole('button', { name: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.waitForTimeout(400);
  // Narrow modal → the Name field's grid column must be full-width (ant-col-24).
  const nameCol = page
    .locator('.ant-modal .ant-form-item', { hasText: 'Name' })
    .first()
    .locator('xpath=ancestor::*[contains(@class,"ant-col-")][1]');
  await expect(nameCol).toHaveClass(/ant-col-24/);
});

test('Add-Item modal footer: Cancel flushed left, Save right', async ({ page }) => {
  await gotoNewAcquisition(page);
  await page.getByRole('button', { name: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  const cancel = page.locator('.ant-modal-footer button', { hasText: 'Cancel' });
  const save = page.locator('.ant-modal-footer button', { hasText: 'Save' });
  const cBox = await cancel.boundingBox();
  const sBox = await save.boundingBox();
  const modalBox = await page.locator('.ant-modal-content').boundingBox();
  // Cancel near the left edge; Save near the right edge.
  expect(cBox!.x - modalBox!.x).toBeLessThan(60);
  expect(modalBox!.x + modalBox!.width - (sBox!.x + sBox!.width)).toBeLessThan(60);
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
