# Research: Finance App Enhancement

**Phase**: 0 — Research & Decision Log
**Date**: 2026-05-29
**Branch**: `006-finance-app-enhancement`

---

## Decision 1: Numeric Formatting Strategy

**Decision**: Use `Intl.NumberFormat` with `{ minimumFractionDigits: 2, maximumFractionDigits: 2 }` for rendering; wrap in a shared `formatAmount(value: string | number): string` utility in `src/utils/finance.ts`.

**Rationale**: `Intl.NumberFormat` is zero-dependency, available in all supported browsers, and produces locale-appropriate comma separators. The existing `decimal.js` import is used only for arithmetic precision, not rendering. Centralising formatting in a single utility avoids scattered `.toLocaleString()` calls and ensures consistency.

**Decimal alignment**: Fixed two-decimal-place output (`1,234.50` not `1,234.5`) combined with CSS `text-align: right` on the table column achieves automatic vertical decimal alignment — no monospace font or special CSS trick required.

**Alternatives considered**:
- `decimal.js .toFixed(2)` + manual comma insertion — works but more code than `Intl.NumberFormat`.
- `Intl.NumberFormat` with locale `'zh-TW'` — produces `NT$1,234.50`-style strings with currency embedded; rejected because the column already has currency context via the Currency Tag.

---

## Decision 2: Chart Library

**Decision**: Use `@ant-design/plots` (already at `^2.6.0` in `package.json`). No additional library installation required.

**Rationale**: `@ant-design/plots` is Ant Design's official charting solution, built on AntV G2. It integrates cleanly with the existing Ant Design theme and is already in the dependency tree. Key components needed:
- `Pie` — asset-vs-debt ratio, asset-only breakdown, debt-only breakdown
- `Line` — net worth trend (time on x-axis)
- `Column` with `isStack: true` — stacked account balance breakdown

**Chart data flow**:
- Pie charts: derived client-side from `listBalances(sheetId)` response already fetched by the detail page.
- Net worth trend: net worth computed client-side as `sum(balance.amount)` per sheet date, derived from parallel `listBalances` calls.
- Stacked breakdown: one `listBalances` call per sheet, all fired in parallel via TanStack Query `useQueries`; each result cached independently.

**Alternatives considered**:
- Recharts — not installed, would add ~150 kB to bundle.
- Chart.js / react-chartjs-2 — not installed, same concern.
- Custom SVG — disproportionate effort for this scope.

---

## Decision 3: Parallel Balance Fetching for List-Page Charts

**Decision**: Use TanStack Query `useQueries` to fetch `listBalances(sheetId)` for every balance sheet in parallel. Chart data is computed once all queries resolve.

**Rationale**: The stacked account balance chart requires per-account balance data for every sheet. The existing `listBalances(sheetId)` endpoint provides this, and with `useQueries`, each result is cached under its own key `['finance', 'balances', sheetId]`. Subsequent visits to the chart are instant. For ≤50 sheets and ≤20 accounts each, the total payload is small (<50 KB) and the parallel fetch completes in a single round-trip latency window.

**Loading UX**: Render the chart card with a `Spin` overlay while any query is still loading. On error, call `message.error()` per constitution Principle VII.

**Alternatives considered**:
- New backend endpoint `GET /finance/balance-sheets/all-balances/` returning all sheets' balances in one call — would require backend change (excluded by spec assumption). Could be added as a future optimisation.
- Sequential fetch — too slow; unacceptable UX even for small counts.

---

## Decision 4: Tree Aggregation Data Structure

**Decision**: Build the aggregation tree client-side using a recursive `buildAggTree(balances, dimensions)` function. Render with Ant Design `Table` using the `childrenColumnName="children"` prop for built-in expand/collapse.

**Rationale**: With ≤20 accounts per sheet, client-side grouping is instant. The function takes an ordered list of `GroupingDimension` values and recursively partitions balances by each dimension. Each node accumulates the sum of its children using `decimal.js` arithmetic. Ant Design's `Table` with `childrenColumnName` renders nested rows with built-in expand icons — no additional library needed.

**Node key strategy**: Composite key from the path of group values (e.g., `"type:asset/currency:TWD"`) ensures stable React keys and prevents render collisions.

**Alternatives considered**:
- `react-sortable-tree` for drag-and-drop tree — overkill; fixed aggregation dimensions don't need a full tree-editing UI.
- Backend aggregation endpoint — ruled out by spec assumption (frontend-only).

---

## Decision 5: Multi-Select Dimension Selector with Ordering

**Decision**: Use Ant Design `Select` with `mode="multiple"` for choosing dimensions. Maintain an ordered array in local state. Provide up/down arrow buttons (or drag handles using `@dnd-kit`) to reorder selected dimensions.

**Rationale**: With only 2 dimensions (`type`, `currency`) in v1, a simple `Select` + up/down buttons is sufficient and avoids adding a DnD library. If future dimensions are added (e.g., `account_type`, `year`), the pattern scales naturally.

**Default state**: No dimensions selected — shows the flat account list (standard table mode). User explicitly opts into grouping.

**Alternatives considered**:
- Fixed radio group (type | currency | type→currency | currency→type) — doesn't scale as dimensions grow; UX is more rigid.
- Drag-and-drop (react-beautiful-dnd, @dnd-kit) — appropriate if 4+ dimensions are expected; deferred.

---

## Decision 6: Currency Symbol Mapping

**Decision**: Create a `getCurrencySymbol(code: string): string` utility in `src/utils/finance.ts` using a hardcoded lookup table for common currencies, with the currency code itself as fallback.

```
TWD → NT$
USD → $
EUR → €
JPY → ¥
GBP → £
CNY → ¥
HKD → HK$
SGD → S$
```

**Rationale**: The currency list is fetched from the backend but does not currently include a symbol field. A lookup table covers all likely currencies in scope (TWD-centric personal finance). The fallback (show code) ensures no crash for unknown currencies.

**Alternatives considered**:
- `Intl.NumberFormat` with `style: 'currency'` to extract the symbol — complex extraction and locale-dependent output varies between browsers.
- Add `symbol` field to the Currency backend model — valid but requires backend change; deferred.

---

## Decision 7: Form Input Currency Prefix

**Decision**: Replace the current plain `Input` component with Ant Design `InputNumber` using the `addonBefore` prop for the currency symbol, `style={{ textAlign: 'right' }}` on the input element via the `controls={false}` variant.

**Rationale**: `InputNumber` with `addonBefore` renders the currency symbol in a visually separated prefix box, matching standard financial input conventions. `controls={false}` removes the up/down spinner arrows that are inappropriate for monetary amounts. The `formatter`/`parser` props on `InputNumber` can enforce comma display while the user types.

**Alternatives considered**:
- `Input` with `prefix` prop — `prefix` is inside the input field (overlaps with text), less standard than `addonBefore` for currency symbols.
- Custom styled `Input` with absolute-positioned prefix label — more complex without benefit.
