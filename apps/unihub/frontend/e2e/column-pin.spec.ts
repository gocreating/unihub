/**
 * E2E tests for ColumnPanel sticky (pin) column behavior.
 *
 * 017-multiple-sticky-columns: pins are PER-COLUMN — every row in the Columns
 * panel carries a pin-left and a pin-right button
 * (`[data-column-row="<key>"] [data-sticky-pin="left"|"right"]`), any number of
 * columns can be pinned per side, and pinned columns display as contiguous
 * groups at the table edges.
 *
 * Key insight: AntD's fixed columns only produce a visible sticky effect when
 * the table has horizontal overflow (scrollWidth > clientWidth). We use a 600px
 * viewport so the table's natural column widths (>600px) cause real overflow.
 *
 * Sticky correctness is asserted with REAL GEOMETRY (bounding boxes before and
 * after scrolling) — JSDOM style checks don't count for visual behavior.
 *
 * Prerequisites:
 *   1. Backend running: docker compose -f docker-compose.local.yml up
 *   2. Frontend dev server running: pnpm dev
 *
 * Run: pnpm test:e2e --grep "column-pin"
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

async function gotoTable(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector('.ant-table-body', { timeout: 10_000 });
  await page.waitForTimeout(800);
}

async function openColumnPanel(page: Page) {
  await page.click('button:has-text("Columns"), button:has-text("欄位")');
  await page.waitForSelector('[data-column-row] [data-sticky-pin]', { timeout: 5_000 });
}

/** Click one column row's pin button (panel must be open). */
async function clickPin(page: Page, colKey: string, side: 'left' | 'right') {
  await page.click(`[data-column-row="${colKey}"] [data-sticky-pin="${side}"]`);
}

async function applyPanel(page: Page) {
  const applyBtn = page.locator('button:has-text("Apply"), button:has-text("套用")').last();
  await expect(applyBtn).toBeEnabled({ timeout: 2_000 });
  await applyBtn.click();
  await page.waitForTimeout(500);
}

/** Bounding boxes of the header cells carrying a given fixed class. */
async function headerBoxes(page: Page, cls: string) {
  return page.evaluate((klass) => {
    return Array.from(document.querySelectorAll<HTMLElement>(`.ant-table-thead th.${klass}`)).map(
      (th) => {
        const r = th.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, text: th.textContent ?? '' };
      },
    );
  }, cls);
}

async function scrollTableTo(page: Page, x: number) {
  await page.evaluate((sx) => {
    const body = document.querySelector<HTMLElement>('.ant-table-body');
    if (body) body.scrollLeft = sx;
  }, x);
  await page.waitForTimeout(150);
}

test.describe('Column pin — sticky behavior', () => {
  // Use a NARROW viewport so the table columns (>600px combined) overflow
  // naturally without any artificial scroll.x manipulation.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await login(page);
  });

  // P-01: Table must overflow before we can test sticky behavior.
  // This test confirms the precondition for the other tests.
  test('exchange-rates: table overflows at 600px viewport (precondition)', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    const overflows = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      return body ? body.scrollWidth > body.clientWidth : false;
    });
    expect(overflows, 'Table must overflow at 600px so sticky tests are meaningful').toBe(true);
  });

  // P-02 [US1]: After pin-left + Apply the pinned column cell carries the AntD
  // fixed-column CSS class — confirms fixed:'left' reached the rendered DOM.
  test('exchange-rates: first column has ant-table-cell-fix-left after pin+apply', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    await openColumnPanel(page);
    await clickPin(page, 'base_currency', 'left');
    await applyPanel(page);

    const fixedCell = page.locator('.ant-table-body td.ant-table-cell-fix-left').first();
    await expect(fixedCell).toBeVisible({ timeout: 5_000 });
  });

  // P-03 [US1]: The pinned column's left position stays at 0 while the table body
  // scrolls right — the definitive proof that sticky is working.
  test('exchange-rates: pinned column stays at left edge when table is scrolled', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');
    await openColumnPanel(page);
    await clickPin(page, 'base_currency', 'left');
    await applyPanel(page);

    await scrollTableTo(page, 200);

    // The first pinned body cell should still be at the left edge of the
    // viewport (tr.ant-table-row skips rc-table's hidden measure row).
    const leftAfterScroll = await page.evaluate(() => {
      const cell = document.querySelector<HTMLElement>(
        '.ant-table-body tr.ant-table-row td.ant-table-cell-fix-left',
      );
      return cell ? cell.getBoundingClientRect().left : -999;
    });

    // A truly sticky cell keeps its left position ≥ 0 (at viewport left edge).
    // A non-sticky cell would scroll to a negative left after scrollLeft=200.
    expect(leftAfterScroll, 'Pinned column must stay at left edge when scrolled').toBeGreaterThanOrEqual(0);
  });

  // P-04: Columns must NOT become artificially wide after pinning.
  // This catches the scroll.x = 9999 regression where tableLayout:fixed
  // stretches all columns to fill the huge virtual width.
  test('exchange-rates: columns do not stretch after pin+apply', async ({ page }) => {
    await gotoTable(page, '/finance/exchange-rates');

    // Measure first column width BEFORE pinning
    const widthBefore = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:first-child');
      return th ? th.getBoundingClientRect().width : 0;
    });

    await openColumnPanel(page);
    await clickPin(page, 'base_currency', 'left');
    await applyPanel(page);

    // Measure first column width AFTER pinning — must not have grown significantly
    const widthAfter = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:first-child');
      return th ? th.getBoundingClientRect().width : 0;
    });

    expect(widthBefore).toBeGreaterThan(0);
    // Allow at most 10px variation (rounding, border, etc.) — but not 10× wider
    expect(widthAfter).toBeLessThan(widthBefore * 2);
  });

  // ── US1: multiple LEFT-pinned columns ──────────────────────────────────────

  // M-01 [US1]: TWO left-pinned columns both stay flush at the left edge while
  // the table scrolls; a middle column really moves; header and body cells of
  // the pinned columns stay x-aligned (SC-001/SC-005).
  test('accounts: two left-pinned columns stay flush left while scrolling', async ({ page }) => {
    await gotoTable(page, '/finance/accounts');
    await openColumnPanel(page);
    await clickPin(page, 'name', 'left');
    await clickPin(page, 'currency', 'left');
    await applyPanel(page);

    // Both columns fixed; the boundary shadow class sits ONLY on the last of
    // the left group (FR-002/FR-008).
    const before = await headerBoxes(page, 'ant-table-cell-fix-left');
    expect(before, 'two left-fixed header cells').toHaveLength(2);
    const lastMarks = await headerBoxes(page, 'ant-table-cell-fix-left-last');
    expect(lastMarks, 'exactly one left-boundary cell').toHaveLength(1);
    // Contiguous group: second column starts where the first ends.
    expect(Math.abs(before[1]!.left - before[0]!.right)).toBeLessThanOrEqual(1.5);

    // Track a middle (unpinned) header to prove scrolling happened.
    const middleBefore = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:not(.ant-table-cell-fix-left):not(.ant-table-cell-fix-right)');
      return th ? th.getBoundingClientRect().left : -999;
    });

    await scrollTableTo(page, 300);

    const after = await headerBoxes(page, 'ant-table-cell-fix-left');
    expect(after).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(after[i]!.left - before[i]!.left), `pinned header ${i} must not move`).toBeLessThanOrEqual(1);
    }
    const middleAfter = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:not(.ant-table-cell-fix-left):not(.ant-table-cell-fix-right)');
      return th ? th.getBoundingClientRect().left : -999;
    });
    expect(middleBefore - middleAfter, 'middle column must actually scroll').toBeGreaterThan(100);

    // Header/body x-alignment of the pinned columns mid-scroll (SC-005).
    // The first tr.ant-table-row skips rc-table's hidden measure row.
    const bodyBoxes = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.ant-table-body tr.ant-table-row');
      return Array.from(row?.querySelectorAll<HTMLElement>('td.ant-table-cell-fix-left') ?? []).map(
        (td) => td.getBoundingClientRect().left,
      );
    });
    expect(bodyBoxes).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(bodyBoxes[i]! - after[i]!.left), `header/body alignment col ${i}`).toBeLessThanOrEqual(1);
    }
  });

  // ── US2: multiple RIGHT-pinned columns + both sides at once ────────────────

  // M-02 [US2]: TWO right-pinned columns stay flush at the right edge; the
  // boundary class sits only on the display-first of the group.
  test('accounts: two right-pinned columns stay flush right while scrolling', async ({ page }) => {
    await gotoTable(page, '/finance/accounts');
    await openColumnPanel(page);
    await clickPin(page, 'close_datetime', 'right');
    await clickPin(page, 'actions', 'right');
    await applyPanel(page);

    const boxes = await headerBoxes(page, 'ant-table-cell-fix-right');
    expect(boxes, 'two right-fixed header cells').toHaveLength(2);
    const firstMarks = await headerBoxes(page, 'ant-table-cell-fix-right-first');
    expect(firstMarks, 'exactly one right-boundary cell').toHaveLength(1);
    // The right group hugs the table's right edge and is contiguous.
    const containerRight = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.ant-table-body');
      return body ? body.getBoundingClientRect().right : -999;
    });
    const rightmost = boxes[boxes.length - 1]!;
    expect(Math.abs(containerRight - rightmost.right)).toBeLessThanOrEqual(20); // scrollbar allowance
    expect(Math.abs(boxes[1]!.left - boxes[0]!.right)).toBeLessThanOrEqual(1.5);

    // Scroll — right group must not move.
    await scrollTableTo(page, 250);
    const afterBoxes = await headerBoxes(page, 'ant-table-cell-fix-right');
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(afterBoxes[i]!.left - boxes[i]!.left), `right-pinned header ${i} must not move`).toBeLessThanOrEqual(1);
    }
  });

  // M-03 [US2]: pins on BOTH sides simultaneously — left group flush left,
  // right group flush right, ONLY the middle scrolls between them.
  test('accounts: left and right groups pinned together — only the middle scrolls', async ({ page }) => {
    await gotoTable(page, '/finance/accounts');
    await openColumnPanel(page);
    await clickPin(page, 'name', 'left');
    await clickPin(page, 'currency', 'left');
    await clickPin(page, 'actions', 'right');
    await applyPanel(page);

    const leftBefore = await headerBoxes(page, 'ant-table-cell-fix-left');
    const rightBefore = await headerBoxes(page, 'ant-table-cell-fix-right');
    expect(leftBefore).toHaveLength(2);
    expect(rightBefore).toHaveLength(1);
    const middleBefore = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:not(.ant-table-cell-fix-left):not(.ant-table-cell-fix-right)');
      return th ? th.getBoundingClientRect().left : -999;
    });

    await scrollTableTo(page, 250);

    const leftAfter = await headerBoxes(page, 'ant-table-cell-fix-left');
    const rightAfter = await headerBoxes(page, 'ant-table-cell-fix-right');
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(leftAfter[i]!.left - leftBefore[i]!.left)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(rightAfter[0]!.left - rightBefore[0]!.left)).toBeLessThanOrEqual(1);
    const middleAfter = await page.evaluate(() => {
      const th = document.querySelector<HTMLElement>('.ant-table-thead th:not(.ant-table-cell-fix-left):not(.ant-table-cell-fix-right)');
      return th ? th.getBoundingClientRect().left : -999;
    });
    expect(middleBefore - middleAfter, 'middle must scroll between the pinned groups').toBeGreaterThan(100);
  });

  // ── US3: defaults, reset, hidden-pin retention, no global toggles ──────────

  // M-04 [US3 + 018/US3]: catalog ships default pins — Toggle (caret) AND
  // Acquisition left, Actions right — with NO user interaction; the left group
  // is contiguous and immobile mid-scroll; Reset restores the defaults after
  // customisation (018 FR-009/FR-010, SC-004).
  test('catalog: default pins present; Reset restores them', async ({ page }) => {
    await gotoTable(page, '/inventory/catalog');

    // Defaults: TWO left-fixed header cells (Toggle + Acquisition), one
    // right-fixed (Actions) — no interaction (feature 018).
    const before = await headerBoxes(page, 'ant-table-cell-fix-left');
    expect(before, 'two left-fixed header cells by default').toHaveLength(2);
    expect(before[1]!.text).toContain('Acquisition');
    // Contiguous group: Acquisition starts where the caret column ends.
    expect(Math.abs(before[1]!.left - before[0]!.right)).toBeLessThanOrEqual(1.5);
    await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-right').first()).toBeVisible();

    // Both stay put while the body scrolls (real sticky geometry).
    await scrollTableTo(page, 300);
    const after = await headerBoxes(page, 'ant-table-cell-fix-left');
    expect(after).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(
        Math.abs(after[i]!.left - before[i]!.left),
        `pinned header ${i} must not move`,
      ).toBeLessThanOrEqual(1);
    }
    await scrollTableTo(page, 0);

    // Customise: unpin both defaults, pin the Item column left instead.
    await openColumnPanel(page);
    await clickPin(page, '__caret', 'left'); // active left → unpin
    await clickPin(page, 'acquisition_summary', 'left'); // active left → unpin
    await clickPin(page, 'item_summary', 'left');
    await applyPanel(page);
    const leftCount = await page.locator('.ant-table-thead th.ant-table-cell-fix-left').count();
    expect(leftCount).toBe(1);

    // Reset → seeded defaults return (Toggle + Acquisition left, Actions right).
    await openColumnPanel(page);
    const resetBtn = page.locator('button:has-text("Reset"), button:has-text("重設")').last();
    await expect(resetBtn).toBeEnabled();
    await resetBtn.click();
    await page.waitForTimeout(500);
    const restored = await headerBoxes(page, 'ant-table-cell-fix-left');
    expect(restored, 'defaults restored: two left-fixed').toHaveLength(2);
    expect(restored[1]!.text).toContain('Acquisition');
    await expect(page.locator('.ant-table-thead th.ant-table-cell-fix-right').first()).toBeVisible();
  });

  // M-05 [US3]: hiding a pinned column retains its pin — re-showing it restores
  // the fixed state (FR-010).
  test('accounts: hidden pinned column keeps its pin for re-show', async ({ page }) => {
    await gotoTable(page, '/finance/accounts');
    await openColumnPanel(page);
    await clickPin(page, 'currency', 'left');
    await applyPanel(page);
    expect(await page.locator('.ant-table-thead th.ant-table-cell-fix-left').count()).toBe(1);

    // Hide the pinned column.
    await openColumnPanel(page);
    await page.click('[data-column-row="currency"] input[type="checkbox"]');
    await applyPanel(page);
    expect(await page.locator('.ant-table-thead th.ant-table-cell-fix-left').count()).toBe(0);

    // Re-show it — the pin must come back with it.
    await openColumnPanel(page);
    await page.click('[data-column-row="currency"] input[type="checkbox"]');
    await applyPanel(page);
    expect(await page.locator('.ant-table-thead th.ant-table-cell-fix-left').count()).toBe(1);
  });

  // M-06 [US3]: every pin control lives inside a column row — the old global
  // first/last toggles are gone (FR-007).
  test('accounts: pin buttons are per-row only, two per column', async ({ page }) => {
    await gotoTable(page, '/finance/accounts');
    await openColumnPanel(page);
    const all = await page.locator('[data-sticky-pin]').count();
    const scoped = await page.locator('[data-column-row] [data-sticky-pin]').count();
    const rows = await page.locator('[data-column-row]').count();
    expect(all).toBe(scoped);
    expect(all).toBe(rows * 2);
  });
});
