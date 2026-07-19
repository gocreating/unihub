/**
 * Iteration 45 geometry locks (FR-011/FR-032): visual alignment is verified
 * at PIXEL level in a real browser — JSDOM style locks cannot see glyph ink.
 *
 *  - Parameter emoji: the glyph's visible INK centers on the tag row middle
 *    (per-glyph canvas-metric compensation; emoji fonts place ink per their
 *    own metrics, so box centering alone is not enough).
 *  - Organize tree: the caret and drag holder center on the FULL row box
 *    (long-standing regression — pixel nudges are banned).
 */
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ deviceScaleFactor: 4 });

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

/** Ink-level analysis: emoji ink center vs the tag box middle, in CSS px. */
async function emojiInkDelta(page: Page, tag: Locator): Promise<number | null> {
  const shot = await tag.screenshot();
  const b64 = shot.toString('base64');
  return page.evaluate(async ({ b64 }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width;
    const H = c.height;
    const dark = (x: number, y: number) => {
      const k = (y * W + x) * 4;
      return d[k]! < 160 && d[k + 1]! < 160 && d[k + 2]! < 160;
    };
    const colHas: boolean[] = new Array(W).fill(false);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if (dark(x, y)) {
          colHas[x] = true;
          break;
        }
      }
    }
    // First ink cluster = the emoji glyph (the label follows after a gap).
    const start = colHas.indexOf(true);
    if (start < 0) return null;
    let end = start;
    let gap = 0;
    for (let x = start; x < W; x++) {
      if (colHas[x]) {
        end = x;
        gap = 0;
      } else if (++gap > W / 40) {
        break;
      }
    }
    let top = H;
    let bot = -1;
    for (let y = 0; y < H; y++) {
      for (let x = start; x <= end; x++) {
        if (dark(x, y)) {
          if (y < top) top = y;
          if (y > bot) bot = y;
          break;
        }
      }
    }
    if (bot < 0) return null;
    const scale = 4; // deviceScaleFactor
    return ((top + bot) / 2 - H / 2) / scale;
  }, { b64 });
}

test('parameter emoji ink centers on the tag row middle (FR-032)', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await page.waitForSelector('tr.ant-table-row', { timeout: 15_000 });
  const tags = page.locator('.ant-tag:has([data-testid="key-emoji"])');
  const count = await tags.count();
  expect(count).toBeGreaterThan(3);
  // Give the layout-effect compensation a beat, then measure several glyphs.
  await page.waitForTimeout(300);
  for (let i = 0; i < Math.min(count, 5); i++) {
    const delta = await emojiInkDelta(page, tags.nth(i));
    expect(delta, `tag[${i}] emoji ink offset`).not.toBeNull();
    expect(Math.abs(delta!), `tag[${i}] emoji ink offset ${delta}px`).toBeLessThanOrEqual(1.5);
  }
});

async function mouseDrag(page: Page, src: Locator, tx: number, ty: number) {
  const box = (await src.boundingBox())!;
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

async function centerDelta(inner: Locator, outer: Locator): Promise<number> {
  const ib = (await inner.boundingBox())!;
  const ob = (await outer.boundingBox())!;
  return ib.y + ib.height / 2 - (ob.y + ob.height / 2);
}

test('caret and holder center on the tree row middle (FR-011)', async ({ page }) => {
  const name = `E2E Center45 ${Date.now()}`;
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

  // Flat rows: the holder centers on the row middle already here.
  const flatRow = flatPane.locator('[data-testid^="flat-row-"]').first();
  expect(Math.abs(await centerDelta(flatRow.locator('.anticon-holder'), flatRow)))
    .toBeLessThanOrEqual(1.5);

  // Organize one item, nest the second under it → the container shows a caret.
  const orgPane = page.getByTestId('organized-pane');
  const orgBox = (await orgPane.boundingBox())!;
  await mouseDrag(
    page,
    flatPane.locator('[data-testid^="flat-row-"]').first(),
    orgBox.x + orgBox.width / 2,
    orgBox.y + 40,
  );
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(1, { timeout: 10_000 });
  const firstRow = orgPane.locator('[data-testid^="org-row-"]').first();
  const rowBox = (await firstRow.boundingBox())!;
  await mouseDrag(
    page,
    flatPane.locator('[data-testid^="flat-row-"]').first(),
    rowBox.x + 120,
    rowBox.y + rowBox.height * 0.8,
  );
  await expect(orgPane.locator('[data-testid^="org-row-"]')).toHaveCount(2, { timeout: 10_000 });
  await page.mouse.click(8, 400);
  await page.waitForTimeout(300);

  // The container row: caret AND holder center on the FULL row box (±1.5px),
  // regardless of how many lines the row content wraps to.
  const container = orgPane.locator('[data-testid^="org-row-"]').first();
  const caret = container.locator('[aria-label="toggle-children"]');
  await expect(caret).toBeVisible();
  expect(Math.abs(await centerDelta(caret, container)), 'caret vs row middle')
    .toBeLessThanOrEqual(1.5);
  expect(Math.abs(await centerDelta(container.locator('.anticon-holder'), container)), 'holder vs row middle')
    .toBeLessThanOrEqual(1.5);
  const nested = orgPane.locator('[data-testid^="org-row-"]').nth(1);
  expect(Math.abs(await centerDelta(nested.locator('.anticon-holder'), nested)), 'nested holder vs row middle')
    .toBeLessThanOrEqual(1.5);

  // Cleanup.
  await expect(async () => {
    await page.getByLabel('scenario-actions').click();
    await expect(page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.locator('.ant-dropdown-menu-item', { hasText: 'Delete' }).click();
  await page.locator('.ant-modal-confirm button', { hasText: /Delete/ }).click();
  await page.waitForTimeout(500);
});
