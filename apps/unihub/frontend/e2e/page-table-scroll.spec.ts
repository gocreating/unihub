/**
 * E2E tests for PageTable horizontal scroll synchronization.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e
 */
import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login');
  // Ant Design Form.Item sets `id` (not `name`) on the rendered input
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

async function gotoPageTable(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector('.ant-table', { timeout: 10_000 });
  await page.waitForSelector('.ant-table-body', { timeout: 10_000 });
  // Wait for data + dataWidths useMemo to settle
  await page.waitForTimeout(500);
}

async function assertNoOverflowingCells(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>('.ant-table-body td'));
    const bad = cells.filter((c) => c.scrollWidth > c.offsetWidth + 1); // +1 for sub-pixel rounding
    return bad.map((c) => ({
      text: c.innerText?.trim().slice(0, 40),
      offsetWidth: c.offsetWidth,
      scrollWidth: c.scrollWidth,
    }));
  });
  expect(overflow, `Overflowing cells found: ${JSON.stringify(overflow)}`).toHaveLength(0);
}

async function assertHeaderBodySynced(page: Page, scrollAmount: number): Promise<void> {
  // Set body scroll and poll until header matches (or 2s timeout)
  await page.evaluate((amount) => {
    const body = document.querySelector<HTMLElement>('.ant-table-body');
    if (body) body.scrollLeft = amount;
  }, scrollAmount);

  await page.waitForFunction(
    (expected) => {
      const header = document.querySelector<HTMLElement>('.ant-table-header');
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      return header?.scrollLeft === body?.scrollLeft && body?.scrollLeft === expected;
    },
    scrollAmount,
    { timeout: 2_000 },
  ).catch(() => {});

  const [headerLeft, bodyLeft] = await page.evaluate(() => [
    document.querySelector<HTMLElement>('.ant-table-header')?.scrollLeft ?? -1,
    document.querySelector<HTMLElement>('.ant-table-body')?.scrollLeft ?? -2,
  ]);

  expect(headerLeft, `Header scrollLeft (${headerLeft}) should equal body scrollLeft (${bodyLeft})`).toBe(bodyLeft);
}

// ─── Test: no cell overflow ──────────────────────────────────────────────────

test.describe('PageTable — no cell content overflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
  });

  test('currencies page: no cell overflows its column width', async ({ page }) => {
    await gotoPageTable(page, '/finance/currencies');
    await assertNoOverflowingCells(page);
  });

  test('accounts page: no cell overflows its column width', async ({ page }) => {
    await gotoPageTable(page, '/finance/accounts');
    await assertNoOverflowingCells(page);
  });

  test('exchange rates page: no cell overflows its column width', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');
    await assertNoOverflowingCells(page);
  });

  test('balance sheets page: no cell overflows its column width', async ({ page }) => {
    await gotoPageTable(page, '/finance/balance-sheets');
    await assertNoOverflowingCells(page);
  });
});

// ─── Test: horizontal scroll sync ───────────────────────────────────────────

test.describe('PageTable horizontal scroll synchronization', () => {
  test.beforeEach(async ({ page }) => {
    // Narrow viewport forces horizontal overflow on all Finance tables
    await page.setViewportSize({ width: 600, height: 800 });
    await login(page);
  });

  test('exchange rates: header scrollLeft matches body scrollLeft at mid scroll', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');

    const bodyScrollWidth = await page.evaluate(
      () => document.querySelector<HTMLElement>('.ant-table-body')?.scrollWidth ?? 0,
    );
    const bodyClientWidth = await page.evaluate(
      () => document.querySelector<HTMLElement>('.ant-table-body')?.clientWidth ?? 0,
    );
    expect(bodyScrollWidth, 'Table must overflow horizontally at 600px viewport').toBeGreaterThan(bodyClientWidth);

    await assertHeaderBodySynced(page, Math.floor(bodyScrollWidth / 2));
  });

  test('accounts: header scrollLeft matches body scrollLeft at mid scroll', async ({ page }) => {
    await gotoPageTable(page, '/finance/accounts');

    const bodyScrollWidth = await page.evaluate(
      () => document.querySelector<HTMLElement>('.ant-table-body')?.scrollWidth ?? 0,
    );
    const bodyClientWidth = await page.evaluate(
      () => document.querySelector<HTMLElement>('.ant-table-body')?.clientWidth ?? 0,
    );
    expect(bodyScrollWidth, 'Table must overflow horizontally at 600px viewport').toBeGreaterThan(bodyClientWidth);

    await assertHeaderBodySynced(page, Math.floor(bodyScrollWidth / 2));
  });

  test('exchange rates: header scrollLeft matches body scrollLeft at maximum scroll', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');

    const maxScroll = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    expect(maxScroll).toBeGreaterThan(0);

    await assertHeaderBodySynced(page, maxScroll);
  });

  test('header column cells all have positive rendered width after scrolling', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');

    await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      if (body) body.scrollLeft = body.scrollWidth;
    });
    await page.waitForTimeout(100);

    const headerCellWidths = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.ant-table-thead th')).map(
        (th) => th.getBoundingClientRect().width,
      ),
    );
    expect(headerCellWidths.length).toBeGreaterThan(0);
    for (const w of headerCellWidths) {
      expect(w, 'Header cell should have positive rendered width').toBeGreaterThan(0);
    }
  });
});

// ─── Test: sticky custom horizontal scrollbar ────────────────────────────────

test.describe('PageTable sticky horizontal scrollbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await login(page);
  });

  test('custom scrollbar exists and is visible when table overflows', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');

    const bar = page.locator('[data-custom-scrollbar]');
    await expect(bar).toBeVisible();

    const rcHidden = await page.evaluate(() => {
      const rc = document.querySelector<HTMLElement>('.ant-table-sticky-scroll');
      if (!rc) return true;
      return rc.style.display === 'none' || getComputedStyle(rc).display === 'none';
    });
    expect(rcHidden, 'rc-table built-in scrollbar should be hidden').toBe(true);
  });

  test('scrolling custom scrollbar moves the table body', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');
    await expect(page.locator('[data-custom-scrollbar]')).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.querySelector<HTMLElement>('.ant-table-body')?.scrollWidth ?? 0,
    );
    const targetScroll = Math.floor(scrollWidth / 3);

    await page.evaluate((amount) => {
      const bar = document.querySelector<HTMLElement>('[data-custom-scrollbar]');
      if (bar) {
        bar.scrollLeft = amount;
        bar.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    }, targetScroll);

    await page.waitForTimeout(100);

    const bodyLeft = await page.evaluate(
      () => document.querySelector<HTMLElement>('.ant-table-body')?.scrollLeft ?? 0,
    );
    expect(bodyLeft).toBeGreaterThan(0);
  });
});

// ─── Test: sticky vertical header ────────────────────────────────────────────

test.describe('PageTable sticky vertical header', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await login(page);
  });

  test('table header stays near top of viewport after scrolling down', async ({ page }) => {
    await gotoPageTable(page, '/finance/exchange-rates');

    const topBefore = await page.evaluate(() =>
      document.querySelector<HTMLElement>('.ant-table-header')?.getBoundingClientRect().top ?? -1,
    );

    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(150);

    const topAfter = await page.evaluate(() =>
      document.querySelector<HTMLElement>('.ant-table-header')?.getBoundingClientRect().top ?? -1,
    );

    expect(topAfter, 'Sticky header should remain in viewport after scrolling').toBeGreaterThanOrEqual(0);
    expect(topAfter, 'Sticky header should be within 200px of viewport top').toBeLessThan(200);
    expect(topAfter, 'Sticky header should have moved up (or stayed) relative to before scroll').toBeLessThanOrEqual(topBefore + 1);
  });
});
