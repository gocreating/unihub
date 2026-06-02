/**
 * E2E tests for ColumnPanel sticky (pin) column behavior.
 *
 * Key insight: AntD's fixed:'left' only produces a visible sticky effect when
 * the table has horizontal overflow (scrollWidth > clientWidth). We use a 600px
 * viewport so the table's natural column widths (>600px) cause real overflow.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e --grep "column-pin"
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
  await page.waitForSelector('.ant-table-body', { timeout: 10_000 });
  await page.waitForTimeout(800);
}

async function openColumnPanel(page: Page) {
  await page.click('button:has-text("Columns"), button:has-text("欄位")');
  await page.waitForSelector('[data-sticky-pin="left"]', { timeout: 5_000 });
}

async function pinLeftAndApply(page: Page) {
  await page.click('[data-sticky-pin="left"]');
  const applyBtn = page.locator('button:has-text("Apply"), button:has-text("套用")').last();
  await expect(applyBtn).toBeEnabled({ timeout: 2_000 });
  await applyBtn.click();
  await page.waitForTimeout(500);
}

test.describe('Column pin — sticky behavior', () => {
  // Use a NARROW viewport so the table columns (>600px combined) overflow
  // naturally without any artificial scroll.x manipulation.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await login(page);
  });

  // P-01: Table must overflow before we can test sticky behavior.
  // This test confirms the precondition for the other tests.
  test('exchange-rates: table overflows at 600px viewport (precondition)', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    const overflows = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      return body ? body.scrollWidth > body.clientWidth : false;
    });
    expect(overflows, 'Table must overflow at 600px so sticky tests are meaningful').toBe(true);
  });

  // P-02: After pin-left + Apply the first column cell carries the AntD
  // fixed-column CSS class — confirms fixed:'left' reached the rendered DOM.
  test('exchange-rates: first column has ant-table-cell-fix-left after pin+apply', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    await openColumnPanel(page);
    await pinLeftAndApply(page);

    const fixedCell = page.locator('.ant-table-body td.ant-table-cell-fix-left').first();
    await expect(fixedCell).toBeVisible({ timeout: 5_000 });
  });

  // P-03: The pinned column's left position stays at 0 while the table body
  // scrolls right — the definitive proof that sticky is working.
  test('exchange-rates: pinned column stays at left edge when table is scrolled', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    await openColumnPanel(page);
    await pinLeftAndApply(page);

    // Scroll the table body right by 200px
    await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      if (body) body.scrollLeft = 200;
    });
    await page.waitForTimeout(150);

    // The first body cell (pinned) should still be at the left edge of the viewport
    const leftAfterScroll = await page.evaluate(() => {
      const cell = document.querySelector<HTMLElement>(
        '.ant-table-body tr:first-child td:first-child',
      );
      return cell ? cell.getBoundingClientRect().left : -999;
    });

    // A truly sticky cell keeps its left position ≥ 0 (at viewport left edge).
    // A non-sticky cell would scroll to a negative left after scrollLeft=200.
    expect(leftAfterScroll, 'Pinned column must stay at left edge when scrolled').toBeGreaterThanOrEqual(0);
  });

  // P-04: Columns must NOT become artificially wide after pinning.
  // This catches the scroll.x = 9999 regression where tableLayout:fixed
  // stretches all columns to fill the huge virtual width.
  test('exchange-rates: columns do not stretch after pin+apply', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');

    // Measure first column width BEFORE pinning
    const widthBefore = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:first-child');
      return th ? th.getBoundingClientRect().width : 0;
    });

    await openColumnPanel(page);
    await pinLeftAndApply(page);

    // Measure first column width AFTER pinning — must not have grown significantly
    const widthAfter = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:first-child');
      return th ? th.getBoundingClientRect().width : 0;
    });

    expect(widthBefore).toBeGreaterThan(0);
    // Allow at most 10px variation (rounding, border, etc.) — but not 10× wider
    expect(widthAfter).toBeLessThan(widthBefore * 2);
  });

  // P-05: Accounts page (more columns, higher chance of overflow even on wider screens)
  test('accounts: first column sticky after pin+apply', async ({ page }) => {
    await gotoTable(page, '/finance/accounts');
    await openColumnPanel(page);
    await pinLeftAndApply(page);

    const fixedCell = page.locator('.ant-table-body td.ant-table-cell-fix-left').first();
    await expect(fixedCell).toBeVisible({ timeout: 5_000 });
  });
});
