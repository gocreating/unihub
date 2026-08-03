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

/**
 * Total emoji ink offset vs the row middle, in CSS px:
 *   (ink center within the emoji span)  ← mask/glyph centering
 * + (span box center − row box center)  ← layout centering
 * Measured from actual pixels + boxes — no segmentation heuristics, safe for
 * rows wider than the viewport.
 */
async function emojiInkDelta(page: Page, span: Locator, row: Locator): Promise<number | null> {
  await span.scrollIntoViewIfNeeded();
  const shot = await span.screenshot();
  const b64 = shot.toString('base64');
  const inkMid = await page.evaluate(async ({ b64 }) => {
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
    let top = H;
    let bot = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        // ink = notably darker than the light tag background
        if (d[k]! < 160 && d[k + 1]! < 160 && d[k + 2]! < 160) {
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
  if (inkMid === null) return null;
  const sb = (await span.boundingBox())!;
  const rb = (await row.boundingBox())!;
  return inkMid + (sb.y + sb.height / 2) - (rb.y + rb.height / 2);
}

test('parameter emoji ink centers on the tag row middle — EVERY glyph (FR-032)', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await page.waitForSelector('tr.ant-table-row', { timeout: 15_000 });
  const spans = page.locator('.ant-tag [data-testid="key-emoji"]');
  const count = await spans.count();
  expect(count).toBeGreaterThan(3);
  await page.waitForTimeout(300);

  // The ink-mask architecture must be ACTIVE (not the text fallback): every
  // emoji span paints a currentColor box through a data-URL mask.
  const first = spans.first();
  const maskImage = await first.evaluate(
    (el) => getComputedStyle(el).webkitMaskImage || getComputedStyle(el).maskImage,
  );
  expect(maskImage).toContain('data:image/png');

  // Environment sanity (anti-tofu): two DIFFERENT glyphs must paint DIFFERENT
  // masks — a font-less environment renders identical tofu boxes and would
  // make every centering assertion vacuous (the iteration-45 failure mode).
  const byEmoji = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const e = (await spans.nth(i).getAttribute('data-emoji')) ?? '';
    if (e && !byEmoji.has(e)) byEmoji.set(e, i);
  }
  expect(byEmoji.size, 'distinct glyphs on the page').toBeGreaterThanOrEqual(2);
  const masks = new Set<string>();
  for (const i of byEmoji.values()) {
    masks.add(
      await spans.nth(i).evaluate(
        (el) => getComputedStyle(el).webkitMaskImage || getComputedStyle(el).maskImage,
      ),
    );
  }
  expect(masks.size, 'distinct glyphs render distinct ink masks').toBeGreaterThanOrEqual(2);

  // EVERY distinct glyph's ink centers on its tag row (±1.5px) — measured
  // from actual pixels, one tag per glyph.
  for (const [emoji, i] of byEmoji) {
    const span = spans.nth(i);
    const tag = span.locator('xpath=ancestor::*[contains(@class,"ant-tag")][1]');
    const delta = await emojiInkDelta(page, span, tag);
    expect(delta, `glyph ${emoji} ink offset`).not.toBeNull();
    expect(Math.abs(delta!), `glyph ${emoji} ink offset ${delta}px`).toBeLessThanOrEqual(1.5);
  }
});

test('emoji ink centers on organize-pane and Add-modal tags too (FR-032)', async ({ page }) => {
  // The same KeyEmoji renders on every surface — verify beyond the catalog.
  await page.goto('/inventory/scenarios');
  await page.waitForSelector('tr.ant-table-row a', { timeout: 15_000 });
  const links = page.locator('tr.ant-table-row a');
  const n = await links.count();
  let measured = 0;
  for (let s = 0; s < n && measured === 0; s++) {
    await page.goto('/inventory/scenarios');
    await page.waitForSelector('tr.ant-table-row a', { timeout: 15_000 });
    await links.nth(s).click();
    await page.waitForSelector('.ant-card', { timeout: 15_000 });
    await page.waitForTimeout(500);
    const paneTags = page.locator(
      '[data-testid="organized-pane"] .ant-tag:has([data-testid="key-emoji"]), [data-testid="unorganized-pane"] .ant-tag:has([data-testid="key-emoji"])',
    );
    const c = Math.min(await paneTags.count(), 3);
    for (let i = 0; i < c; i++) {
      const tag = paneTags.nth(i);
      const delta = await emojiInkDelta(page, tag.locator('[data-testid="key-emoji"]').first(), tag);
      expect(delta, `pane tag[${i}] ink`).not.toBeNull();
      expect(Math.abs(delta!), `pane tag[${i}] ink offset ${delta}px`).toBeLessThanOrEqual(1.5);
      measured++;
    }
  }
  expect(measured, 'pane tags measured across scenarios').toBeGreaterThan(0);

  // Add-modal results (recently-acquired items carry parameters).
  await page.locator('.ant-card', { hasText: 'Organize' }).first()
    .locator('button').filter({ hasText: /^Add$/ }).first().click();
  const modal = page.locator('.ant-modal', { hasText: 'Add items' }).first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const modalTags = modal.locator('.ant-tag:has([data-testid="key-emoji"])');
  const mc = Math.min(await modalTags.count(), 3);
  expect(mc, 'modal result tags with emoji').toBeGreaterThan(0);
  for (let i = 0; i < mc; i++) {
    const tag = modalTags.nth(i);
    const delta = await emojiInkDelta(page, tag.locator('[data-testid="key-emoji"]').first(), tag);
    expect(delta, `modal tag[${i}] ink`).not.toBeNull();
    expect(Math.abs(delta!), `modal tag[${i}] ink offset ${delta}px`).toBeLessThanOrEqual(1.5);
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
  await page.locator('[data-testid="confirm-dialog-footer"] button', { hasText: /Delete/ }).click();
  await page.waitForTimeout(500);
});
