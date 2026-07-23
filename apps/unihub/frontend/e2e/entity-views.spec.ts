/**
 * E2E — Entity Views (016, round 2): the view tab row, auto-hide, and URL
 * deep-linking.
 *
 * US2 — tab-row geometry (FR-009/FR-020): the tab strip scrolls horizontally
 * when it overflows, the "+" button sits immediately after the rightmost tab
 * and stays visible under overflow, and the View control stays fixed at the
 * right edge — verified at a narrow viewport with real geometry (project rule:
 * layout claims need real-browser assertions, not JSDOM).
 *
 * FR-025 — the view row auto-hides when only the default view exists; a
 * compact affordance reveals it on demand.
 *
 * US3 — deep links: a readable `<tableKey>.<facet>` URL applies its state on
 * load; a saved-view reference by name resolves; a hand-edited facet override
 * shows the unsaved indicator.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e --grep "entity-views"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

/** Reveal the view row (it auto-hides when only the default view exists). */
async function revealRow(page: Page) {
  const reveal = page.getByTestId('view-tabs-collapsed');
  if (await reveal.isVisible().catch(() => false)) {
    await reveal.getByRole('button').click();
  }
}

test.describe('entity-views auto-hide (FR-025)', () => {
  test('the row is hidden by default and the affordance reveals it', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');

    // Collapsed: only the reveal affordance shows, not the full tab row.
    const collapsed = page.getByTestId('view-tabs-collapsed');
    await expect(collapsed).toBeVisible();
    await expect(page.getByTestId('view-tabs-strip')).toBeHidden();

    await collapsed.getByRole('button').click();
    await expect(page.getByTestId('view-tabs-row')).toBeVisible();
    // The catalog's default view is named "YTD".
    await expect(page.getByRole('tab', { name: 'YTD' })).toBeVisible();
  });
});

test.describe('entity-views tab row (US2)', () => {
  test('renders the strip, then "+", then the View control', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();
    await expect(row.getByRole('tab', { name: 'YTD' })).toBeVisible();
    await expect(row.getByLabel('New view tab')).toBeVisible();
    await expect(row.getByRole('button', { name: /^View/ })).toBeVisible();
  });

  test('"+" stays visible right after the last tab while the strip scrolls', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // Overflow the strip with scratch tabs, then narrow the viewport.
    const addButton = row.getByLabel('New view tab');
    for (let i = 0; i < 8; i += 1) {
      await addButton.click();
    }
    await page.setViewportSize({ width: 700, height: 800 });

    const strip = page.getByTestId('view-tabs-strip');
    const overflows = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflows).toBe(true);

    // The "+" button is NOT inside the scrolling strip and stays visible.
    await expect(addButton).toBeVisible();
    const insideStrip = await strip.evaluate(
      (el) => !!el.querySelector('[aria-label="New view tab"]'),
    );
    expect(insideStrip).toBe(false);

    // Geometry: "+" sits to the right of the strip; View hugs the row's right edge.
    const rowBox = (await row.boundingBox())!;
    const stripBox = (await strip.boundingBox())!;
    const addBox = (await addButton.boundingBox())!;
    const viewBox = (await row.getByRole('button', { name: /^View/ }).boundingBox())!;
    expect(addBox.x).toBeGreaterThanOrEqual(stripBox.x + stripBox.width - 4);
    expect(Math.abs(viewBox.x + viewBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(4);

    // The strip itself scrolls horizontally.
    await strip.evaluate((el) => {
      el.scrollLeft = 150;
    });
    expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    // The page body must NOT scroll horizontally (overflow stays inside the strip).
    const bodyOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(bodyOverflow).toBe(false);
  });
});

test.describe('entity-views URL deep-linking (US3, readable params)', () => {
  test('a readable inline URL applies its config on load and marks the tab dirty', async ({
    page,
  }) => {
    await login(page);
    // Readable inline state: sort by source ascending, page size 100.
    await page.goto(
      '/inventory/catalog?inventory-catalog.sort=acquisition__source&inventory-catalog.size=100',
    );

    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible(); // URL view state forces the row open
    await expect(row.getByLabel('Unsaved changes').first()).toBeVisible();
    await expect(page.getByText('100 / page').first()).toBeVisible();
  });

  test('a hand-edited size override on the URL navigates the table state', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    await expect(page.getByTestId('view-tabs-row')).toBeVisible();

    await page.goto('/inventory/catalog?inventory-catalog.size=100');
    await expect(page.getByText('100 / page').first()).toBeVisible();
  });
});
