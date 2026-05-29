# Test Plan: PageTable Comprehensive Behavioral Tests

**Date**: 2026-05-29 | **Branch**: `005-apply-page-table-component`

This document enumerates every behavior of the `PageTable` component and its hooks, grouped by test file. It serves as the authoritative checklist for test implementation during the tasks phase.

---

## 1. Width Utilities — `utils.test.ts` (partially exists)

These tests already exist. Verify no gaps.

### `widthForHeader`

| ID | Test Case | Expected |
|----|-----------|----------|
| U-01 | `widthForHeader('Name')` | `{ width: 76 }` (4×8+44) |
| U-02 | `widthForHeader('Hi', 200)` | `{ width: 200 }` (floor wins) |
| U-03 | `widthForHeader('')` | `{ width: 44 }` (header pad only) |
| U-04 | `widthForHeader('A', 0)` — no floor | `{ width: 52 }` (1×8+44) |

### `measureTextWidth`

| ID | Test Case | Expected |
|----|-----------|----------|
| U-05 | `measureTextWidth(null)` | `0` |
| U-06 | `measureTextWidth(undefined)` | `0` |
| U-07 | `measureTextWidth('')` | `0` |
| U-08 | `measureTextWidth('Hello')` | `64` (5×8+24) |
| U-09 | `measureTextWidth('Hi', 10)` | `50` (2×8+24+10) |

### `computeScrollX`

| ID | Test Case | Expected |
|----|-----------|----------|
| U-10 | Three columns with explicit widths | Sum of widths |
| U-11 | Column without width, custom fallback | `width + fallback + width` |
| U-12 | Empty column array | `0` |
| U-13 | `computeScrollX([{width: 100}], 50)` | `100` |

---

## 2. `useStickyHeaderOffset` — `useStickyHeaderOffset.test.ts` (new file)

Test file location: `src/components/PageTable/useStickyHeaderOffset.test.ts`

| ID | Setup | Expected |
|----|-------|----------|
| H-01 | Initial render before effect | `toolbarTop=56`, `offsetHeader=56` |
| H-02 | Site header with `offsetHeight=72`, no toolbar | `toolbarTop=72`, `offsetHeader=72` |
| H-03 | Site header=72 + toolbar with `offsetHeight=48` | `toolbarTop=72`, `offsetHeader=120` |
| H-04 | No site header element in DOM | `toolbarTop=56` (fallback), `offsetHeader=56` |
| H-05 | Site header resizes from 72→48 (trigger ResizeObserver) | `offsetHeader` updates to new height |
| H-06 | Unmount — ResizeObserver is disconnected | No state updates after unmount |

---

## 3. `useStickyFix` — `PageTable.test.tsx` (new file)

Test via `PageTable` component render since `useStickyFix` is module-private.

| ID | Setup | Expected |
|----|-------|----------|
| F-01 | Render `<PageTable pageTitle="T" columns={[]} dataSource={[]} />` | `document.documentElement` has attribute `data-sticky-fix` |
| F-02 | Render PageTable | Injected `<style data-sticky-fix>` tag is present in `document.head` |
| F-03 | Injected style content | Contains `height:auto!important` rule for `html[data-sticky-fix]` |
| F-04 | Injected style content | Contains `overflow:visible!important` rule for `.ant-table` |
| F-05 | Unmount PageTable | `data-sticky-fix` attribute removed from `document.documentElement` |
| F-06 | Unmount PageTable | Injected `<style data-sticky-fix>` tag removed from `document.head` |

---

## 4. `PageTable` Component Rendering — `PageTable.test.tsx` (new file)

| ID | Props | Expected |
|----|-------|----------|
| P-01 | `pageTitle="Users"` | Renders an `h4` or equivalent with text "Users" |
| P-02 | `action={<button>Create</button>}` | Renders the button in the title row |
| P-03 | No `action` prop | Title row renders without action element |
| P-04 | No `headerTitle`, no `toolBarRender` | `.stickyToolbar` class NOT applied to wrapper |
| P-05 | `headerTitle={<div/>}` provided | `.stickyToolbar` class IS applied to wrapper |
| P-06 | `toolBarRender={() => []}` provided | `.stickyToolbar` class IS applied to wrapper |
| P-07 | `contentVisibility={true}` | `.contentVisibility` class IS applied |
| P-08 | `contentVisibility={false}` (default) | `.contentVisibility` class NOT applied |
| P-09 | `pagination={false}` (default) | ProTable receives `pagination={false}` |
| P-10 | `pagination={{ pageSize: 10 }}` passed | ProTable receives the pagination prop |
| P-11 | Any props | ProTable always receives `search={false}` |
| P-12 | Any props | ProTable always receives `options={false}` |
| P-13 | `dataSource={rows}` | ProTable renders the data rows |

---

## 5. `useStickyHorizontalScrollbar` — `PageTable.test.tsx`

These require a DOM environment with layout (jsdom mocks may be limited; skip tests that cannot be verified without real browser layout and mark them `@skip-jsdom`).

| ID | Setup | Expected |
|----|-------|----------|
| S-01 | Table body `scrollWidth > clientWidth` | Custom scrollbar `div[data-custom-scrollbar]` exists in DOM |
| S-02 | Table body `scrollWidth <= clientWidth` | Scrollbar `display: none` |
| S-03 | Render with footer in table | Scrollbar `bottom` = footer `offsetHeight` |
| S-04 | Render without footer | Scrollbar `bottom = '0px'` |
| S-05 | `.ant-table-sticky-scroll` present | Its `display` is forced to `none` |
| S-06 | Spacer element inside scrollbar | `spacer.style.width === body.scrollWidth + 'px'` |
| S-07 | Scroll custom bar left | `.ant-table-body.scrollLeft` syncs |
| S-08 | Scroll `.ant-table-body` | Custom bar `scrollLeft` syncs |
| S-09 | Scrolling not double-triggered | `syncingRef` guard prevents recursive updates |
| S-10 | Unmount | Custom scrollbar `div` removed from DOM |
| S-11 | Unmount | Scroll event listeners removed (no updates after unmount) |

---

## 6. `options` Prop — Behavioral Parity with ov-fleet

ov-fleet omits `options` from `PageTableProps` entirely (hardcodes `false`). Unihub exposes it. Verify the default matches ov-fleet:

| ID | Props | Expected |
|----|-------|----------|
| O-01 | No `options` prop passed | ProTable receives `options={false}` |
| O-02 | ov-fleet parity | `PageTableProps` does NOT allow `options` to be passed (check type: `options` should not be in the props type — or document the intentional difference) |

> **Note**: If allowing `options` override is intentional in unihub, document it as a deliberate deviation from ov-fleet in the Assumptions. If not, remove `options` from `PageTableProps` to match ov-fleet exactly.

---

## 7. CSS Behavioral Parity — Missing Toolbar Rules

The following CSS rules exist in ov-fleet's `stickyToolbar` style block but are absent from unihub:

| ID | Missing Rule | Impact | Testable? |
|----|-------------|--------|-----------|
| C-01 | `.ant-pro-table-list-toolbar-container-mobile` — `flex-direction: row` | Toolbar stacks vertically on mobile viewport | Visual / E2E |
| C-02 | `.ant-pro-table-list-toolbar-right .ant-space` — `gap`, `flex-wrap: nowrap` | Right toolbar items may wrap | Visual / E2E |
| C-03 | `@media (max-width: screenLG)` — `.toolbar-label { display: none }` | Toolbar button labels do not collapse on narrow viewports | Visual / E2E |

These rules should be added to `index.tsx` as part of the faithful ov-fleet copy. Unit tests cannot verify CSS application; these require manual browser verification or visual regression tooling.

**Action**: Add the three missing CSS rules to `index.tsx`. Document in checklist to visually verify toolbar layout at `<1024px` viewport width.

---

## 8. Per-Page `dataWidths` Pattern — Integration Checks

These are per-Finance-page behavioral checks, verified manually in the browser:

| ID | Page | Check |
|----|------|-------|
| D-01 | All Finance pages | No table cell value is visually truncated by column width at typical data |
| D-02 | All Finance pages | Horizontal scrollbar appears when table is wider than viewport |
| D-03 | All Finance pages | Sticky header columns stay aligned with body columns during horizontal scroll |
| D-04 | All Finance pages | `scroll.x` prop equals sum of all column widths |
| D-05 | `balance-sheets/detail.tsx` | Net worth footer renders at bottom of table viewport |
| D-06 | `balance-sheets/detail.tsx` | Net worth footer stays visible during vertical scroll |

---

## 9. Test Infrastructure Notes

- **Test runner**: Vitest with `@testing-library/react` and `jsdom`
- **Hook tests**: use `renderHook` from `@testing-library/react`
- **DOM measurements**: jsdom does not implement layout — `offsetHeight`, `scrollWidth`, `clientWidth` are all `0` by default. Tests S-01 through S-11 should mock these using `Object.defineProperty`
- **ResizeObserver**: jsdom does not implement ResizeObserver — must mock globally in test setup
- **MutationObserver**: available in jsdom but may behave differently — verify or mock
- **Existing test setup file**: check `src/test/setup.ts` or `vitest.config.ts` for global mocks

---

## 10. Test Coverage Target

| Area | Current | Target |
|------|---------|--------|
| `utils.ts` (widthForHeader, measureTextWidth, computeScrollX) | ~80% | 100% |
| `useStickyHeaderOffset` | 0% | 90%+ |
| `useStickyFix` (via PageTable) | 0% | 80%+ |
| `useStickyHorizontalScrollbar` (via PageTable) | 0% | 60%+ (limited by jsdom layout) |
| `PageTable` component rendering | 0% | 90%+ |
| Per-page `dataWidths` pattern | N/A (manual) | Manual browser verification |
| Missing toolbar CSS (C-01–C-03) | N/A | Manual browser verification |
