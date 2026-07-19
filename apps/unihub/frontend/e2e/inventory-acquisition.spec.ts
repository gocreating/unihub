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
  await page.locator('.ant-card', { hasText: 'Items' }).first().locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal #name, .ant-modal input[id$="name"]').first().fill('Linked thing');
  // URL field (label "URL").
  const urlItem = page.locator('.ant-modal .ant-form-item', { hasText: 'URL' }).first();
  await urlItem.locator('input').fill('https://example.com/widget');
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(400);
  // The card's primary name (ItemDisplay body, iter 26) is a new-tab anchor.
  const link = page.locator('.ant-card-small .ant-card-body a', { hasText: 'Linked thing' }).first();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', 'https://example.com/widget');
});

test('a manual cost-factor type shows its localized label, not the raw key', async ({ page }) => {
  await gotoNewAcquisition(page);
  const cost = page.locator('.ant-card', { hasText: 'Cost' }).last();
  await cost.locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForTimeout(300);
  // Pick the "Shipping" suggestion on the NEWLY ADDED manual row (the
  // accumulated row's type control is disabled); the field must display the
  // label "Shipping", never the raw key "shipping".
  const typeSelect = cost
    .locator('.ant-select', {
      has: page.locator('.ant-select-selection-placeholder', { hasText: 'Type' }),
    })
    .first();
  await typeSelect.locator('input').click();
  await page.keyboard.type('Ship');
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText('Shipping', { exact: true })
    .first()
    .click();
  // Some combobox in the Cost card now displays the localized label "Shipping"
  // (never the raw key "shipping").
  await expect(async () => {
    const combos = cost.getByRole('combobox');
    const count = await combos.count();
    const values: string[] = [];
    for (let i = 0; i < count; i++) values.push(await combos.nth(i).inputValue());
    expect(values).toContain('Shipping');
    expect(values).not.toContain('shipping');
  }).toPass({ timeout: 5_000 });
});

test('item cards render parameter rows as Tag badges (iteration 14)', async ({ page }) => {
  await gotoNewAcquisition(page);
  const itemsCard = page.locator('.ant-card', { hasText: 'Items' }).first();
  await itemsCard.locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').first().fill('Badged item');
  // Add a "Color" parameter row via the on-demand editor (FR-026).
  await page.locator('.ant-modal').getByRole('button', { name: /Add parameter/ }).click();
  await page.locator('.ant-modal .ant-select-selector').last().click();
  // The option text carries the seeded 🎨 emoji prefix (FR-032, iteration 27).
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText(/Color/)
    .first()
    .click();
  // The value input shares the grid row with the key select showing "Color".
  await page
    .locator('.ant-modal .ant-row', { hasText: 'Color' })
    .last()
    .locator('input.ant-input')
    .first()
    .fill('Blue');
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(400);
  const card = page.locator('.ant-card-small', { hasText: 'Badged item' }).first();
  await expect(card.locator('.ant-card-body .ant-tag', { hasText: 'Blue' })).toBeVisible();
});

test('parameter rows follow the form grid; system keys offer no delete icon (iteration 16)', async ({ page }) => {
  await gotoNewAcquisition(page);
  await page.locator('.ant-card', { hasText: 'Items' }).first().locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal').getByRole('button', { name: /Add parameter/ }).click();
  // The parameter row spans the modal form width (grid, not a fixed 40% pane).
  const paramRow = page
    .locator('.ant-modal .ant-row')
    .filter({ has: page.getByRole('button', { name: 'remove-parameter' }) })
    .last();
  const rowBox = await paramRow.boundingBox();
  const bodyBox = await page.locator('.ant-modal .ant-modal-body').boundingBox();
  expect(rowBox!.width).toBeGreaterThan(bodyBox!.width * 0.8);
  // System definitions (e.g. Color) carry no delete icon in the key dropdown.
  await paramRow.locator('.ant-select-selector').first().click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  const colorOption = dropdown.locator('.ant-select-item-option', { hasText: 'Color' }).first();
  await expect(colorOption).toBeVisible();
  await expect(colorOption.locator('[aria-label="delete-definition"]')).toHaveCount(0);
});

test('number inputs are right-aligned (cost panel + Add-Item modal)', async ({ page }) => {
  await gotoNewAcquisition(page);
  // Cost panel value input.
  const costInput = page.locator('.ant-card', { hasText: 'Cost' }).last().locator('.ant-input-number-input').first();
  await expect(costInput).toBeVisible();
  expect(await costInput.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
  // Add-Item modal quantity input.
  await page.locator('.ant-card', { hasText: 'Items' }).first().locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  const qty = page.locator('.ant-modal .ant-input-number-input').first();
  expect(await qty.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
});

test('Add-Item modal fields stack at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await gotoNewAcquisition(page);
  await page.locator('.ant-card', { hasText: 'Items' }).first().locator('button').filter({ hasText: /^Add$/ }).first().click();
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
  await page.locator('.ant-card', { hasText: 'Items' }).first().locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  // Let the zoom-in animation settle — measuring mid-transform reads a
  // scaled bounding box near the trigger button (flake source).
  await page.waitForTimeout(500);
  const cancel = page.locator('.ant-modal-footer button', { hasText: 'Cancel' });
  const save = page.locator('.ant-modal-footer button', { hasText: 'Save' });
  const cBox = await cancel.boundingBox();
  const sBox = await save.boundingBox();
  const modalBox = await page.locator('.ant-modal-content').boundingBox();
  // Cancel near the left edge; Save near the right edge.
  expect(cBox!.x - modalBox!.x).toBeLessThan(60);
  expect(modalBox!.x + modalBox!.width - (sBox!.x + sBox!.width)).toBeLessThan(60);
});

test('item card Duplicate appends a copy to the end of the list', async ({ page }) => {
  await gotoNewAcquisition(page);
  // Fill the default card via the edit modal so the copy is recognizable.
  await page.locator('.ant-card-small .anticon-edit').first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').first().fill('Dup me');
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(300);
  // Duplicate → two cards with the same name, copy appended at the end.
  await page.locator('.ant-card-small .anticon-copy').first().click();
  await page.waitForTimeout(200);
  const titles = await page.locator('.ant-card-small .ant-card-body').allInnerTexts();
  expect(titles.filter((t) => t.includes('Dup me'))).toHaveLength(2);
  expect(titles[titles.length - 1]).toContain('Dup me');
});

test('cost-factor rows stack on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await gotoNewAcquisition(page);
  // Add a manual factor so there is a multi-field row to inspect.
  // (The header action is labelled "Add" since iteration 10, FR-006c.)
  const cost = page.locator('.ant-card', { hasText: 'Cost' }).last();
  await cost.locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForTimeout(300);
  // Narrow: the factor row's fields wrap (each full width) → the row is tall
  // enough to hold stacked controls rather than a single 32px line.
  const row = cost.locator('.ant-row').filter({ has: page.locator('.ant-select') }).last();
  const box = await row.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(60);
});

test('Add-Item modal offers the Alias field (iteration 18, FR-030)', async ({ page }) => {
  await gotoNewAcquisition(page);
  await page.locator('.ant-card', { hasText: 'Items' }).first().locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await expect(
    page.locator('.ant-modal .ant-form-item', { hasText: 'Alias' }).first().locator('input'),
  ).toBeVisible();
});

test('edit page: Acquisition panel kebab holds Delete and returns to the catalog (iteration 19)', async ({ page }) => {
  // Create a throwaway acquisition.
  await gotoNewAcquisition(page);
  const src = `E2E Kebab ${Date.now()}`;
  await page.locator('input[id$="source"]').first().fill(src);
  // Fill the PRE-INSERTED empty item card (FR-006a) via its Edit action.
  await page.locator('.ant-card-small .anticon-edit').first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').first().fill('Disposable');
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /^Create$/ }).click();
  await page.waitForURL(/\/inventory\/catalog/, { timeout: 10_000 });

  // Open its edit page via the row's Edit link.
  const row = page.locator('tr.ant-table-row-level-0', { hasText: src }).first();
  await row.locator('a', { hasText: 'Edit' }).click();
  await page.waitForURL(/\/acquisitions\/.+\/edit/, { timeout: 10_000 });

  // Kebab on the Acquisition panel → Delete → confirm → back on the catalog.
  await page.getByLabel('acquisition-actions').click();
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('.ant-modal-confirm .ant-btn-dangerous').click();
  await page.waitForURL(/\/inventory\/catalog/, { timeout: 10_000 });
  await expect(page.locator('tr', { hasText: src })).toHaveCount(0);
});
