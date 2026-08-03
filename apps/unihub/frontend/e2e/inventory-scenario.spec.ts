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
    // Member rows keep a DISABLED Add button (iter 19) — click enabled ones.
    const addButtons = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
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
  await page.locator('[data-testid="confirm-dialog-footer"] .ant-btn-dangerous').click();
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

test('iteration 19: caret collapse, modal add-button tooltip, narrow panel fold', async ({
  page,
}) => {
  const name = `E2E Kebab19 ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-splitter', { timeout: 10_000 });

  // Add two items; the modal rows stay inside the modal bounds and member
  // rows show a DISABLED Add button whose hover reveals the "Added" tooltip.
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().fill('a');
  const enabledAdds = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
  await expect(enabledAdds.first()).toBeVisible({ timeout: 10_000 });
  const modalBox = (await modal.boundingBox())!;
  const rowBox = (await modal.locator('.ant-list-item').first().boundingBox())!;
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(modalBox.x + modalBox.width + 1);
  await enabledAdds.first().click();
  await page.waitForTimeout(600);
  await enabledAdds.first().click();
  await page.waitForTimeout(600);
  // First result is now a member — its Add button is disabled; hover shows "Added".
  const disabledAdd = modal.locator('.ant-list-item button[disabled]').first();
  await expect(disabledAdd).toBeVisible();
  await disabledAdd.locator('xpath=ancestor::span[1]').hover();
  await expect(page.locator('.ant-tooltip:not(.ant-tooltip-hidden)', { hasText: 'Added' }))
    .toBeVisible({ timeout: 5_000 });
  await modal.locator('.ant-modal-close').click();
  // Wait out the close animation — the modal wrap swallows pointer events
  // until fully hidden.
  await expect(modal).toBeHidden();
  await page.waitForTimeout(300);

  // Organize: item 1 top-level, item 2 nested (as in the iter-18 spec).
  const flatPane = page.getByTestId('unorganized-pane');
  const orgPane = page.getByTestId('organized-pane');
  const orgBox = (await orgPane.boundingBox())!;
  await mouseDrag(page, flatPane.locator('[data-testid^="flat-row-"]').first(),
    orgBox.x + orgBox.width / 2, orgBox.y + 40);
  const firstRow = orgPane.locator('[data-testid^="org-row-"]').first();
  const rBox = (await firstRow.boundingBox())!;
  await mouseDrag(page, flatPane.locator('[data-testid^="flat-row-"]').first(),
    rBox.x + 120, rBox.y + rBox.height * 0.8);
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2, { timeout: 10_000 });

  // Caret collapse hides the child; expand brings it back.
  const caret = orgPane.locator('[aria-label="toggle-children"]').first();
  await expect(caret).toBeVisible();
  await caret.click();
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(1);
  await orgPane.locator('[aria-label="toggle-children"]').first().click();
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2);

  // Narrow viewport: the info panel folds Edit into the kebab (v1.21.0).
  await page.setViewportSize({ width: 560, height: 900 });
  await page.waitForTimeout(600);
  await expect(page.getByRole('button', { name: /Edit/ })).toHaveCount(0);
  await page.getByLabel('scenario-actions').click();
  const menu = page.locator('.ant-dropdown-menu');
  await expect(menu.locator('.ant-dropdown-menu-item', { hasText: 'Edit' })).toBeVisible();
  await expect(menu.locator('.ant-dropdown-menu-item', { hasText: 'Delete' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Cleanup.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  await page.getByLabel('scenario-actions').click();
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('[data-testid="confirm-dialog-footer"] .ant-btn-dangerous').click();
  await page.waitForURL(/\/inventory\/scenarios$/, { timeout: 10_000 });
});

test('iteration 20: tree drag keeps rows in place (no reflow jitter)', async ({ page }) => {
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-tbody', { timeout: 10_000 });
  const name = `E2E Jitter ${Date.now()}`;
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-splitter', { timeout: 10_000 });

  // Seed: two items, both organized (one nested).
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().fill('a');
  const enabledAdds = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
  await expect(enabledAdds.first()).toBeVisible({ timeout: 10_000 });
  await enabledAdds.first().click();
  await page.waitForTimeout(500);
  await enabledAdds.first().click();
  await page.waitForTimeout(500);
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();
  await page.waitForTimeout(300);

  const flatPane = page.getByTestId('unorganized-pane');
  const orgPane = page.getByTestId('organized-pane');
  const orgBox = (await orgPane.boundingBox())!;
  await mouseDrag(page, flatPane.locator('[data-testid^="flat-row-"]').first(),
    orgBox.x + orgBox.width / 2, orgBox.y + 40);
  const firstRow = orgPane.locator('[data-testid^="org-row-"]').first();
  const rBox = (await firstRow.boundingBox())!;
  await mouseDrag(page, flatPane.locator('[data-testid^="flat-row-"]').first(),
    rBox.x + 120, rBox.y + rBox.height * 0.8);
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2, { timeout: 10_000 });

  // Start dragging the CONTAINER row (has a nested child) — mid-drag, both
  // rows must remain rendered (dimmed), no list reflow.
  const container = orgPane.locator('[data-testid^="org-row-"]').first();
  const cBox = (await container.boundingBox())!;
  await page.mouse.move(cBox.x + 60, cBox.y + cBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cBox.x + 60, cBox.y + cBox.height / 2 + 30, { steps: 6 });
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2);
  const opacity = await container.evaluate((el) => (el as HTMLElement).style.opacity);
  expect(Number(opacity)).toBeLessThan(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2);

  // Modal tooltip on a truncated long-name result. The flush rows (iter 22)
  // give titles more room, so force truncation deterministically by
  // narrowing the viewport before hovering.
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(400);
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  await modal.locator('input').first().fill('超轻');
  const title = modal.locator('[data-testid="modal-row"] span').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
  await title.hover();
  await page.waitForTimeout(600);
  await expect(page.locator('.ant-tooltip:not(.ant-tooltip-hidden)')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);

  // Cleanup.
  await page.keyboard.press('Escape');
  await page.getByLabel('scenario-actions').click();
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('[data-testid="confirm-dialog-footer"] .ant-btn-dangerous').click();
  await page.waitForURL(/\/inventory\/scenarios$/, { timeout: 10_000 });
});

test('iteration 22: modal rows are geometrically flush (pixel lock)', async ({ page }) => {
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-tbody', { timeout: 10_000 });
  const name = `E2E Flush ${Date.now()}`;
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-splitter', { timeout: 10_000 });

  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().fill('a');
  const enabledAdds = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
  await expect(enabledAdds.first()).toBeVisible({ timeout: 10_000 });
  // Create a member row so BOTH states are measured.
  await enabledAdds.first().click();
  await page.waitForTimeout(800);
  await expect(modal.locator('.ant-list-item button[disabled]').first()).toBeVisible();

  // No List actions slot — the row owns its layout.
  await expect(modal.locator('.ant-list-item-action')).toHaveCount(0);

  // Pixel lock: for an enabled row and the disabled member row, the Add
  // button's right edge sits within 2px of the row's right edge, and the row
  // within 2px of the modal body's content edge.
  const geometry = await modal.evaluateHandle(() => null); // anchor for evaluate below
  void geometry;
  const rows = modal.locator('.ant-list-item');
  const rowCount = Math.min(await rows.count(), 6);
  let enabledChecked = false;
  let disabledChecked = false;
  const bodyEdge = await modal.locator('.ant-modal-body').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return rect.right - parseFloat(cs.paddingRight);
  });
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const button = row.locator('button').first();
    if ((await button.count()) === 0) continue;
    const rowBox = (await row.boundingBox())!;
    const btnBox = (await button.boundingBox())!;
    expect(Math.abs(rowBox.x + rowBox.width - (btnBox.x + btnBox.width))).toBeLessThanOrEqual(2);
    expect(Math.abs(bodyEdge - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(2);
    if (await button.isDisabled()) disabledChecked = true;
    else enabledChecked = true;
  }
  expect(enabledChecked).toBe(true);
  expect(disabledChecked).toBe(true);

  // Cleanup.
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();
  await page.getByLabel('scenario-actions').click();
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('[data-testid="confirm-dialog-footer"] .ant-btn-dangerous').click();
  await page.waitForURL(/\/inventory\/scenarios$/, { timeout: 10_000 });
});

// Iteration 27 (FR-011): the Add-items modal anchors to the viewport bottom —
// the search box never scrolls away; only the results list scrolls inside.
test('iteration 27: Add-items modal is wide and viewport-anchored', async ({ page }) => {
  const name = `E2E Anchor27 ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-card', { timeout: 10_000 });

  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().waitFor({ timeout: 5_000 });
  await page.waitForTimeout(500); // settle the zoom animation before measuring

  // Wider than the AntD default 520.
  const emptyBox = (await modal.boundingBox())!;
  expect(emptyBox.width).toBeGreaterThanOrEqual(700);
  const viewport = page.viewportSize()!;
  // Anchored: bottom edge sits near the viewport bottom even with NO results…
  const emptyGap = viewport.height - (emptyBox.y + emptyBox.height);
  expect(emptyGap).toBeGreaterThanOrEqual(0);
  expect(emptyGap).toBeLessThanOrEqual(80);

  // …and stays put with a long result list ('a' matches broadly).
  await modal.locator('input').first().fill('a');
  await page.waitForTimeout(800);
  const fullBox = (await modal.boundingBox())!;
  expect(Math.abs(fullBox.y + fullBox.height - (emptyBox.y + emptyBox.height))).toBeLessThanOrEqual(2);

  // The results container scrolls internally; the search box stays visible.
  const results = page.getByTestId('modal-results');
  await results.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(modal.locator('input').first()).toBeInViewport();

  // Cleanup: delete the scenario via the panel kebab.
  await modal.locator('.ant-modal-close').click();
  await page.locator('[data-testid="scenario-actions"], .ant-card .anticon-ellipsis').first().click();
  await page.waitForTimeout(300);
  await page.locator('.ant-dropdown-menu-item', { hasText: /Delete/ }).first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="confirm-dialog-footer"] button', { hasText: /Delete/ }).click();
  await page.waitForTimeout(500);
});

// Iteration 29 (FR-011): the drag preview is visually identical to the grabbed
// row — same content (spec and parameter pairs included), same width.
test('iteration 29: drag overlay mirrors the grabbed row', async ({ page }) => {
  const name = `E2E Overlay29 ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-card', { timeout: 10_000 });

  // Add one item so the flat pane has a draggable row.
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await modal.locator('input').first().fill('a');
  const addButtons = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
  await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
  await addButtons.first().click();
  const flatPane = page.getByTestId('unorganized-pane');
  await expect(async () => {
    expect(await flatPane.locator('[data-testid^="flat-row-"]').count()).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 10_000 });
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();

  // Mid-drag: hold after activation and compare the overlay with the row.
  const row = flatPane.locator('[data-testid^="flat-row-"]').first();
  const rowBox = (await row.boundingBox())!;
  const rowText = (await row.innerText()).trim();
  await page.mouse.move(rowBox.x + 12, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowBox.x + 40, rowBox.y + rowBox.height / 2 + 10, { steps: 5 });
  const overlay = page.getByTestId('drag-overlay');
  await expect(overlay).toBeVisible({ timeout: 3_000 });
  const overlayBox = (await overlay.boundingBox())!;
  // Same width as the grabbed row (±2px) — never a compact chip.
  expect(Math.abs(overlayBox.width - rowBox.width)).toBeLessThanOrEqual(2);
  // Grab-offset anchor (iteration 43, portal): the overlay origin equals the
  // source row origin + pointer delta — no jump on activation.
  expect(Math.abs(overlayBox.x - (rowBox.x + 28))).toBeLessThanOrEqual(3);
  expect(Math.abs(overlayBox.y - (rowBox.y + 10))).toBeLessThanOrEqual(3);
  // Same content — spec/parameter context included, not just the name.
  const overlayText = (await overlay.innerText()).trim();
  expect(overlayText).toBe(rowText);
  await page.mouse.up();
  // dnd-kit suppresses the first click after a drag — spend it on a neutral spot.
  await page.mouse.click(8, 400);
  await page.waitForTimeout(200);

  // Cleanup: kebab Delete → confirm (established scenario-actions pattern).
  await page.getByLabel('scenario-actions').click();
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('[data-testid="confirm-dialog-footer"] button', { hasText: /Delete/ }).click();
  await page.waitForTimeout(500);
});

// Iteration 31 (FR-011): the drop indicator stays visible ABOVE the
// semi-transparent drag preview.
test('iteration 31: drop indicator paints above the semi-transparent preview', async ({ page }) => {
  const name = `E2E Indicator31 ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-card', { timeout: 10_000 });

  // Add one item; the modal now lists recent items by default (no typing).
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  const addButtons = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
  await expect(addButtons.first()).toBeVisible({ timeout: 10_000 }); // default listing
  await addButtons.first().click();
  const flatPane = page.getByTestId('unorganized-pane');
  await expect(async () => {
    expect(await flatPane.locator('[data-testid^="flat-row-"]').count()).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 10_000 });
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();

  // Drag the flat row over the (empty) tree pane and hold.
  const row = flatPane.locator('[data-testid^="flat-row-"]').first();
  const rowBox = (await row.boundingBox())!;
  const orgPane = page.getByTestId('organized-pane');
  const orgBox = (await orgPane.boundingBox())!;
  await page.mouse.move(rowBox.x + 12, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(orgBox.x + orgBox.width / 2, orgBox.y + 40, { steps: 12 });
  await page.mouse.move(orgBox.x + orgBox.width / 2, orgBox.y + 41);

  const overlay = page.getByTestId('drag-overlay');
  await expect(overlay).toBeVisible({ timeout: 3_000 });
  const indicator = page.getByTestId('drop-indicator');
  await expect(indicator).toBeVisible({ timeout: 3_000 });
  // The preview is semi-transparent and BELOW the indicator in paint order.
  const overlayOpacity = await overlay.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(overlayOpacity)).toBeLessThan(1);
  const overlayZ = await overlay.evaluate((el) => getComputedStyle(el.parentElement!).zIndex);
  const indicatorZ = await indicator.evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(indicatorZ)).toBeGreaterThan(Number(overlayZ));
  await page.mouse.up();
  // Let the drop mutation settle (row lands in the tree), then spend
  // dnd-kit's post-drag click suppression on a neutral spot.
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(1, { timeout: 10_000 });
  await page.mouse.click(8, 400);
  await page.waitForTimeout(300);

  // Cleanup: kebab Delete → confirm (retry — the panel can re-render mid-click).
  await expect(async () => {
    await page.getByLabel('scenario-actions').click();
    await expect(
      page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('[data-testid="confirm-dialog-footer"] button', { hasText: /Delete/ }).click();
  await page.waitForTimeout(500);
});


// Iteration 43 (FR-011): a nest-drop colors the container row + block instead
// of the indicator line.
test('iteration 43: nest-drop highlights the prospective container', async ({ page }) => {
  const name = `E2E Nest43 ${Date.now()}`;
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  await page.locator('button').filter({ hasText: /New/ }).first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').fill(name);
  await page.locator('.ant-modal button', { hasText: /Save/ }).click();
  await page.waitForTimeout(500);
  await page.locator('.ant-table-tbody a', { hasText: name }).first().click();
  await page.waitForSelector('.ant-card', { timeout: 10_000 });

  // Two items: one into the tree, one kept flat.
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  const addButtons = modal.locator('.ant-list-item button:not([disabled])').filter({ hasText: /Add/ });
  await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
  await addButtons.first().click();
  const flatPane = page.getByTestId('unorganized-pane');
  await expect(async () => {
    expect(await flatPane.locator('[data-testid^="flat-row-"]').count()).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 10_000 });
  await addButtons.first().click();
  await expect(async () => {
    expect(await flatPane.locator('[data-testid^="flat-row-"]').count()).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 10_000 });
  await modal.locator('.ant-modal-close').click();
  await expect(modal).toBeHidden();

  const orgPane = page.getByTestId('organized-pane');
  const orgBox = (await orgPane.boundingBox())!;
  await mouseDrag(
    page,
    flatPane.locator('[data-testid^="flat-row-"]').first(),
    orgBox.x + orgBox.width / 2,
    orgBox.y + 40,
  );
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(1, { timeout: 10_000 });

  // Hover a nested position (lower half + indent): the container row tints
  // and the indicator line hides.
  const firstRow = orgPane.locator('[data-testid^="org-row-"]').first();
  const rowBox = (await firstRow.boundingBox())!;
  const src = flatPane.locator('[data-testid^="flat-row-"]').first();
  const srcBox = (await src.boundingBox())!;
  await page.mouse.move(srcBox.x + 12, srcBox.y + srcBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(srcBox.x + 24, srcBox.y + srcBox.height / 2, { steps: 3 });
  await page.mouse.move(rowBox.x + 120, rowBox.y + rowBox.height * 0.8, { steps: 12 });
  await page.mouse.move(rowBox.x + 120, rowBox.y + rowBox.height * 0.8 + 1);
  await expect(orgPane.locator('[data-nest-target="true"]')).toHaveCount(1, { timeout: 3_000 });
  await expect(page.getByTestId('drop-indicator')).toHaveCount(0);
  await page.mouse.up();
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2, { timeout: 10_000 });
  await page.mouse.click(8, 400);
  await page.waitForTimeout(300);

  // Cleanup.
  await expect(async () => {
    await page.getByLabel('scenario-actions').click();
    await expect(page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('[data-testid="confirm-dialog-footer"] button', { hasText: /Delete/ }).click();
  await page.waitForTimeout(500);
});
