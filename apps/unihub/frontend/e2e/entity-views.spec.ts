/**
 * E2E — Entity Views (016, round 3): the view tab row, auto-hide, and URL
 * deep-linking.
 *
 * US2 — tab-row geometry (FR-009/FR-020, SC-006/SC-009/SC-010): the tab strip
 * scrolls horizontally with NO visible scrollbar (edge shadows hint instead),
 * the kebab stays fixed and fully visible at the row's right edge, and tabs
 * drag into a new order that survives a reload — verified at a narrow viewport
 * with real geometry (project rule: layout claims need real-browser
 * assertions, not JSDOM).
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

/** Add N scratch tabs through the kebab's "Add empty view" action. */
async function addScratchTabs(page: Page, count: number) {
  const row = page.getByTestId('view-tabs-row');
  for (let i = 0; i < count; i += 1) {
    await row.getByLabel('View menu').click();
    await page.getByRole('menuitem', { name: 'Add empty view' }).click();
  }
}

/** The tab labels currently rendered in the strip, left to right. */
async function tabLabels(page: Page): Promise<string[]> {
  return page
    .getByTestId('view-tabs-strip')
    .getByRole('tab')
    .allTextContents()
    .then((labels) => labels.map((label) => label.trim()));
}

/** Create a saved view from a fresh scratch tab and return its name.
 *  Round 4: naming happens in the Rename DIALOG, and Save never prompts. */
async function createSavedView(page: Page, name: string): Promise<string> {
  const row = page.getByTestId('view-tabs-row');
  await row.getByLabel('View menu').click();
  await page.getByRole('menuitem', { name: 'Add empty view' }).click();

  // The new tab is active: left-click opens its menu.
  await row.getByRole('tab').last().click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByLabel('View name').fill(name);
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(row.getByRole('tab', { name })).toBeVisible();

  // Save stores it under that label with no further dialog (SC-012).
  await row.getByRole('tab', { name }).click();
  await page.getByRole('menuitem', { name: 'Save' }).click();
  await expect(page.getByLabel('View name')).toHaveCount(0);
  return name;
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
  test('renders the strip, then the kebab at the row edge', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();
    await expect(row.getByRole('tab', { name: 'YTD' })).toBeVisible();
    await expect(row.getByLabel('View menu')).toBeVisible();
    // Round 3 removed the "+" button and the "View ▾" control; round 4 removed
    // the "Manage views…" entry, leaving exactly two.
    await expect(row.getByLabel('New view tab')).toHaveCount(0);
    await row.getByLabel('View menu').click();
    await expect(page.getByRole('menuitem', { name: 'Manage views…' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Add empty view' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('the kebab stays docked at the right edge while the strip scrolls (SC-006)', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    await addScratchTabs(page, 8);
    await page.setViewportSize({ width: 375, height: 800 });

    const strip = page.getByTestId('view-tabs-strip');
    const overflows = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflows).toBe(true);

    // The kebab is NOT inside the scrolling strip and stays fully visible.
    const kebab = row.getByLabel('View menu');
    await expect(kebab).toBeVisible();
    const insideStrip = await strip.evaluate(
      (el) => !!el.querySelector('[aria-label="View menu"]'),
    );
    expect(insideStrip).toBe(false);

    const rowBox = (await row.boundingBox())!;
    const kebabBox = (await kebab.boundingBox())!;
    expect(Math.abs(kebabBox.x + kebabBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(4);

    // The strip itself scrolls horizontally; the page body does not.
    await strip.evaluate((el) => {
      el.scrollLeft = 150;
    });
    expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const bodyOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(bodyOverflow).toBe(false);
  });

  test('the strip renders no scrollbar and hints overflow with edge shadows (SC-009)', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    await addScratchTabs(page, 8);
    await page.setViewportSize({ width: 500, height: 800 });

    const strip = page.getByTestId('view-tabs-strip');
    await expect
      .poll(async () => strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1))
      .toBe(true);

    // No scrollbar occupies any space, at any scroll position.
    const scrollbarHeight = await strip.evaluate((el) => el.offsetHeight - el.clientHeight);
    expect(scrollbarHeight).toBe(0);

    // At scroll 0: right shadow only.
    await strip.evaluate((el) => {
      el.scrollLeft = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByTestId('view-tabs-shadow-right')).toBeVisible();
    await expect(page.getByTestId('view-tabs-shadow-left')).toHaveCount(0);

    // Mid-scroll: both edges.
    await strip.evaluate((el) => {
      el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByTestId('view-tabs-shadow-left')).toBeVisible();
    await expect(page.getByTestId('view-tabs-shadow-right')).toBeVisible();

    // At the end: left shadow only.
    await strip.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByTestId('view-tabs-shadow-left')).toBeVisible();
    await expect(page.getByTestId('view-tabs-shadow-right')).toHaveCount(0);
  });

  test('a dragged tab keeps its own width — no horizontal stretching (SC-010)', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // A deliberately WIDE tab next to the narrow default: dnd-kit's default
    // transform would scale the dragged item to the width of the one it
    // passes, which is the reported stretching bug (R33).
    const wide = await createSavedView(page, `E2E a very wide view name ${Date.now()}`);
    const wideTab = row.getByRole('tab', { name: wide });
    const resting = (await wideTab.boundingBox())!;

    const target = row.getByRole('tab').first();
    const targetBox = (await target.boundingBox())!;
    await page.mouse.move(resting.x + resting.width / 2, resting.y + resting.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + 6, targetBox.y + targetBox.height / 2, { steps: 12 });

    // Mid-drag: the tab must still be its own width (±2px).
    const dragging = (await wideTab.boundingBox())!;
    expect(Math.abs(dragging.width - resting.width)).toBeLessThanOrEqual(2);

    await page.mouse.up();
    const settled = (await wideTab.boundingBox())!;
    expect(Math.abs(settled.width - resting.width)).toBeLessThanOrEqual(2);
  });

  test('dragging a tab reorders the strip and the order survives a reload (SC-010)', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // Two SAVED views are needed for the order to persist server-side.
    const first = await createSavedView(page, `E2E drag A ${Date.now()}`);
    const second = await createSavedView(page, `E2E drag B ${Date.now()}`);

    const before = await tabLabels(page);
    expect(before).toContain(first);
    expect(before).toContain(second);

    // Drag the LAST saved tab before the first one with real mouse moves.
    const source = row.getByRole('tab', { name: second });
    const target = row.getByRole('tab', { name: first });
    const sourceBox = (await source.boundingBox())!;
    const targetBox = (await target.boundingBox())!;
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + 4, targetBox.y + targetBox.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const labels = await tabLabels(page);
        return labels.indexOf(second) < labels.indexOf(first);
      })
      .toBe(true);

    // The persisted order comes back after a reload.
    await page.reload();
    await revealRow(page);
    await expect
      .poll(async () => {
        const labels = await tabLabels(page);
        return labels.indexOf(second) < labels.indexOf(first);
      })
      .toBe(true);
  });
});

test.describe('entity-views per-visit tabs (US2, round 5)', () => {
  test('a refresh keeps only pinned views and the URL\'s view (SC-013)', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // Two scratch tabs — neither is saved, so neither may survive a reload.
    await addScratchTabs(page, 2);
    const beforeCount = (await tabLabels(page)).length;
    expect(beforeCount).toBeGreaterThanOrEqual(3);

    await page.reload();
    await revealRow(page);
    await expect(row).toBeVisible();

    const after = await tabLabels(page);
    // Only the default/pinned views remain — every scratch tab is gone.
    expect(after.length).toBeLessThan(beforeCount);
    expect(after.some((label) => label.includes('New view'))).toBe(false);
  });

  test('the URL keeps an unpinned view open across a refresh', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');

    const name = await createSavedView(page, `E2E visit ${Date.now()}`);
    await expect(row.getByRole('tab', { name })).toBeVisible();
    // The saved view is unpinned, but it IS what the URL addresses.
    await expect.poll(async () => page.url()).toContain('inventory-catalog.view=');

    await page.reload();
    await expect(row.getByRole('tab', { name })).toBeVisible();
  });

  test('a revealed row stays revealed across a refresh (FR-025)', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    await expect(page.getByTestId('view-tabs-row')).toBeVisible();

    await page.reload();
    // No manual reveal this time — the display preference persisted.
    await expect(page.getByTestId('view-tabs-row')).toBeVisible();
  });
});

test.describe('entity-views unsaved indicator (US3, round 6)', () => {
  test('an untouched load stays clean across repeated reloads (SC-015)', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // Make the default view's STORED config differ from the page defaults —
    // the condition under which the pre-fix code published the pre-adoption
    // state as overrides.
    await page.getByText('25 / page').first().click();
    await page.getByTitle('100 / page').click();
    await expect(page.getByText('100 / page').first()).toBeVisible();

    const defaultTab = row.getByRole('tab').first();
    await defaultTab.click();
    await page.getByRole('menuitem', { name: 'Save' }).click();
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);

    for (let reload = 0; reload < 2; reload += 1) {
      await page.reload();
      await revealRow(page);
      await expect(row).toBeVisible();

      // Nothing was touched — no dot…
      await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
      // …and no override params were written for the next visit to replay.
      const url = new URL(page.url());
      const overrides = [...url.searchParams.keys()].filter(
        (key) => key.startsWith('inventory-catalog.') && key !== 'inventory-catalog.view',
      );
      expect(overrides).toEqual([]);
    }
  });
});

test.describe('entity-views inline state on reload (US3, round 7)', () => {
  test('an added empty view returns as its own tab, default untouched', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // The catalog's default view is "YTD" — a seeded year-to-date filter.
    const defaultTab = row.getByRole('tab', { name: 'YTD' });
    await expect(defaultTab).toBeVisible();
    const filteredCount = await page.getByRole('row').count();

    await row.getByLabel('View menu').click();
    await page.getByRole('menuitem', { name: 'Add empty view' }).click();
    await expect(row.getByRole('tab', { name: 'New view' })).toBeVisible();

    // The reported step: reload.
    await page.reload();
    await revealRow(page);
    await expect(row).toBeVisible();

    // The blank view comes back as its OWN tab, active…
    const restored = row.getByRole('tab', { name: 'New view' });
    await expect(restored).toBeVisible();
    await expect(restored).toHaveAttribute('aria-selected', 'true');

    // …and the default tab is present and CLEAN — no dot on arrival.
    await expect(defaultTab).toBeVisible();
    await expect(defaultTab.getByLabel('Unsaved changes')).toHaveCount(0);

    // The real regression: the default view still filters. Before the fix the
    // reload blanked its filter, so the catalog listed everything under "YTD".
    await defaultTab.click();
    await expect(defaultTab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => page.getByRole('row').count()).toBe(filteredCount);
    await expect(defaultTab.getByLabel('Unsaved changes')).toHaveCount(0);
  });
});

test.describe('entity-views indicator/URL agreement (US3, round 8)', () => {
  /** Override facets for this table — the view reference and page are not overrides. */
  function overrideParams(url: string): string[] {
    return [...new URL(url).searchParams.keys()].filter(
      (key) =>
        key.startsWith('inventory-catalog.') &&
        key !== 'inventory-catalog.view' &&
        key !== 'inventory-catalog.page',
    );
  }

  test('the dot and the override params appear and clear together (SC-016)', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    const name = await createSavedView(page, `E2E invariant ${Date.now()}`);
    const tab = row.getByRole('tab', { name });

    // Clean: bare reference, no dot.
    await expect(tab.getByLabel('Unsaved changes')).toHaveCount(0);
    await expect.poll(() => overrideParams(page.url())).toEqual([]);
    expect(page.url()).toContain('inventory-catalog.view=');

    // Edit: the dot AND exactly one override facet appear.
    await page.getByText('50 / page').first().click();
    await page.getByTitle('100 / page').click();
    await expect(tab.getByLabel('Unsaved changes')).toHaveCount(1);
    await expect.poll(() => overrideParams(page.url())).toEqual(['inventory-catalog.size']);

    // Save: both clear in the same step, leaving the compact form.
    await tab.click();
    await page.getByRole('menuitem', { name: 'Save' }).click();
    await expect(tab.getByLabel('Unsaved changes')).toHaveCount(0);
    await expect.poll(() => overrideParams(page.url())).toEqual([]);
    expect(page.url()).toContain('inventory-catalog.view=');
  });
});

test.describe('entity-views arrival + reset (round 9)', () => {
  test('navigating to the table lands clean, and stays clean on reload (SC-017)', async ({
    page,
  }) => {
    await login(page);
    // Arrive from somewhere else, as the nav menu does.
    await page.goto('/');
    await page.goto('/inventory/catalog');
    await revealRow(page);
    await expect(page.getByTestId('view-tabs-row')).toBeVisible();

    const overrides = () => {
      const url = new URL(page.url());
      return [...url.searchParams.keys()].filter(
        (k) => k.startsWith('inventory-catalog.') && k !== 'inventory-catalog.view',
      );
    };

    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
    expect(overrides()).toEqual([]);

    await page.reload();
    await revealRow(page);
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
    expect(overrides()).toEqual([]);
  });

  test('Reset changes clears the indicator and the override params (SC-018)', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');
    await revealRow(page);
    const row = page.getByTestId('view-tabs-row');
    await expect(row).toBeVisible();

    // Dirty the active view through the toolbar.
    await page.getByText('50 / page').first().click();
    await page.getByTitle('100 / page').click();
    await expect(page.getByLabel('Unsaved changes').first()).toBeVisible();
    await expect.poll(async () => page.url()).toContain('inventory-catalog.size');

    // Reset from the active tab's own menu — no confirmation dialog.
    await row.getByRole('tab').first().click();
    await page.getByRole('menuitem', { name: 'Reset changes' }).click();

    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
    await expect.poll(async () => page.url()).not.toContain('inventory-catalog.size');
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
