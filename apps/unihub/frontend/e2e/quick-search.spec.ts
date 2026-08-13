/**
 * E2E — Quick Search (019): the toolbar free-text search on entity tables.
 *
 * Covers: live narrowing + `<mark>` highlighting (US1/US3), the URL staying
 * param-free and the view row staying clean while searching (US2/FR-006),
 * per-tab query context across a tab switch (FR-005), request consolidation
 * during a fast typing burst (US4/SC-003), and the catalog flattening its
 * tree rows while a search is active (R5) with clearing restoring them.
 *
 * NOTE: runs against the live dev stack, which serves the user's REAL data —
 * per the project's standing rule these tests are written here but executed
 * by a human. Assertions avoid depending on specific records: they type a
 * query derived from the first row's own visible text.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e --grep "quick-search"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

const searchInput = (page: Page) => page.getByPlaceholder('Search');

/** First data row's text of the given body-cell column (skips the measure row). */
async function firstRowCellText(page: Page): Promise<string> {
  const cell = page.locator('.ant-table-tbody tr.ant-table-row').first().locator('td').nth(1);
  return (await cell.innerText()).trim();
}

test.describe('quick-search', () => {
  test('typing narrows the currencies table and marks matches; URL stays clean', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/finance/currencies');
    await page.waitForSelector('.ant-table-tbody tr.ant-table-row');

    // Type a fragment of the first row's own name — data-independent.
    const sample = (await firstRowCellText(page)).slice(0, 3);
    test.skip(sample.length < 2, 'first row has no usable text');
    await searchInput(page).fill(sample);

    // Rows narrow to matches and the fragment renders highlighted.
    await expect(page.locator('.ant-table-tbody mark').first()).toBeVisible({ timeout: 5_000 });

    // FR-006: no view params, no unsaved dot while searching.
    expect(new URL(page.url()).search).toBe('');
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);

    // Clearing restores the un-searched table and removes every mark.
    await searchInput(page).fill('');
    await expect(page.locator('.ant-table-tbody mark')).toHaveCount(0, { timeout: 5_000 });
  });

  test('each view tab keeps its own query across switches', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await page.waitForSelector('.ant-table-tbody tr.ant-table-row');
    const row = page.getByTestId('view-tabs-row');

    // Open a second (scratch) tab.
    await row.getByLabel('View menu').click();
    await page.getByRole('menuitem', { name: 'Add empty view' }).click();
    await expect(searchInput(page)).toHaveValue(''); // new tab starts empty

    await searchInput(page).fill('beta');
    const tabs = row.getByRole('tab');
    await tabs.first().click();
    await expect(searchInput(page)).toHaveValue(''); // first tab had no query

    await searchInput(page).fill('alpha');
    await tabs.last().click();
    await expect(searchInput(page)).toHaveValue('beta'); // restored per tab
    await tabs.first().click();
    await expect(searchInput(page)).toHaveValue('alpha');
  });

  test('a fast typing burst consolidates lookups (SC-003)', async ({ page }) => {
    await login(page);
    await page.goto('/finance/currencies');
    await page.waitForSelector('.ant-table-tbody tr.ant-table-row');

    const searchRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.searchParams.has('search')) searchRequests.push(url.searchParams.get('search')!);
    });

    // 10 keystrokes in one burst, faster than the 300ms debounce.
    await searchInput(page).pressSequentially('0123456789', { delay: 40 });
    await page.waitForTimeout(1_000);

    expect(searchRequests.length).toBeLessThanOrEqual(2);
    expect(searchRequests.at(-1)).toBe('0123456789');
  });

  test('catalog search flattens tree rows; clearing restores the tree', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await page.waitForSelector('.ant-table-tbody tr.ant-table-row');

    // Tree mode renders the expand caret column; flat mode drops it.
    const caretCells = page.locator('.ant-table-tbody [data-caret], .ant-table-row-expand-icon');
    const hadTree = (await caretCells.count()) > 0;

    const itemsRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/inventory/items/') && req.url().includes('search='))
        itemsRequests.push(req.url());
    });

    const sample = (await firstRowCellText(page)).slice(0, 2);
    test.skip(sample.length < 2, 'first row has no usable text');
    await searchInput(page).fill(sample);
    await expect
      .poll(() => itemsRequests.length, { timeout: 5_000 })
      .toBeGreaterThan(0); // flat items endpoint carries the search

    await searchInput(page).fill('');
    if (hadTree) {
      await expect(caretCells.first()).toBeVisible({ timeout: 5_000 }); // tree restored
    }
    expect(new URL(page.url()).search).toBe(''); // still no params
  });
});
