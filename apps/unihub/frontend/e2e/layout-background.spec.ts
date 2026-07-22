/**
 * 015 FR-028 / SC-009: the app shell's grey canvas must span the full document
 * height. ProLayout paints the canvas only via a viewport-FIXED bg layer, so on
 * pages taller than the viewport a full-page capture used to show a white band
 * below the first viewport height. Locked by a pixel probe: take a full-page
 * screenshot, decode it in-page via canvas 2D, and assert the bottom corners
 * sample the canvas grey.
 */

import { expect, test, type Page } from '@playwright/test';

/** AntD/ProLayout canvas color (`#f0f2f5`) — also asserted in src/index.css. */
const CANVAS_RGB = [240, 242, 245];

async function mockTallSyncPage(page: Page) {
  await page.route('**/api/v1/auth/me/', (r) =>
    r.fulfill({ json: { id: 1, username: 'root', is_staff: true } }),
  );
  await page.route('**/api/v1/io/tables/', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/v1/sync/config/', (r) =>
    r.fulfill({
      json: { is_configured: true, repo_url: 'https://github.com/example/data', pat: null },
    }),
  );
  await page.route('**/api/v1/sync/history/**', (r) =>
    r.fulfill({
      json: {
        // Enough commits to push the document height well past the viewport.
        commits: Array.from({ length: 12 }, (_, i) => ({
          sha: String(i % 10).repeat(7).padEnd(40, '0'),
          parents: [],
          author_date: '2026-07-15T08:00:00Z',
          message: `sync: snapshot ${i}`,
          is_remote_head: i === 0,
          is_local_state: i === 1,
          compatible: true,
          incompatible_reason: null,
        })),
        has_more: false,
        remote_head: '0'.repeat(40),
        local_commit: '1'.repeat(40),
        has_local_changes: false,
        history_rewritten: false,
      },
    }),
  );
}

test('grey canvas extends to the bottom of taller-than-viewport documents', async ({ page }) => {
  await mockTallSyncPage(page);
  await page.goto('/system/io');
  await page.getByText('Sync').click();
  await expect(page.getByText('snapshot 11')).toBeVisible({ timeout: 15_000 });

  // Precondition: the page is genuinely taller than the viewport.
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(docHeight).toBeGreaterThan(viewport!.height + 100);

  // Pixel probe: decode the full-page capture in-page via canvas 2D and sample
  // the bottom corners — they must be the grey canvas, never white.
  const buf = await page.screenshot({ fullPage: true });
  const probe = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = `data:image/png;base64,${b64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    return {
      width: img.width,
      height: img.height,
      bottomLeft: px(4, img.height - 4),
      bottomRight: px(img.width - 4, img.height - 4),
    };
  }, buf.toString('base64'));

  expect(probe.height).toBeGreaterThan(viewport!.height);
  expect(probe.bottomLeft).toEqual(CANVAS_RGB);
  expect(probe.bottomRight).toEqual(CANVAS_RGB);
});

test('sider right border extends to the bottom of taller-than-viewport documents', async ({ page }) => {
  await mockTallSyncPage(page);
  await page.goto('/system/io');
  await page.getByText('Sync').click();
  await expect(page.getByText('snapshot 11')).toBeVisible({ timeout: 15_000 });

  // The border sits at the sider's right edge; the sider is viewport-fixed,
  // so measure its width from the DOM to locate the boundary column.
  const siderWidth = await page.evaluate(() => {
    const sider = document.querySelector('.ant-layout-sider');
    return sider ? Math.round(sider.getBoundingClientRect().width) : null;
  });
  expect(siderWidth).not.toBeNull();

  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = page.viewportSize();
  expect(docHeight).toBeGreaterThan(viewport!.height + 100);

  // Pixel probe (FR-030 / SC-011): near the document bottom, the boundary
  // window must contain a border pixel — i.e. NOT uniform canvas grey.
  const buf = await page.screenshot({ fullPage: true });
  const probe = await page.evaluate(
    async ({ b64, x }) => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('decode failed'));
        img.src = `data:image/png;base64,${b64}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const y = img.height - 4;
      const window: number[][] = [];
      for (let dx = -3; dx <= 3; dx += 1) {
        window.push(Array.from(ctx.getImageData(x + dx, y, 1, 1).data.slice(0, 3)));
      }
      return { height: img.height, window };
    },
    { b64: buf.toString('base64'), x: siderWidth! },
  );

  const isCanvas = (p: number[]) =>
    Math.abs(p[0] - CANVAS_RGB[0]) <= 2 &&
    Math.abs(p[1] - CANVAS_RGB[1]) <= 2 &&
    Math.abs(p[2] - CANVAS_RGB[2]) <= 2;
  expect(probe.height).toBeGreaterThan(viewport!.height);
  expect(probe.window.some((p) => !isCanvas(p))).toBe(true);
});
