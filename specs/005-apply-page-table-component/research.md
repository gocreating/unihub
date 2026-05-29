# Research: Apply PageTable Component — Code Audit

**Date**: 2026-05-29 | **Branch**: `005-apply-page-table-component`

## Methodology

Direct code audit of `apps/unihub/frontend/src/` — scanned all `.tsx`/`.ts` files for `ProTable`, `PageTable`, `widthForHeader`, `computeScrollX`, and related imports.

## Finding 1: PageTable Component Exists But Has Two Active Bugs

**Location**: `apps/unihub/frontend/src/components/PageTable/`

> **Updated**: Two confirmed defects reported by the developer after initial audit. See Findings 6 and 7.

Files:
- `index.tsx` — main component (280 lines)
- `utils.ts` — `widthForHeader`, `measureTextWidth`, `computeScrollX`, `twoLineCellStyle`
- `useStickyHeaderOffset.ts` — hook measuring site header height for `sticky.offsetHeader`
- `utils.test.ts` — unit tests

**All six features from the spec are implemented:**

| Feature | Implementation |
|---------|---------------|
| Sticky top header | `ProTable sticky={{ offsetHeader }}` via `useStickyHeaderOffset` |
| Sticky bottom footer | `.ant-table-footer { position: sticky; bottom: 0 }` CSS |
| Body/document as scroll container | `useStickyFix` — patches `html/body/root` height to `auto`, `ant-table` overflow to `visible` |
| Sticky bottom horizontal scrollbar | `useStickyHorizontalScrollbar` — custom DOM scrollbar synced to table body scroll |
| Auto-fit column width | `widthForHeader(text, floor?)` and `computeScrollX(columns)` utilities |
| Sticky pinned columns | Native ProTable `fixed: 'left'/'right'` column option — works due to scroll fix |

**Decision**: No changes to `PageTable` component itself. It is production-ready.

## Finding 2: All Finance Pages Already Use PageTable

Scanned all files under `apps/unihub/frontend/src/pages/finance/`:

| File | Table Component | Status |
|------|----------------|--------|
| `currencies/index.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ✅ Complete |
| `accounts/index.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ✅ Complete |
| `exchange-rates/index.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ✅ Complete |
| `balance-sheets/index.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ✅ Complete |
| `balance-sheets/new.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ✅ Complete |
| `balance-sheets/edit.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ✅ Complete |
| `balance-sheets/detail.tsx` | `PageTable` + `widthForHeader` + `computeScrollX` | ⚠️ Missing footer |

All pages use `type { ProColumns }` imported from `@ant-design/pro-components` — this is correct; `ProColumns<T>` is the column definition type required by `PageTableProps`.

**Decision**: No migration work for Finance pages other than detail.

## Finding 3: Net Worth Not Yet a Sticky Footer

**Location**: `balance-sheets/detail.tsx` lines 34–80

The net worth query (`getNetWorth`) returns `{ per_currency: [{ currency, net_worth }] }`. Currently rendered as Ant Design `Statistic` cards in a `Row/Col` grid **above** the `PageTable`. This means:
- When the user scrolls down the balance rows table, the totals scroll off screen
- The sticky footer behavior of PageTable is unused

**Decision**: Move net worth rendering to the `footer` prop of `PageTable`. The existing `.ant-table-footer` sticky CSS in `PageTable/index.tsx` will make it stick. The `Row/Col/Card` block above the table is removed.

## Finding 4: ChangePreviewTable Uses `antd/Table` — Intentionally Excluded

**Location**: `apps/unihub/frontend/src/components/ImportExport/ChangePreviewTable.tsx`

Uses three inline components (`CreateTable`, `UpdateTable`, `DeleteTable`) each rendering `<Table>` from `antd` directly (not ProTable/PageTable).

**Why excluded from PageTable migration:**
1. It is a sub-component, not a page — Principle VII applies to pages
2. `useStickyFix` patches `document.documentElement` height; inside a panel with fixed parent height, this patch conflicts with the panel's scroll container
3. Data volumes are small (preview diffs, pagination ≤ 10) — sticky header/scrollbar provide no UX value
4. Tab-switching UX with 3 distinct table schemas (creates, updates, deletes) doesn't map to a single `PageTable` instance

**Alternatives considered:**
- *Convert each sub-table to PageTable*: Would add white card wrappers and title rows inside tabs — visually incorrect for a compact preview panel
- *Wrap entire ChangePreviewTable in PageTable*: Impossible — 3 tables with different columns cannot share one PageTable instance

**Decision**: Keep `antd/Table`. Add a code comment documenting the exclusion rationale.

## Finding 5: Non-Finance Pages Have No Tables

| Page | Status |
|------|--------|
| `language/LanguagePage.tsx` | Placeholder — Typography only, no table |
| `music/MusicPage.tsx` | Placeholder — Typography only, no table |
| `people/PeoplePage.tsx` | Placeholder — Typography only, no table |
| `io/index.tsx` | Uses `ChangePreviewTable` (covered in Finding 4) and `SyncTab` |

**Decision**: Language, Music, People — not in scope. IO — ChangePreviewTable excluded (Finding 4).

## Finding 6: Root Cause — Missing `dataWidths` Pattern from ov-fleet (causes BOTH bugs)

**Both reported bugs share a single root cause.**

ov-fleet's `cameras/index.tsx` uses a two-step column width strategy:

1. **`columnDefMap`**: builds column definitions with `widthForHeader(title)` as the minimum width (header text only)
2. **`dataWidths`**: a `useMemo` that loops over all loaded data rows and computes the maximum content width per column using `measureTextWidth(value, extraPx)` — e.g., `widths.serial_number = Math.max(prev, measure(cam.serial_number, COPY_ICON))`
3. **Final columns**: built as `Math.max(headerWidth, dataWidth)` per column — the column expands to fit data if data is wider than the header
4. **`scroll.x`**: computed as the sum of all final (data-widened) column widths

Finance pages in unihub skip steps 2–4 entirely. They only use `widthForHeader` and sum those values into `computeScrollX`. As a result:

- **Bug 1** (content truncation): columns are sized for header text only — data values longer than the header overflow/truncate
- **Bug 2** (header misalignment): `scroll.x` = sum of header-text widths < actual table body width. ProTable's sticky header uses `scroll.x` to set the header table width; the body expands beyond that, causing columns to desync during horizontal scroll

**Fix**: Adopt the ov-fleet `dataWidths` pattern in every Finance page. After data loads, compute per-column max content width and set `column.width = Math.max(widthForHeader(title).width, dataWidth)`. Recompute `scroll.x` from the updated column widths.

## Finding 7: CSS Diff — Three Rules Missing from Unihub's `stickyToolbar`

A line-by-line comparison of `PageTable/index.tsx` between ov-fleet and unihub reveals three CSS rules present in ov-fleet's `stickyToolbar` block that are absent from unihub:

```css
/* MISSING 1: mobile container class (ProTable's JS-applied mobile class) */
'& .ant-pro-table-list-toolbar-container-mobile': {
  flexDirection: 'row !important',
  flexWrap: 'nowrap !important',
  gap: `${token.marginXS}px !important`,
  overflowX: 'auto',
},

/* MISSING 2: right section .ant-space gap */
'& .ant-pro-table-list-toolbar-right .ant-space': {
  gap: `${token.marginXS}px !important`,
  flexWrap: 'nowrap !important',
},

/* MISSING 3: responsive icon-only collapse at <1024px */
[`@media (max-width: ${token.screenLG}px)`]: {
  '.ant-pro-table-list-toolbar button > .toolbar-label': {
    display: 'none',
  },
},
```

**Impact**: The mobile container rule prevents toolbar items from stacking vertically on narrow viewports. The `.ant-space` gap rule ensures toolbar right-section items don't wrap. The responsive collapse enables icon-only buttons at tablet widths. These are toolbar layout/polish issues that do not affect the main sticky behaviors.

**Fix**: Add all three rules to unihub's `stickyToolbar` style block.

## Finding 8: `options` Prop API Difference

ov-fleet `PageTableProps`: `Omit<ProTableProps<T, ...>, 'search' | 'options' | 'className'>` — `options` is removed from the public API, always `false`.

unihub `PageTableProps`: `Omit<ProTableProps<T, ...>, 'search' | 'className'>` — `options` is exposed with a default of `false`.

**Impact**: Minor API surface difference. Currently no page passes `options` so behavior is identical. If unihub intentionally allows override, document as a deliberate deviation. If not, remove `options` from `PageTableProps`.

## Finding 9: Zero Test Coverage on Hooks and Component

`utils.test.ts` covers the three utility functions only. All hooks and the component itself have zero automated tests:
- `useStickyFix` — 0 tests
- `useStickyHorizontalScrollbar` — 0 tests
- `useStickyHeaderOffset` — 0 tests
- `PageTable` component rendering — 0 tests

See `test-plan.md` for the 41-test-case specification.

## Summary of Required Work

| Task | Scope | Effort |
|------|-------|--------|
| Add `dataWidths` pattern to all Finance pages (fixes both bugs) | 7 page files | Medium per page |
| Add sticky footer (net worth) | `balance-sheets/detail.tsx` | Medium |
| Add 3 missing CSS rules to `PageTable/index.tsx` (Finding 7) | `PageTable/index.tsx` | Trivial |
| Resolve `options` prop API difference (Finding 8) | `PageTable/index.tsx` | Trivial |
| Write comprehensive tests (41 cases, Finding 9) | New test files | High |
| Add i18n key | `locales/en-US/pages.ts`, `locales/zh-TW/pages.ts` | Trivial |
| Add exclusion comment | `ChangePreviewTable.tsx` | Trivial |
| Quality loop | All | Trivial |
