# Implementation Plan: Apply PageTable Component

**Branch**: `005-apply-page-table-component` | **Date**: 2026-05-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-apply-page-table-component/spec.md`

## Summary

All Finance domain pages already use `PageTable`, but the ov-fleet `dataWidths` pattern is missing from every page. That single omission causes both reported bugs: cells truncate content (column too narrow) and the sticky header desynchronises during horizontal scroll (`scroll.x` is underestimated, making the header table narrower than the body). Fix: adopt the ov-fleet pattern — after data loads, compute per-column max content width with `measureTextWidth` and use `Math.max(headerWidth, dataWidth)` as column width. `PageTable/index.tsx` itself is correct; no component changes are needed. Additionally, the balance-sheets detail page needs a sticky footer for net worth. No backend changes. Quality loop green is the exit gate.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3

**Primary Dependencies**: Ant Design 5, `@ant-design/pro-components` 2.8, TanStack React Query 5, `react-intl`, `antd-style`

**Storage**: N/A (frontend-only change)

**Testing**: Vitest + React Testing Library

**Target Platform**: Desktop browser (modern Chrome/Firefox/Safari)

**Project Type**: Web SPA — single change to one page file + two locale files

**Constraints**: No `any` types, no `@ts-ignore`; i18n required for all user-facing strings (Principle VIII)

**Scale/Scope**: 1 page modified (`balance-sheets/detail.tsx`), 2 locale files updated, 1 exclusion comment added

## Constitution Check

*GATE: Must pass before implementation. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Entity-Centric Domain Architecture | ✅ Pass | Frontend-only; no model changes |
| II. Domain Independence | ✅ Pass | No cross-domain imports |
| III. Reference Implementation Alignment | ✅ Pass | PageTable from ov-fleet; footer uses ProTable `footer` prop per ov-fleet pattern |
| IV. API Contract-Driven Frontend | ✅ Pass | No new endpoints; `getNetWorth` already exists |
| V. Quality Loop | ⏳ Gate | `pnpm lint && pnpm typecheck && pnpm test` must be green after every change |
| VI. UI/UX Reference: ov-fleet | ✅ Pass | Footer layout follows ov-fleet Statistic/Flex pattern |
| VII. PageTable Layout | ✅ Pass | All Finance pages already use PageTable; footer moves net worth inside the white card |
| VIII. Internationalisation | ⏳ Gate | New footer i18n keys must be added to both `en-US` and `zh-TW` in the same commit |

**Post-Design Re-check**: Footer does not break Principle VII layout — it renders inside the `PageTable` white card via the `footer` prop, not outside it.

## Project Structure

### Documentation (this feature)

```text
specs/005-apply-page-table-component/
├── plan.md          ← this file
├── spec.md
├── research.md      ← Phase 0 code audit
├── quickstart.md    ← run + verify guide
└── tasks.md         ← Phase 2 (/speckit-tasks)
```

### Source Code (affected files)

```text
apps/unihub/frontend/src/
  components/PageTable/
    index.tsx               ← add 3 missing CSS rules (mobile toolbar, .ant-space, @media)
                              resolve `options` prop API parity with ov-fleet
    PageTable.test.tsx      ← NEW: component + hooks behavioral tests (see test-plan.md)
    useStickyHeaderOffset.test.ts  ← NEW: hook behavioral tests
    utils.test.ts           ← extend to 100% coverage
  pages/finance/
    currencies/index.tsx      ← add dataWidths pattern; recompute scroll.x
    accounts/index.tsx        ← add dataWidths pattern; recompute scroll.x
    exchange-rates/index.tsx  ← add dataWidths pattern; recompute scroll.x
    balance-sheets/
      index.tsx               ← add dataWidths pattern; recompute scroll.x
      new.tsx                 ← add dataWidths pattern; recompute scroll.x
      edit.tsx                ← add dataWidths pattern; recompute scroll.x
      detail.tsx              ← add dataWidths pattern; remove Cards above table; add footer prop
  locales/en-US/pages.ts   ← add pages.finance.balanceSheets.detail.footer.netWorth
  locales/zh-TW/pages.ts   ← add same key in Chinese
  components/ImportExport/
    ChangePreviewTable.tsx  ← add exclusion comment (no structural change)
```

## Phase 0: Research

See [research.md](research.md). Key conclusions:

1. **Both bugs share a single root cause**: the ov-fleet `dataWidths` pattern is missing from every Finance page. ov-fleet computes per-column max content width across all data rows and sets `column.width = Math.max(headerWidth, dataWidth)`. Finance pages use `widthForHeader` only → columns are too narrow → `scroll.x` is underestimated → sticky header and body table get different widths → misalignment during horizontal scroll.
2. **`PageTable/index.tsx` is correct** — it matches ov-fleet exactly. No component changes needed. The fix is entirely in per-page column definitions.
3. **One gap**: `balance-sheets/detail.tsx` renders net worth as `Statistic` Cards above the table (FR-007 sticky footer not yet implemented).
4. **ChangePreviewTable exclusion is correct**: embedded diff-preview sub-component — excluded from PageTable migration.
5. **Language, Music, People, Visiting**: placeholder pages with no data tables — not in scope.

## Phase 1: Design

### Sticky Footer — `balance-sheets/detail.tsx`

ProTable (and therefore PageTable) accepts `footer: (currentPageData: T[]) => ReactNode`. PageTable's CSS already makes `.ant-table-footer` sticky at `bottom: 0; position: sticky`. No PageTable component changes needed.

**Current layout:**
```
<Breadcrumb />
<Row gutter>                          ← net worth Cards ABOVE table
  <Col><Card><Statistic /></Card></Col>  × N currencies
</Row>
<PageTable … />
```

**Target layout:**
```
<Breadcrumb />
<PageTable
  …
  footer={() => (
    <NetWorthFooter netWorth={netWorth} />
  )}
/>
```

The `Row/Col/Card/Statistic` block is removed from above the table. A `NetWorthFooter` sub-component renders per-currency totals as a compact `Flex` row inside the sticky table footer:

```
Net Worth:   USD  5,000.00    TWD  100,000.00   …
```

Implementation details:
- Inline sub-component in `detail.tsx` (no separate file — only used here)
- Uses `Statistic` with `size="small"` inside a `Flex` with `gap="large"`
- Renders `null` when `netWorth` is loading or has no entries (same guard as current)
- `netWorth` query result already available in component scope — pass as prop

### i18n Delta

Two new keys, added to both locale files in the same commit:

| Key | en-US | zh-TW |
|-----|-------|-------|
| `pages.finance.balanceSheets.detail.footer.netWorth` | `Net Worth` | `淨資產` |

Existing key `pages.finance.balanceSheets.detail.netWorth` (used for the `{currency}` card title) is no longer needed after the migration and can be removed, OR retained if the Statistic `title` prop still uses it in the footer. Keep it to avoid translation churn.

### ChangePreviewTable — Documented Exclusion

Add a comment at the top of `ChangePreviewTable.tsx` explaining:
- Uses `antd/Table` directly (not PageTable) by design
- It is a diff-preview sub-component embedded in a panel — not a page
- PageTable's sticky/scrollbar behaviors require the document as the scroll container, which is incompatible with a panel-embedded context
- Small datasets with pagination ≤ 10; sticky header is not needed

No structural change to the component.

### Post-Design Constitution Re-check

| Principle | Status |
|-----------|--------|
| VII. PageTable Layout | ✅ Footer renders *inside* PageTable white card via `footer` prop — layout structure intact |
| VIII. i18n | ✅ New keys added to both locales in same commit |

## Complexity Tracking

No constitution violations to justify. No added complexity.
