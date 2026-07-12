/**
 * E2E — Inventory Catalog regressions (iterations 6–13, FR-024).
 *
 * Locks the repeatedly-reported Catalog behaviours so they can't regress:
 *   1. Caret disclosure icon (not plus/minus).
 *   2. Tree expanded by default (item rows visible on load).
 *   3. The "Requested" column is hidden by default but toggleable from the
 *      Columns dropdown, rendering the two-row datetime when shown (v1.18.0).
 *   4. Column widths fit content (Actions buttons not clipped).
 *   5. Filtering/sorting an item-level column flattens to a flat item list.
 *   6. Iteration 13: derived Acquisition/Item/Parameters default columns,
 *      hidden real columns, no Delete on item rows.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *   3. At least one acquisition with ≥1 item exists (≥1 item having a
 *      parameter attribute such as size/weight/color).
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

test('defaults to the derived columns; real columns hidden (iteration 13)', async ({ page }) => {
  const headers = await page.locator('.ant-table-thead th').allInnerTexts();
  const names = headers.map((h) => h.trim());
  for (const shown of ['Acquisition', 'Item', 'Parameters']) {
    expect(names.some((h) => h.startsWith(shown))).toBe(true);
  }
  for (const hidden of ['Name', 'Spec', 'URL', 'Source', 'Requested', 'Obtained', 'Net Cost', 'Status', 'Color', 'Volume', 'Weight']) {
    expect(names.some((h) => h.startsWith(hidden))).toBe(false);
  }
});

test('Requested is toggleable from the Columns dropdown and renders two-row datetime', async ({ page }) => {
  await page.getByRole('button', { name: /Columns/ }).click();
  const panel = page.locator('.ant-dropdown').last();
  // The dropdown lists the hidden real columns (URL-column bug fix).
  for (const label of ['Requested', 'URL', 'Color', 'Volume']) {
    await expect(panel.getByText(label, { exact: true })).toBeVisible();
  }
  // Toggle Requested visible and apply.
  const requestedRow = panel.locator('li, .ant-space, div', { hasText: /^Requested$/ }).last();
  await requestedRow.locator('input[type="checkbox"]').first().check();
  await panel.getByRole('button', { name: /^Apply$/ }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.ant-table-thead th', { hasText: /^Requested/ })).toBeVisible();
  // Two-row datetime (constitution v1.18.0): absolute + relative secondary row.
  const dated = page
    .locator('tr.ant-table-row-level-0 td')
    .filter({ hasText: /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/ })
    .first();
  await expect(dated.locator('.ant-typography')).toBeVisible();
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

test('caret has its own dedicated column (not merged into a data column)', async ({ page }) => {
  // The caret sits in the leading cell; the first data column cell holds no caret.
  const firstBodyRow = page.locator('.ant-table-tbody tr.ant-table-row').first();
  const caretCell = firstBodyRow.locator('td').first();
  await expect(caretCell.locator('.anticon-caret-down, .anticon-caret-right')).toHaveCount(1);
});

test('no item-count ("Items") column and standard footer pagination', async ({ page }) => {
  const headers = await page.locator('.ant-table-thead th').allInnerTexts();
  expect(headers).not.toContain('Items');
  // The standard EntityOffsetFooter pagination lives in the table footer,
  // with its own per-page Select (showSizeChanger is disabled).
  await expect(page.locator('.ant-table-footer .ant-pagination')).toBeVisible();
  await expect(page.locator('.ant-table-footer .ant-select').first()).toBeVisible();
});

test('item rows show parameter badges; the Item cell links to the URL', async ({ page }) => {
  // The derived Item cell's primary row is a new-tab link when the item has a URL.
  const link = page.locator('.ant-table-tbody a[target="_blank"]').first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /.+/);
  // At least one item row renders Parameters as Tag badges.
  const tagCount = await page.locator('tr.ant-table-row-level-1 .ant-tag').count();
  expect(tagCount).toBeGreaterThan(0);
});

test('item rows offer Deprecate/Restore but no Delete; acquisition rows keep Delete', async ({ page }) => {
  const itemRow = page.locator('tr.ant-table-row-level-1').first();
  await expect(
    itemRow.locator('button', { hasText: /Deprecate|Restore/ }).first(),
  ).toBeVisible();
  await expect(itemRow.locator('button', { hasText: 'Delete' })).toHaveCount(0);
  const acqRow = page.locator('tr.ant-table-row-level-0').first();
  await expect(acqRow.locator('button', { hasText: 'Delete' }).first()).toBeVisible();
});

test('Item column sizes to content (canonical dataWidths, incl. item rows)', async ({ page }) => {
  // The Item header cell must be at least as wide as the longest item name
  // rendered beneath it (no fixed-min clipping of item columns).
  const itemHeader = page.locator('.ant-table-thead th', { hasText: /^Item/ }).first();
  const headerBox = await itemHeader.boundingBox();
  const itemCells = page.locator('.ant-table-tbody tr .ant-table-cell:nth-child(3)');
  const count = await itemCells.count();
  for (let i = 0; i < Math.min(count, 20); i++) {
    const cell = itemCells.nth(i);
    // scrollWidth (content) should not exceed the column width by more than padding.
    const overflow = await cell.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(4);
  }
  expect(headerBox?.width ?? 0).toBeGreaterThan(80);
});

test('default sort is Obtained desc NULLS FIRST and the action button says "New"', async ({ page }) => {
  // Page action label is "New" (not "New Acquisition"). Match on innerText —
  // the accessible name also carries the plus icon's aria-label.
  const action = page.locator('button').filter({ hasText: /^New$/ }).first();
  await expect(action).toBeVisible();
  // The seeded default sort lights the Sort toolbar button (isActive).
  await expect(page.getByRole('button', { name: /Sort/ })).toHaveClass(/ant-btn-primary/);
  // Default order via the derived Acquisition column's date range: acquisitions
  // without an Obtained date ("~ —" or no range) sort before dated ones.
  const summaryCells = await page
    .locator('.ant-table-tbody tr.ant-table-row-level-0 td:nth-child(2)')
    .allInnerTexts();
  const isDated = (c: string) => /~ \d{4}-\d{2}-\d{2}/.test(c);
  const firstDatedIdx = summaryCells.findIndex(isDated);
  const lastPendingIdx = summaryCells.map((c) => !isDated(c)).lastIndexOf(true);
  if (lastPendingIdx !== -1 && firstDatedIdx !== -1) {
    expect(lastPendingIdx).toBeLessThan(firstDatedIdx);
  }
});

test('SKU price drops trailing zeros', async ({ page }) => {
  // No rendered SKU cell should show a trailing-zero decimal like "10.0000".
  const cells = await page.locator('.ant-table-tbody td').allInnerTexts();
  expect(cells.some((c) => /\.\d*0{3,}\b/.test(c))).toBe(false);
});

test('sorting an item column flattens the tree to a flat item list', async ({ page }) => {
  // Baseline: tree mode shows parent (level-0) + child (level-1) rows.
  await expect(page.locator('.ant-table-row-level-1').first()).toBeVisible();

  // Sort by an item column (Quantity) via the column header sorter.
  const qtyTh = page.locator('.ant-table-thead th', { hasText: /^Quantity/ }).first();
  await qtyTh.click();
  await page.waitForTimeout(500);

  // Flat mode: no nested child rows, and the dedicated expand-caret column is
  // gone — no data row leads with a caret cell (header sort carets and any
  // header clones are a different concern).
  await expect(page.locator('.ant-table-row-level-1')).toHaveCount(0);
  await expect(
    page.locator(
      '.ant-table-tbody tr.ant-table-row td:first-child .anticon-caret-right, .ant-table-tbody tr.ant-table-row td:first-child .anticon-caret-down',
    ),
  ).toHaveCount(0);
});
