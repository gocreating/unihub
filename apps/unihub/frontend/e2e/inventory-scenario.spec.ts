/**
 * E2E — Inventory Scenario detail (iteration 14: Backlog + Organize).
 *
 * Locks the simplified scenario flow:
 *   1. Scenario list shows exactly Name, Description, Actions columns.
 *   2. Create scenario with name + description.
 *   3. Backlog fuzzy-search adds catalog items to the scenario.
 *   4. Organize drag nests one item inside another; nesting survives reload.
 *
 * Prerequisites: backend + frontend running (see inventory-catalog.spec.ts),
 * with at least two catalog items whose names contain a common letter.
 *
 * Run: pnpm test:e2e --grep "inventory-scenario"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('scenario list shows exactly Name, Description, Actions', async ({ page }) => {
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  const headers = (await page.locator('.ant-table-thead th').allInnerTexts()).map((h) => h.trim());
  const names = headers.filter((h) => h !== '');
  expect(names.some((h) => h.startsWith('Name'))).toBe(true);
  expect(names.some((h) => h.startsWith('Description'))).toBe(true);
  expect(names.some((h) => h.startsWith('Actions'))).toBe(true);
  for (const gone of ['Items', 'Progress', 'Status']) {
    expect(names.some((h) => h.startsWith(gone))).toBe(false);
  }
});

test('create scenario, backlog-add two items, drag to nest, survive reload', async ({ page }) => {
  const name = `E2E Pack ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });

  // Create with name + description.
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal textarea').fill('e2e packing scenario');
  await page.locator('.ant-modal .ant-btn-primary').click();
  await page.waitForTimeout(500);

  // Open its detail page.
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-card', { timeout: 10_000 });

  // Backlog: search a broad fragment and add results until ≥2 members exist.
  const backlog = page.locator('.ant-card', { hasText: 'Backlog' }).first();
  const organize = page.locator('.ant-card', { hasText: 'Organize' }).first();
  const nodes = organize.locator('.ant-tree-treenode:not([aria-hidden="true"])');
  await backlog.locator('input').first().fill('a');
  for (let i = 0; i < 2; i++) {
    const addButtons = backlog.locator('.ant-list-item button');
    await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
    await addButtons.first().click();
    // Wait for the Organize tree to reflect the addition before continuing.
    await expect(async () => {
      expect(await nodes.count()).toBeGreaterThanOrEqual(i + 1);
    }).toPass({ timeout: 10_000 });
    await page.waitForTimeout(400);
  }

  // Organize: drag the last REAL top-level node onto the first. AntD Tree uses
  // native HTML5 drag & drop, which Playwright's mouse-based dragTo cannot
  // trigger — dispatch the DragEvent sequence with a shared DataTransfer.
  const realNodes = organize.locator('.ant-tree-treenode:not([class*="motion"]):not([aria-hidden="true"])');
  const nodeCount = await realNodes.count();
  expect(nodeCount).toBeGreaterThanOrEqual(2);
  const src = realNodes.nth(nodeCount - 1);
  const dst = realNodes.first();
  const dstBox = (await dst.boundingBox())!;
  const cx = dstBox.x + dstBox.width / 2;
  const cy = dstBox.y + dstBox.height / 2;
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await src.dispatchEvent('dragstart', { dataTransfer });
  await dst.dispatchEvent('dragenter', { dataTransfer, clientX: cx, clientY: cy });
  await dst.dispatchEvent('dragover', { dataTransfer, clientX: cx, clientY: cy });
  await page.waitForTimeout(200);
  await dst.dispatchEvent('dragover', { dataTransfer, clientX: cx, clientY: cy });
  await dst.dispatchEvent('drop', { dataTransfer, clientX: cx, clientY: cy });
  await src.dispatchEvent('dragend', { dataTransfer });
  await page.waitForTimeout(800);

  // Reload: nesting persisted (one node carries an indent unit).
  await page.reload();
  const reloadedNodes = page.locator('.ant-tree-treenode:not([aria-hidden="true"])');
  await expect(reloadedNodes.first()).toBeVisible({ timeout: 10_000 });
  // Indent units are zero-width spans — assert presence, not visibility.
  const indented = page.locator(
    '.ant-tree-treenode:not([aria-hidden="true"]) .ant-tree-indent-unit',
  );
  await expect(indented.first()).toBeAttached();

  // Cleanup: delete the scenario.
  await page.goto('/inventory/scenarios');
  const row = page.locator('.ant-table-tbody tr', { hasText: name }).first();
  await row.locator('button', { hasText: 'Delete' }).click();
  await page.locator('.ant-modal-confirm .ant-btn-dangerous').click();
});
