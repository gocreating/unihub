/**
 * E2E — Inventory Scenario list + detail (iteration 18).
 *
 * Locks:
 *   1. List shows exactly Name + Description (actions moved to the detail).
 *   2. Detail info panel: Edit button (in-place rename) + kebab Delete.
 *   3. Add modal fills the unorganized pane; rows carry rich context.
 *   4. ONE dnd-kit drag system (real PointerEvents — driven with the mouse):
 *      flat→tree nested drop in one motion, in-tree rearrange, tree→flat
 *      send-back; nesting survives reload.
 *   5. Narrow pane: rows never overflow (remove button stays inside).
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

// dnd-kit uses PointerEvents with a 5px activation distance — a real mouse
// drag works (unlike the old HTML5 DnD bridge).
async function mouseDrag(page: Page, src: Locator, tx: number, ty: number) {
  const box = (await src.boundingBox())!;
  // Grab near the row's holder icon (left edge) — never over the item link.
  const sx = box.x + 12;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 15 });
  await page.mouse.move(tx, ty + 1);
  await page.mouse.up();
  await page.waitForTimeout(700);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('scenario list shows exactly Name and Description (no Actions)', async ({ page }) => {
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  const headers = (await page.locator('.ant-table-thead th').allInnerTexts()).map((h) => h.trim());
  const names = headers.filter((h) => h !== '');
  expect(names.some((h) => h.startsWith('Name'))).toBe(true);
  expect(names.some((h) => h.startsWith('Description'))).toBe(true);
  for (const gone of ['Actions', 'Items', 'Progress', 'Status']) {
    expect(names.some((h) => h.startsWith(gone))).toBe(false);
  }
});

test('detail actions, modal-add, unified drag (nested drop, rearrange, send back)', async ({
  page,
}) => {
  const name = `E2E Pack ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });

  // Create via the shared form modal.
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal textarea').fill('e2e packing scenario');
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);

  // Open its detail page.
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-card', { timeout: 10_000 });

  // Info panel: Edit renames in place.
  await page.getByRole('button', { name: /Edit/ }).click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  const renamed = `${name} v2`;
  await page.locator('.ant-modal input[id$="name"]').fill(renamed);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await expect(page.locator('.ant-card-head-title', { hasText: renamed })).toBeVisible({
    timeout: 5_000,
  });

  // No pane titles inside the splitter.
  await expect(page.getByTestId('unorganized-pane').getByText('Unorganized')).toHaveCount(0);

  const flatPane = page.getByTestId('unorganized-pane');
  const orgPane = page.getByTestId('organized-pane');

  // Add two items through the search modal — they land in the flat pane.
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().fill('a');
  for (let i = 0; i < 2; i++) {
    const addButtons = modal.locator('.ant-list-item button').filter({ hasText: /Add/ });
    await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
    await addButtons.first().click();
    await expect(async () => {
      expect(await flatPane.locator('[data-testid^="flat-row-"]').count()).toBeGreaterThanOrEqual(
        i + 1,
      );
    }).toPass({ timeout: 10_000 });
    await page.waitForTimeout(300);
  }
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();

  // Drag 1: flat → empty tree (top level).
  const orgBox = (await orgPane.boundingBox())!;
  await mouseDrag(
    page,
    flatPane.locator('[data-testid^="flat-row-"]').first(),
    orgBox.x + orgBox.width / 2,
    orgBox.y + 40,
  );
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(1, { timeout: 10_000 });

  // Drag 2: flat → NESTED under the first tree row in ONE motion (drop on its
  // lower half; the pane offset provides the depth).
  const firstRow = orgPane.locator('[data-testid^="org-row-"]').first();
  const rowBox = (await firstRow.boundingBox())!;
  await mouseDrag(
    page,
    flatPane.locator('[data-testid^="flat-row-"]').first(),
    rowBox.x + 120,
    rowBox.y + rowBox.height * 0.8,
  );
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2, { timeout: 10_000 });
  const nested = orgPane.locator('[data-testid^="org-row-"]').nth(1);
  await expect(nested).toHaveCSS('padding-left', '24px');

  // Nesting persists a reload.
  await page.reload();
  await page.waitForSelector('[data-testid="organized-pane"]', { timeout: 10_000 });
  await expect(
    page.getByTestId('organized-pane').locator('[data-testid^="org-row-"]').nth(1),
  ).toHaveCSS('padding-left', '24px', { timeout: 10_000 });

  // In-tree rearrange: drag the nested row to the top (upper half of row 1)
  // → it becomes top-level (padding 0).
  const orgPane2 = page.getByTestId('organized-pane');
  const topRow = orgPane2.locator('[data-testid^="org-row-"]').first();
  const topBox = (await topRow.boundingBox())!;
  await mouseDrag(
    page,
    orgPane2.locator('[data-testid^="org-row-"]').nth(1),
    topBox.x + 8,
    topBox.y + 2,
  );
  await expect(async () => {
    const paddings = await orgPane2
      .locator('[data-testid^="org-row-"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.paddingLeft));
    expect(paddings.every((v) => v === '0px' || v === '')).toBe(true);
  }).toPass({ timeout: 10_000 });

  // Send-back: drag a tree row into the flat pane.
  const flatBox = (await page.getByTestId('unorganized-pane').boundingBox())!;
  await mouseDrag(
    page,
    orgPane2.locator('[data-testid^="org-row-"]').first(),
    flatBox.x + flatBox.width / 2,
    flatBox.y + 60,
  );
  await expect(async () => {
    expect(
      await page.getByTestId('unorganized-pane').locator('[data-testid^="flat-row-"]').count(),
    ).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 10_000 });
  // Flat rows keep the remove action; tree rows offer none.
  await expect(
    page.getByTestId('unorganized-pane').getByRole('button', { name: /Remove from scenario/ }).first(),
  ).toBeVisible();
  await expect(orgPane2.locator('button')).toHaveCount(0);

  // Cleanup: kebab Delete → confirm → back on the list.
  await page.getByLabel('scenario-actions').click();
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('.ant-modal-confirm .ant-btn-dangerous').click();
  await page.waitForURL(/\/inventory\/scenarios$/, { timeout: 10_000 });
  await expect(page.locator('.ant-table-tbody tr', { hasText: renamed })).toHaveCount(0);
});

test('narrow pane keeps flat-row actions inside the pane bounds', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-tbody', { timeout: 10_000 });
  const anyScenario = page.locator('.ant-table-tbody a').first();
  if ((await anyScenario.count()) === 0) test.skip(true, 'no scenarios present');
  await anyScenario.click();
  await page.waitForSelector('.ant-splitter', { timeout: 10_000 });
  await expect(page.locator('.ant-splitter')).toHaveClass(/ant-splitter-vertical/);
  const pane = page.getByTestId('unorganized-pane');
  const rows = pane.locator('[data-testid^="flat-row-"]');
  if ((await rows.count()) === 0) test.skip(true, 'no unorganized rows to measure');
  const paneBox = (await pane.boundingBox())!;
  const btnBox = (await rows.first().getByRole('button').boundingBox())!;
  expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
});
