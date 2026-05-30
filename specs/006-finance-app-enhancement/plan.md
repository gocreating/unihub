# Implementation Plan: Finance App Enhancement

**Branch**: `006-finance-app-enhancement` | **Date**: 2026-05-29 | **Implemented**: 2026-05-31  
**Spec**: [spec.md](spec.md)

---

> **Reflection note (2026-05-31)**: This plan was written before implementation. Actual scope diverged significantly from the initial plan. Key divergences documented below; sections updated to reflect delivered state.

---

## Summary

Enhances the Finance domain across five dimensions:
1. **Universal numeric formatting** — comma separators, right-alignment, decimal alignment, base-currency net-worth valuation columns across all finance tables
2. **Account color attribute** — custom `#rrggbb` color per account; propagates through all chart series and legend pills
3. **Balance sheet detail visualization** — four-tab card: A/L rose chart, Assets Breakdown rose chart, Debts Breakdown rose chart, Statistics tree aggregation
4. **Balance sheet list visualization** — two-tab card: Equity Curve (green/red trend line with per-account legend exclusion) and Account Trend (stacked area with account colors)
5. **Form input polish** — currency-symbol prefix on monetary inputs in create/edit forms

**Scope expansion vs. initial plan**: The initial plan was frontend-only. Backend model changes were required to support the base currency selector and account color features.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3 (frontend); Python 3.12 / Django 5.x (backend)

**Chart Library**: `echarts` 6.1.0 + `echarts-for-react` 3.x (SVG renderer). `@ant-design/plots` was the original plan but was replaced — ECharts provides superior control over custom legends, tooltip positioning, `roseType`, and `visualMap` for green/red line coloring.

**Primary Frontend Dependencies** (additions to existing):
- `echarts` ^6.1.0
- `echarts-for-react` ^3.0.2
- `decimal.js` ^10 (already present)

**Backend Changes** (not in original plan):
- `Currency.is_base_currency` boolean field + migration
- `Account.color` varchar(25) field + migration
- Serializers updated; 98 new backend test assertions

**Testing**:
- Frontend: Vitest + React Testing Library (unit tests for utilities); Playwright E2E (41 chart behavior tests)
- Backend: pytest-django (integration tests for new model fields and serializers)

**Target Platform**: Desktop/tablet browser (Chrome, Safari, Edge)

**Performance Goals**: Charts render within 300 ms of data availability; parallel balance fetches complete within 1 s for ≤50 sheets

**Constraints**: `strict: true` TypeScript; zero ESLint warnings; every user-visible string i18n'd in both `en-US` and `zh-TW`

**Scale/Scope**: Personal-use tracker; typically < 50 balance sheets, < 20 accounts per sheet

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Entity-Centric Domain Architecture | ✅ PASS | Finance domain models follow domain-specific entity pattern established in v1 |
| II — Domain Independence | ✅ PASS | All changes are within the Finance domain; no cross-domain imports |
| III — Reference Implementation Alignment | ✅ PASS | Following existing PageTable, TanStack Query, react-intl, Ant Design patterns |
| IV — API Contract-Driven Frontend | ✅ PASS | Backend serializers updated + types derived from updated OpenAPI schema |
| V — Quality Loop Enforcement | ✅ PASS | `pnpm lint && pnpm typecheck && pnpm test` passing; `uv run ruff check && uv run pytest` passing |
| VI — UI/UX Reference: ov-fleet | ✅ PASS | Card layout, Tab controls, Table patterns follow ov-fleet conventions |
| VII — PageTable Layout | ✅ PASS | PageTable remains the tabular data component; visualization cards are additive siblings above. Query errors via `message.error()`. Embedded Statistics table uses `ProTable ghost` to avoid nested ProCard border artifacts |
| VIII — i18n (NON-NEGOTIABLE) | ✅ PASS | All new strings added to both `en-US/pages.ts` and `zh-TW/pages.ts` in the same commit |
| IX — Base Currency Net Worth Valuation | ✅ PASS | `is_base_currency` on Currency model; `useBaseCurrency` hook; valuation columns across all detail/list pages |
| X — Chart Rendering | ✅ PASS | All charts wrapped in `overflowX: auto` container; `minWidth: 480–600` on chart elements |
| XI — Chart Library & Visualization Standards | ✅ PASS | ECharts SVG renderer; option-level `color` arrays; `resolveAccountColor()` for deterministic palette |

## Project Structure

### Documentation

```text
specs/006-finance-app-enhancement/
├── plan.md         This file
├── spec.md         Feature specification (updated to reflect implementation)
├── data-model.md   Data model and utility API (updated to reflect implementation)
├── tasks.md        Task breakdown (updated with scope-expansion notes)
└── research.md     Phase 0 research (unchanged)
```

### Backend — Changed Files

```text
apps/unihub/backend/
├── finance/
│   ├── migrations/
│   │   ├── 0008_currency_add_is_base_currency.py   NEW
│   │   ├── 0009_account_add_color.py                NEW
│   │   └── 0010_account_color_max_length_25.py      NEW
│   ├── models.py          MODIFIED — is_base_currency on Currency; color on Account
│   └── serializers.py     MODIFIED — expose new fields in API response
└── tests/
    └── test_finance.py    MODIFIED — 98 new assertions for new fields
```

### Frontend — Changed Files

```text
apps/unihub/frontend/src/
├── utils/
│   ├── finance.ts          NEW — formatAmount, getCurrencySymbol, buildAggTree,
│   │                             buildTreeWithRoot, computeNetWorthInBase,
│   │                             reorderDimension, AggTreeNode, GroupingDimension
│   └── chartData.ts        NEW — resolveAccountColor, ECHARTS_COLORS,
│                                  buildNetWorthWithCrossings, computeGreenRedSeries,
│                                  classifyAccountStacks
├── hooks/
│   └── useBaseCurrency.ts  NEW — persists selected base currency in localStorage
├── components/
│   └── PageTable/
│       └── index.tsx       MODIFIED — pageTitle optional; noStickyFix prop
├── pages/finance/
│   ├── balance-sheets/
│   │   ├── index.tsx       MODIFIED — Equity Curve + Account Trend visualization card
│   │   ├── detail.tsx      MODIFIED — 4-tab viz card; Statistics tab; base currency
│   │   ├── new.tsx         MODIFIED — currency prefix on amount inputs
│   │   └── edit.tsx        MODIFIED — currency prefix on amount inputs
│   ├── accounts/
│   │   └── index.tsx       MODIFIED — color column; color picker in edit modal
│   ├── currencies/
│   │   └── index.tsx       MODIFIED — is_base_currency toggle
│   └── exchange-rates/
│       └── index.tsx       MODIFIED — formatAmount on rate column
├── services/unihub-backend/
│   └── finance.ts          MODIFIED — is_base_currency on Currency; color on Account
├── locales/
│   ├── en-US/pages.ts      MODIFIED — ~44 new i18n keys
│   └── zh-TW/pages.ts      MODIFIED — ~44 new i18n keys
└── e2e/
    ├── charts.spec.ts      NEW — 41 E2E chart behavior tests
    └── take-screenshots.spec.ts  NEW — PR screenshot capture spec
```

## Key Design Decisions

### ECharts over @ant-design/plots
`@ant-design/plots` (Ant Design's charting wrapper) was specified in the original plan. During implementation, ECharts was chosen instead because:
- `visualMap` enables the green/red equity curve without two-series hacks
- `roseType: 'area'` for nightingale charts is native
- Option-level `color` arrays are more reliable than per-item `itemStyle` when switching tabs with `notMerge`
- Tooltip `position` callback exposes `size.viewSize` for container-relative positioning (prevents viewport overflow)

### ProTable ghost for Statistics tab
The Statistics tab uses `ProTable ghost` directly (not `PageTable`) inside the AntD Card body. Embedding PageTable caused a persistent CSS conflict: PageTable's ProCard structure interfered with the parent Card's tab-bar `border-bottom`. Using `ProTable ghost` removes the ProCard wrapper and eliminates the interference.

### Controlled tree expansion + dynamic column widths
The Statistics tree uses controlled `expandedRowKeys` state. When rows expand/collapse, `aggDataWidths` recomputes from `collectVisibleNodes(treeWithRoot, expandedKeySet)`, which only measures labels of currently-visible rows. This keeps the Group column narrow in the default collapsed state and wider only when the user expands to see account names.

### resolveAccountColor determinism
Colors are assigned via djb2 hash of the account name, indexing into a 36-color palette (`ECHARTS_COLORS`). Custom colors (`Account.color`) take precedence. This ensures that the same account always gets the same color regardless of query result ordering, and charts never "flicker" color on re-renders.

### Visualization card tabs (AntD Card tabList)
The original plan used `Segmented` controls inside a titled Card. This was replaced with AntD Card's native `tabList` + `activeTabKey` + `onTabChange` pattern, which provides proper tab navigation with RWD overflow collapse at narrow widths and no font-imbalance between card title and tab labels.
