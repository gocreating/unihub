/**
 * E2E tests — sort column highlighting.
 *
 * Verifies that sorted columns carry the ant-table-column-sort CSS class (which
 * produces the background highlight) for BOTH interaction paths:
 *   1. Clicking a column header (baseline — always worked)
 *   2. Applying from the sort panel (was broken; fixed via makeSortProps)
 *   3. Resetting from the sort panel (was broken; fixed via makeSortProps)
 *
 * Root cause of the original bug:
 *   AntD ProTable's ant-table-column-sort class was driven by internal sorterStates,
 *   which only updated via its own onChange (user header click). Panel apply/reset
 *   bypassed onChange entirely. makeSortProps drives the class from activeRules via
 *   onHeaderCell.className, so both paths now work.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e --grep "sort-highlight"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

async function gotoTable(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.waitForTimeout(600);
}

/** Find the th element whose visible text starts with the given label. */
async function getColumnTh(page: Page, label: string) {
  return page.locator(`.ant-table-thead th`).filter({ hasText: new RegExp(`^${label}`) }).first();
}

async function openSortPanel(page: Page) {
  await page.click('button:has-text("Sort"), button:has-text("排序")');
  await page.waitForSelector('.ant-select-selector', { timeout: 5_000 });
  await page.waitForTimeout(300);
}

async function selectSortAttribute(page: Page, label: string) {
  // Click the first attribute selector in the sort panel (the Select for the field)
  const selector = page.locator('.ant-select-selector').first();
  await selector.click();
  await page.waitForSelector('.ant-select-dropdown', { timeout: 3_000 });
  await page.locator(`.ant-select-item-option:has-text("${label}")`).first().click();
  await page.waitForTimeout(200);
}

async function clickApply(page: Page) {
  const applyBtn = page.locator('button:has-text("Apply"), button:has-text("套用")').last();
  await expect(applyBtn).toBeEnabled({ timeout: 2_000 });
  await applyBtn.click();
  await page.waitForTimeout(400);
}

async function clickReset(page: Page) {
  const resetBtn = page.locator('button:has-text("Reset"), button:has-text("重設")').first();
  await expect(resetBtn).toBeEnabled({ timeout: 2_000 });
  await resetBtn.click();
  await page.waitForTimeout(400);
}

test.describe('Sort highlight — column gets ant-table-column-sort class', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // H-01: Baseline — header click highlights the column (always worked)
  test('currencies: clicking Code column header adds ant-table-column-sort', async ({ page }) => {
    await gotoTable(page, '/finance/currencies');
    const codeTh = await getColumnTh(page, 'Code');
    await codeTh.click();
    await expect(codeTh).toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });
  });

  // H-02: Panel apply highlights the column (was broken, now fixed)
  test('currencies: panel Apply highlights the selected column', async ({ page }) => {
    await gotoTable(page, '/finance/currencies');
    await openSortPanel(page);
    await selectSortAttribute(page, 'Code');
    await clickApply(page);

    const codeTh = await getColumnTh(page, 'Code');
    await expect(codeTh).toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });
  });

  // H-03: Panel apply updates highlight when switching sort attribute
  test('currencies: panel Apply highlights Name column when Name is selected', async ({ page }) => {
    await gotoTable(page, '/finance/currencies');
    await openSortPanel(page);
    await selectSortAttribute(page, 'Name');
    await clickApply(page);

    const nameTh = await getColumnTh(page, 'Name');
    await expect(nameTh).toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });

    // Code column must NOT be highlighted
    const codeTh = await getColumnTh(page, 'Code');
    await expect(codeTh).not.toHaveClass(/ant-table-column-sort/);
  });

  // H-04: Panel Reset clears the column highlight (was broken, now fixed)
  test('currencies: panel Reset clears column highlight after a panel Apply', async ({ page }) => {
    await gotoTable(page, '/finance/currencies');

    // First apply sort via panel
    await openSortPanel(page);
    await selectSortAttribute(page, 'Code');
    await clickApply(page);

    const codeTh = await getColumnTh(page, 'Code');
    await expect(codeTh).toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });

    // Now open the panel again and reset
    await openSortPanel(page);
    await clickReset(page);

    await expect(codeTh).not.toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });
  });

  // H-05: Panel Reset clears highlight after a header click sort
  test('currencies: panel Reset clears column highlight after a header click sort', async ({ page }) => {
    await gotoTable(page, '/finance/currencies');

    // Sort via header click first
    const codeTh = await getColumnTh(page, 'Code');
    await codeTh.click();
    await expect(codeTh).toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });

    // Open panel and reset
    await openSortPanel(page);
    await clickReset(page);

    await expect(codeTh).not.toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });
  });

  // H-06: exchange-rates page — panel Apply highlights column
  test('exchange-rates: panel Apply highlights Base column', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    await openSortPanel(page);
    await selectSortAttribute(page, 'Base');
    await clickApply(page);

    const baseTh = await getColumnTh(page, 'Base');
    await expect(baseTh).toHaveClass(/ant-table-column-sort/, { timeout: 3_000 });
  });
});
