/**
 * E2E — Entity Views (016): the view tab row and URL deep-linking.
 *
 * US2 — tab-row geometry (FR-020): `[+]` fixed at the left edge, the tab
 * strip scrolls horizontally when it overflows, and the View control stays
 * fixed at the right edge — verified at a narrow viewport with real geometry
 * (project rule: layout claims need real-browser assertions, not JSDOM).
 *
 * US3 — deep links: a URL carrying `view[<tableKey>]` state applies it on
 * load; a saved-view reference with overrides shows the unsaved indicator.
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

test.describe('entity-views tab row (US2)', () => {
  test('renders [+] tabs [View] with the Tabular tab pinned by default', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();
    await expect(row.getByRole('tab', { name: 'Tabular' })).toBeVisible();
    await expect(row.getByLabel('New view tab')).toBeVisible();
    await expect(row.getByRole('button', { name: /^View/ })).toBeVisible();
  });

  test('narrow screens scroll the strip while [+] and [View] stay at the edges', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inventory/catalog');
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

    // Geometry: [+] hugs the row's left edge; View hugs the right edge.
    const rowBox = (await row.boundingBox())!;
    const addBox = (await addButton.boundingBox())!;
    const viewBox = (await row.getByRole('button', { name: /^View/ }).boundingBox())!;
    expect(Math.abs(addBox.x - rowBox.x)).toBeLessThanOrEqual(4);
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

test.describe('entity-views URL deep-linking (US3)', () => {
  test('an inline view URL applies its config on load and marks the tab dirty', async ({
    page,
  }) => {
    await login(page);
    // Inline state: sort by source ascending, page size 100.
    const inner = encodeURIComponent('type=inline&ordering=acquisition__source&page_size=100');
    await page.goto(`/inventory/catalog?view[inventory-catalog]=${inner}`);

    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();
    // Inline state differing from defaults shows the unsaved dot on the active tab.
    await expect(row.getByLabel('Unsaved changes').first()).toBeVisible();
    // The page-size select reflects the transported 100/page.
    await expect(page.getByText('100 / page').first()).toBeVisible();
  });

  test('editing the view query string navigates the table state', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await expect(page.getByTestId('view-tabs-row')).toBeVisible();

    const inner = encodeURIComponent('type=inline&page_size=100');
    await page.goto(`/inventory/catalog?view[inventory-catalog]=${inner}`);
    await expect(page.getByText('100 / page').first()).toBeVisible();
  });
});
