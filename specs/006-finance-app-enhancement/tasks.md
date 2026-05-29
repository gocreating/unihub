# Tasks: Finance App Enhancement

**Input**: Design documents from `specs/006-finance-app-enhancement/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: No test tasks generated — this is a pure-frontend display/UX feature with no new business logic endpoints. The quality loop (`pnpm lint && pnpm typecheck && pnpm test`) validates TypeScript correctness after each story.

**Organization**: Tasks grouped by user story; stories can proceed in priority order after Phase 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on in-progress tasks)
- **[Story]**: Maps to user story label (US1–US5)

---

## Phase 1: Setup — Shared Utility Functions

**Purpose**: Create `src/utils/finance.ts` — the shared module required by US1, US3, and US5. Must be complete before those stories begin.

- [ ] T001 Create `apps/unihub/frontend/src/utils/finance.ts` exporting `formatAmount(value: string | number): string` (uses `Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` — produces `"1,234,567.50"` and `"-1,234.50"`) and `getCurrencySymbol(code: string): string` (lookup table: TWD→`"NT$"`, USD→`"$"`, EUR→`"€"`, JPY→`"¥"`, GBP→`"£"`, CNY→`"¥"`, HKD→`"HK$"`, SGD→`"S$"`; fallback returns `code` itself)

- [ ] T002 Add to `apps/unihub/frontend/src/utils/finance.ts`: (1) `export type GroupingDimension = 'type' | 'currency'`; (2) `export interface AggTreeNode { key: string; label: string; amount: Decimal; rawAmount: Decimal; currency?: string; children?: AggTreeNode[]; accountId?: string; accountName?: string; isLeaf: boolean }`; (3) `export function buildAggTree(balances: Balance[], dimensions: GroupingDimension[]): AggTreeNode[]` — when dimensions is empty return leaf nodes for each balance; otherwise group by the first dimension (`type` → `Decimal(b.amount).gte(0)` = `'asset'` else `'debt'`; `currency` → `b.currency`), recurse with remaining dimensions, compute `rawAmount = Decimal.sum(children.map(c => c.rawAmount))`, `amount = rawAmount.abs()`, sort children by `rawAmount` descending; import `Decimal` from `'decimal.js'` and `Balance` from `'../services/unihub-backend/finance'`

**Checkpoint**: `pnpm typecheck` from `apps/unihub/frontend/` passes with zero errors on the new file.

---

## Phase 2: User Story 1 — Consistent Numeric Display (Priority: P1) 🎯 MVP

**Goal**: All finance table cells that show monetary or rate amounts render with comma separators, right-alignment, and automatic decimal alignment.

**Independent Test**: Open any finance table (balance sheet detail, exchange rates); verify all amounts display as `"1,234,567.50"`, are right-aligned, and decimal points line up vertically across rows.

**Depends on**: T001

- [ ] T003 [US1] In `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx`: import `formatAmount` from `'../../utils/finance'`; update the Amount column definition to set `align: 'right'` and `render: (value: string) => formatAmount(value)`; also re-run `widthForHeader()` / `computeScrollX()` if the formatted width is wider than the current column width

- [ ] T004 [P] [US1] In `apps/unihub/frontend/src/pages/finance/exchange-rates/index.tsx`: import `formatAmount`; identify the rate/amount column(s) and update each with `align: 'right'` and `render: (value: string) => formatAmount(value)`; recalculate column width if needed

- [ ] T005 [P] [US1] In `apps/unihub/frontend/src/pages/finance/accounts/index.tsx`: review all columns for numeric amount values; if any exist apply `formatAmount` + `align: 'right'`; if no numeric columns exist, no change needed — mark done after inspection

- [ ] T006 [US1] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; resolve all warnings and type errors before proceeding

**Checkpoint**: All finance tables show comma-formatted, right-aligned amounts. Decimal points are vertically aligned because all values render with exactly 2 decimal places.

---

## Phase 3: User Story 2 — Balance Sheet Detail Pie Chart Visualizations (Priority: P2)

**Goal**: A visualization card (always visible) renders above the existing account table card on the balance sheet detail page, containing a chart selector and a switchable pie chart (one at a time).

**Independent Test**: Open a balance sheet detail page with ≥1 asset and ≥1 debt account; confirm a card with a Segmented control appears above the account table; switching between the three options changes the pie chart; opening a sheet with no debts shows an empty-state message on the "Debts Only" option.

**Depends on**: nothing (uses balance data already fetched by the detail page)

- [ ] T007 [US2] Add US2 i18n keys to `apps/unihub/frontend/src/locales/en-US/pages.ts` under `pages.finance.balanceSheets.detail.visualization`: `title: 'Visualization'`, `assetVsDebt: 'Asset vs Debt'`, `assetsOnly: 'Assets Only'`, `debtsOnly: 'Debts Only'`, `noAssets: 'No asset accounts'`, `noDebts: 'No debt accounts'`; add the identical keys (translated) to `apps/unihub/frontend/src/locales/zh-TW/pages.ts`: `title: '視覺化'`, `assetVsDebt: '資產 vs 負債'`, `assetsOnly: '僅資產'`, `debtsOnly: '僅負債'`, `noAssets: '無資產帳戶'`, `noDebts: '無負債帳戶'`

- [ ] T008 [US2] In `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx`: add `type BalanceDetailChartType = 'asset-vs-debt' | 'assets-only' | 'debts-only'` and `const [chartType, setChartType] = useState<BalanceDetailChartType>('asset-vs-debt')`; derive `assetBalances = balances.filter(b => new Decimal(b.amount).gte(0))` and `debtBalances = balances.filter(b => new Decimal(b.amount).lt(0))`; derive pie data for each chart type: `asset-vs-debt` → `[{ label: 'Asset', value: assetTotal.toNumber() }, { label: 'Debt', value: debtTotal.toNumber() }]`; `assets-only` → `assetBalances.map(b => ({ label: b.account_name, value: new Decimal(b.amount).toNumber() }))`; `debts-only` → `debtBalances.map(b => ({ label: b.account_name, value: new Decimal(b.amount).abs().toNumber() }))`

- [ ] T009 [US2] In detail.tsx: add a new Ant Design `Card` rendered above the existing net worth stats and account table; inside the card render: (1) `Segmented` control with options `[{ label: intl('assetVsDebt'), value: 'asset-vs-debt' }, { label: intl('assetsOnly'), value: 'assets-only' }, { label: intl('debtsOnly'), value: 'debts-only' }]` bound to `chartType`; (2) when the active pie data array is empty render `<Typography.Text type="secondary">{intl('noAssets' | 'noDebts')}</Typography.Text>`; (3) otherwise render `<Pie data={activePieData} angleField="value" colorField="label" />` from `@ant-design/plots`

- [ ] T010 [US2] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; resolve all issues before proceeding

**Checkpoint**: Balance sheet detail page shows visualization card above table; three chart options switch the displayed pie chart; empty states render correctly.

---

## Phase 4: User Story 3 — Balance Sheet Detail Tree Aggregation (Priority: P3)

**Goal**: A tree aggregation card (always visible) renders below the visualization card on the balance sheet detail page, letting the user select and order grouping dimensions to see nested subtotals.

**Independent Test**: Open a balance sheet detail page; select "Type" grouping — confirm Asset and Debt nodes appear with correct subtotals and descending sort; add "Currency" grouping — confirm nested type→currency tree; swap order to currency→type — tree re-nests accordingly.

**Depends on**: T002 (`buildAggTree`)

- [ ] T011 [US3] Add US3 i18n keys to `apps/unihub/frontend/src/locales/en-US/pages.ts` under `pages.finance.balanceSheets.detail.aggregation`: `title: 'Breakdown'`, `groupBy: 'Group by'`, `dimType: 'Type'`, `dimCurrency: 'Currency'`, `empty: 'Select at least one grouping dimension to see a breakdown'`, `col.group: 'Group'`, `col.amount: 'Amount'`, `label.asset: 'Asset'`, `label.debt: 'Debt'`; add translated versions to `apps/unihub/frontend/src/locales/zh-TW/pages.ts`: `title: '分組明細'`, `groupBy: '分組方式'`, `dimType: '類型'`, `dimCurrency: '幣別'`, `empty: '請選擇至少一個分組維度以查看明細'`, `col.group: '群組'`, `col.amount: '金額'`, `label.asset: '資產'`, `label.debt: '負債'`

- [ ] T012 [US3] In detail.tsx: import `GroupingDimension`, `buildAggTree` from `'../../utils/finance'`; add `const [selectedDimensions, setSelectedDimensions] = useState<GroupingDimension[]>([])`; add a new Ant Design `Card` below the visualization card containing: (1) a label using i18n `groupBy`; (2) `Select` with `mode="multiple"` and options `[{ value: 'type', label: intl('dimType') }, { value: 'currency', label: intl('dimCurrency') }]` — `onChange` replaces `selectedDimensions` with the new selection while preserving existing order (append new items to end, remove deselected); (3) for each dimension in `selectedDimensions`, render an up-arrow `Button` (disabled when first) and down-arrow `Button` (disabled when last) that swap adjacent elements in the array

- [ ] T013 [US3] In detail.tsx: inside the aggregation card, when `selectedDimensions.length === 0` render `<Typography.Text type="secondary">{intl('empty')}</Typography.Text>`; otherwise render `buildAggTree(balances, selectedDimensions)` as the `dataSource` of an Ant Design `Table` (NOT PageTable — this is a sub-table inside a Card, not the primary page table) with `childrenColumnName="children"`, `expandable={{ defaultExpandAllRows: true }}`, columns: `[{ title: intl('col.group'), dataIndex: 'label', key: 'label' }, { title: intl('col.amount'), dataIndex: 'amount', key: 'amount', align: 'right', render: (v: Decimal) => formatAmount(v.toString()) }]`; import `formatAmount` (already imported for T003)

- [ ] T014 [US3] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; resolve all issues before proceeding

**Checkpoint**: Balance sheet detail page shows three stacked cards: (1) net worth stats, (2) visualization/pie chart, (3) tree aggregation. Tree renders correctly for all grouping combinations.

---

## Phase 5: User Story 4 — Balance Sheet List Time-Series Visualizations (Priority: P4)

**Goal**: A visualization card (always visible) renders above the existing PageTable on the balance sheet list page, containing a chart selector and switchable time-series charts.

**Independent Test**: Open the balance sheet list page with ≥3 balance sheets; confirm a card with a Segmented control appears above the PageTable; "Net Worth Trend" option shows a line chart with dates on x-axis; "Balance Breakdown" option shows a stacked column chart; single-sheet case renders with one data point and no error.

**Depends on**: nothing (parallel to other stories after Phase 1)

- [ ] T015 [US4] Add US4 i18n keys to `apps/unihub/frontend/src/locales/en-US/pages.ts` under `pages.finance.balanceSheets.visualization`: `title: 'Trends'`, `netWorthTrend: 'Net Worth Trend'`, `stackedBreakdown: 'Balance Breakdown'`, `netWorth: 'Net Worth'`, `empty: 'No balance sheets yet'`; add translated versions to `apps/unihub/frontend/src/locales/zh-TW/pages.ts`: `title: '趨勢圖'`, `netWorthTrend: '淨資產趨勢'`, `stackedBreakdown: '餘額分析'`, `netWorth: '淨資產'`, `empty: '尚無資產負債表'`

- [ ] T016 [US4] In `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx`: import `useQueries` from `'@tanstack/react-query'` and `listBalances` from `'../../../services/unihub-backend/finance'`; after the existing `balanceSheets` query, add `const balanceQueries = useQueries({ queries: (balanceSheets ?? []).map(sheet => ({ queryKey: ['finance', 'balances', sheet.id] as const, queryFn: () => listBalances(sheet.id), enabled: Boolean(balanceSheets), })) })`; derive `const allBalancesLoading = balanceQueries.some(q => q.isLoading)` and `const anyBalanceError = balanceQueries.find(q => q.isError)`; add `useEffect(() => { if (anyBalanceError) message.error('Failed to load balance data') }, [anyBalanceError])`

- [ ] T017 [US4] In index.tsx: compute chart datasets from `balanceQueries` results: `netWorthData: { date: string; netWorth: number }[]` = `(balanceSheets ?? []).map((sheet, i) => ({ date: sheet.date, netWorth: (balanceQueries[i]?.data ?? []).reduce((sum, b) => sum.add(new Decimal(b.amount)), new Decimal(0)).toNumber() }))`; `stackedData: { date: string; accountName: string; amount: number }[]` = flatMap of all sheets' balances with each balance mapped to `{ date: sheet.date, accountName: b.account_name, amount: Number(b.amount) }`

- [ ] T018 [US4] In index.tsx: add `type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown'` and `useState<BalanceListChartType>('net-worth-trend')`; add a new Ant Design `Card` rendered above the existing `PageTable`; inside: (1) card title from i18n `visualization.title`; (2) `Segmented` control with two options bound to chart type; (3) when `allBalancesLoading` show `<Spin />`; (4) when `chartType === 'net-worth-trend'` and data is ready render `<Line data={netWorthData} xField="date" yField="netWorth" />` from `@ant-design/plots`; (5) when `chartType === 'stacked-breakdown'` render `<Column data={stackedData} xField="date" yField="amount" colorField="accountName" isStack />` from `@ant-design/plots`; (6) when `(balanceSheets ?? []).length === 0` show i18n `empty` placeholder

- [ ] T019 [US4] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; resolve all issues before proceeding

**Checkpoint**: Balance sheet list page shows visualization card above the PageTable; both chart types render correctly; loading and empty states work as expected.

---

## Phase 6: User Story 5 — Balance Sheet Form Currency Input (Priority: P5)

**Goal**: Amount input fields on the balance sheet create and edit forms show the currency symbol as a prefix and align typed values to the right.

**Independent Test**: Open the new balance sheet form; confirm each account's amount input shows the currency symbol (e.g., "NT$") as a prefix; typed amounts align to the right within the input; changing the currency (if applicable) updates the prefix.

**Depends on**: T001 (`getCurrencySymbol`)

- [ ] T020 [P] [US5] In `apps/unihub/frontend/src/pages/finance/balance-sheets/new.tsx`: import `getCurrencySymbol` from `'../../../utils/finance'`; for each account amount field, replace the current `Input` (or `InputNumber`) with Ant Design `InputNumber` configured as: `addonBefore={getCurrencySymbol(account.currency)}`, `controls={false}`, `style={{ width: '100%' }}`, `inputMode="decimal"`; add `style={{ textAlign: 'right' }}` to the inner input via the `className` approach or `style` on the input wrapper; ensure the value stored in state remains a string compatible with the API (use `InputNumber`'s `onChange` to convert back to string: `onChange={(v) => setAmount(String(v ?? ''))}`

- [ ] T021 [P] [US5] Apply the identical `InputNumber` changes to `apps/unihub/frontend/src/pages/finance/balance-sheets/edit.tsx`

- [ ] T022 [US5] Run `pnpm lint && pnpm typecheck && pnpm test` from `apps/unihub/frontend/`; resolve all issues before proceeding

**Checkpoint**: Balance sheet create and edit forms show currency-prefixed, right-aligned monetary inputs. Form submission still sends correct string values to the API.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation pass and terminology consistency check.

- [ ] T023 In both `apps/unihub/frontend/src/locales/en-US/pages.ts` and `zh-TW/pages.ts`, search for any existing uses of "asset" or "debt" terminology and verify they are consistent with the canonical definition (amount ≥ 0 = asset, amount < 0 = debt); update any inconsistent labels

- [ ] T024 Run the complete quality loop one final time from `apps/unihub/frontend/`: `pnpm lint && pnpm typecheck && pnpm test`; all three must exit with zero errors and zero warnings before the branch is ready for review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1)**: Requires T001 (formatAmount)
- **Phase 3 (US2)**: No phase dependency — can start any time after Phase 1
- **Phase 4 (US3)**: Requires T002 (buildAggTree)
- **Phase 5 (US4)**: No phase dependency — can start any time after Phase 1
- **Phase 6 (US5)**: Requires T001 (getCurrencySymbol)
- **Phase 7 (Polish)**: Requires all user story phases complete

### User Story Dependencies

- **US1 (P1)**: Depends on T001 only
- **US2 (P2)**: No dependency on other stories — independent
- **US3 (P3)**: Depends on T002 only — independent of US1/US2
- **US4 (P4)**: No dependency — independent
- **US5 (P5)**: Depends on T001 only — independent of US1/US2/US3/US4

### Within Each User Story

1. i18n keys task first (provides string IDs for subsequent component tasks)
2. State/data derivation task (computes the data needed by the render task)
3. Render/component task (uses derived data and i18n keys)
4. Quality loop task (validates TypeScript + lint + tests)

---

## Parallel Opportunities

### Phase 1 is sequential (same file, T001 → T002)

### After T001 completes, these can run in parallel:

```
T003 [US1] detail.tsx amount column
T004 [US1] exchange-rates/index.tsx
T005 [US1] accounts/index.tsx
T007 [US2] i18n keys
T015 [US4] i18n keys
```

### After T002 completes, add:

```
T011 [US3] i18n keys
```

### Within US2 (sequential within story):

```
T007 → T008 → T009 → T010
```

### Within US3 (sequential within story):

```
T011 → T012 → T013 → T014
```

### Within US4 (sequential within story):

```
T015 → T016 → T017 → T018 → T019
```

### US5 tasks T020 and T021 are parallel (different files):

```
T020 (new.tsx) ‖ T021 (edit.tsx) → T022
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001–T002)
2. Complete Phase 2 — US1 (T003–T006)
3. **STOP and validate**: All finance tables show correctly formatted amounts
4. Ship US1 as a standalone improvement

### Recommended Incremental Order

```
Phase 1 → US1 (P1) → US2 (P2) → US3 (P3) → US4 (P4) → US5 (P5) → Polish
```

Each phase delivers a visible, independently verifiable improvement.

### Parallel Solo Strategy

Because US2, US3, US4, and US5 all touch different parts of the codebase with no cross-story file conflicts, a solo developer can work through them sequentially without any merge risk. A two-developer team could split: one takes US1+US2+US3 (detail page work), the other takes US4+US5 (list page + forms).

---

## Notes

- `[P]` tasks within the same story are different files with no shared state — safe to run concurrently
- All Ant Design `Table` sub-tables within Cards (US3 tree aggregation) are standard `Table`, not `PageTable` — `PageTable` is the top-level page container only
- `@ant-design/plots` is already at `^2.6.0` in `package.json` — no `pnpm add` needed
- Every `message.error()` call satisfies Constitution Principle VII (no `<Alert>` above PageTable)
- Every new string key must appear in both locale files in the same task (Constitution Principle VIII)
