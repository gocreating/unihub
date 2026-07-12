/**
 * E2E — Inventory Scenario detail (iteration 16: info panel + organize redesign).
 *
 * Locks the redesigned scenario flow:
 *   1. Scenario list shows exactly Name, Description, Actions columns.
 *   2. Detail: standalone name/description panel; NO Backlog panel.
 *   3. "Add" opens a search modal — highlighted matches; members disabled;
 *      adding lands the item in the unorganized (left) pane.
 *   4. Cross-pane drag: left→right organizes (persists reload); right→left
 *      sends a line back. Tree nodes offer no remove button.
 *
 * Prerequisites: backend + frontend running (see inventory-catalog.spec.ts),
 * with at least two catalog items whose names contain a common letter.
 *
 * Run: pnpm test:e2e --grep "inventory-scenario"
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

// AntD Tree + native panes use HTML5 drag & drop, which Playwright's
// mouse-based dragTo cannot trigger — dispatch the DragEvent sequence
// with a shared DataTransfer.
async function html5Drag(page: Page, src: Locator, dst: Locator) {
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

test('create scenario, modal-add, organize via cross-pane drag, send back, reload', async ({
  page,
}) => {
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

  // Standalone info panel; no Backlog panel anywhere.
  await expect(page.locator('.ant-card-head-title', { hasText: name })).toBeVisible();
  await expect(page.getByText('e2e packing scenario')).toBeVisible();
  await expect(page.getByText('Backlog')).toHaveCount(0);

  const flatPane = page.getByTestId('unorganized-pane');
  const treePane = page.getByTestId('organized-pane');

  // Add two items through the search modal.
  const organizeCard = page.locator('.ant-card', { hasText: 'Organize' }).first();
  await organizeCard.locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().fill('a');
  for (let i = 0; i < 2; i++) {
    const addButtons = modal.locator('.ant-list-item button').filter({ hasText: /Add/ });
    await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
    // Matched substrings are highlighted with <mark>.
    await expect(modal.locator('.ant-list-item mark').first()).toBeVisible();
    await addButtons.first().click();
    // The added item lands in the unorganized pane…
    await expect(async () => {
      expect(await flatPane.locator('.ant-list-item').count()).toBeGreaterThanOrEqual(i + 1);
    }).toPass({ timeout: 10_000 });
    // …and its modal row flips to a disabled "Added" entry.
    await expect(modal.locator('.ant-list-item .ant-tag', { hasText: 'Added' }).first())
      .toBeVisible();
    await page.waitForTimeout(300);
  }
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();

  // Left→right: organize both flat rows (background drop = top level).
  for (let i = 0; i < 2; i++) {
    const row = flatPane.locator('.ant-list-item[draggable="true"]').first();
    await expect(row).toBeVisible();
    await html5Drag(page, row, treePane);
  }
  const realNodes = treePane.locator(
    '.ant-tree-treenode:not([class*="motion"]):not([aria-hidden="true"])',
  );
  await expect(async () => {
    expect(await realNodes.count()).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 10_000 });

  // Tree nodes expose NO remove button (send-back is the only way out).
  await expect(treePane.locator('.ant-tree-treenode button')).toHaveCount(0);

  // Nest: drag the last top-level node ONTO the first (tree-internal drag).
  const count = await realNodes.count();
  await html5Drag(page, realNodes.nth(count - 1), realNodes.first());

  // Reload: nesting persisted (one node carries an indent unit).
  await page.reload();
  await expect(
    page
      .getByTestId('organized-pane')
      .locator('.ant-tree-treenode:not([aria-hidden="true"])')
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  // Indent units are zero-width spans — assert presence, not visibility.
  await expect(
    page.locator('.ant-tree-treenode:not([aria-hidden="true"]) .ant-tree-indent-unit').first(),
  ).toBeAttached();

  // Right→left: send the nested node back — it reappears in the flat pane.
  const reloadedNodes = page.getByTestId('organized-pane').locator(
    '.ant-tree-treenode:not([class*="motion"]):not([aria-hidden="true"])',
  );
  const nested = reloadedNodes.filter({ has: page.locator('.ant-tree-indent-unit') }).first();
  await html5Drag(page, nested, page.getByTestId('unorganized-pane'));
  await expect(async () => {
    expect(
      await page.getByTestId('unorganized-pane').locator('.ant-list-item').count(),
    ).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 10_000 });
  // The flat row offers remove (membership delete).
  await expect(
    page.getByTestId('unorganized-pane').getByRole('button', { name: /Remove from scenario/ }).first(),
  ).toBeVisible();

  // Cleanup: delete the scenario.
  await page.goto('/inventory/scenarios');
  const row = page.locator('.ant-table-tbody tr', { hasText: name }).first();
  await row.locator('button', { hasText: 'Delete' }).click();
  await page.locator('.ant-modal-confirm .ant-btn-dangerous').click();
});

test('narrow content flips the Organize splitter to vertical', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-tbody', { timeout: 10_000 });
  const anyScenario = page.locator('.ant-table-tbody a').first();
  if ((await anyScenario.count()) === 0) test.skip(true, 'no scenarios present');
  await anyScenario.click();
  await page.waitForSelector('.ant-splitter', { timeout: 10_000 });
  await expect(page.locator('.ant-splitter')).toHaveClass(/ant-splitter-vertical/);
});
