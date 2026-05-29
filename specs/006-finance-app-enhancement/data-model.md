# Data Model: Finance App Enhancement

**Phase**: 1 — Design
**Date**: 2026-05-29
**Branch**: `006-finance-app-enhancement`

---

## Existing Types (from generated openapi types — do not modify)

```typescript
// Already available via src/services/unihub-backend/finance.ts

interface Balance {
  id: string
  account_id: string
  account_name: string
  currency: string       // e.g., "TWD", "USD"
  amount: string         // decimal string, e.g., "1234.50"
}

interface BalanceSheet {
  id: string
  date: string           // ISO date, e.g., "2026-05-01"
  created_at: string
  updated_at: string
}

interface NetWorthResult {
  balance_sheet_id: string
  date: string
  per_currency: Array<{ currency: string; net_worth: string }>
}
```

---

## New Frontend Types

File: `apps/unihub/frontend/src/utils/finance.ts`

```typescript
// Grouping dimensions available for tree aggregation (extensible in future)
export type GroupingDimension = 'type' | 'currency'

// Node in the aggregated tree table
export interface AggTreeNode {
  key: string            // stable composite key, e.g. "type:asset" or "type:asset/currency:TWD"
  label: string          // display label, e.g. "Asset", "TWD"
  amount: Decimal        // sum of direct children's amounts (absolute for debt nodes)
  rawAmount: Decimal     // signed sum (negative for debt groups)
  currency?: string      // set only on leaf nodes or currency-grouped nodes
  children?: AggTreeNode[]
  // leaf-only fields:
  accountId?: string
  accountName?: string
  isLeaf: boolean
}
```

File: `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx` (inline types)

```typescript
// Chart selector for the detail visualization card
type BalanceDetailChartType = 'asset-vs-debt' | 'assets-only' | 'debts-only'

// Pie chart data point for @ant-design/plots Pie
interface PieDataPoint {
  label: string    // e.g., "Asset", "TWD — Savings Account"
  value: number    // absolute amount (always positive for pie charts)
}
```

File: `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` (inline types)

```typescript
// Chart selector for the list visualization card
type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown'

// Net worth trend chart data point for @ant-design/plots Line
interface NetWorthDataPoint {
  date: string      // YYYY-MM-DD
  netWorth: number  // signed sum of all balance amounts for this sheet
}

// Stacked breakdown data point for @ant-design/plots Column (isStack: true)
interface StackedDataPoint {
  date: string         // YYYY-MM-DD (x-axis)
  accountName: string  // series label (color field)
  amount: number       // balance amount on this date
}
```

---

## Utility Functions

File: `apps/unihub/frontend/src/utils/finance.ts`

### `formatAmount(value: string | number): string`

Formats a balance amount for display.

- Input: raw decimal string from API (`"1234567.50"`) or number
- Output: formatted string with comma separators and exactly 2 decimal places (`"1,234,567.50"`)
- Handles negative values: `"-1,234.50"`
- Uses `Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`

### `getCurrencySymbol(code: string): string`

Maps a currency code to its display symbol.

- Input: ISO 4217 currency code (`"TWD"`, `"USD"`)
- Output: symbol string (`"NT$"`, `"$"`)
- Fallback: returns the code itself for unmapped currencies

**Lookup table** (v1):
| Code | Symbol |
|------|--------|
| TWD  | NT$    |
| USD  | $      |
| EUR  | €      |
| JPY  | ¥      |
| GBP  | £      |
| CNY  | ¥      |
| HKD  | HK$    |
| SGD  | S$     |

### `buildAggTree(balances: Balance[], dimensions: GroupingDimension[]): AggTreeNode[]`

Recursively partitions a flat list of balances into a nested tree.

- Input: flat balance array + ordered list of grouping dimensions
- Output: top-level tree nodes; each node has `children` recursively
- Leaf nodes represent individual account balances
- Each non-leaf node's `amount` = `Decimal.sum` of all descendant leaf amounts
- `rawAmount` preserves sign; `amount` is absolute value (for display/sort purposes)
- Sort order: descending by `rawAmount` (largest positive asset first, largest absolute debt first within debt group)
- Node `key` is a `/`-delimited path: `"type:asset/currency:TWD"`

**Algorithm sketch**:
```
buildAggTree(balances, [dim, ...rest]):
  groups = groupBy(balances, balance => groupKey(balance, dim))
  return groups.map(([groupValue, groupBalances]) => {
    children = rest.length > 0
      ? buildAggTree(groupBalances, rest)   // recurse with remaining dims
      : groupBalances.map(toLeafNode)        // base case: leaf nodes
    return {
      key: `${dim}:${groupValue}`,
      label: groupLabel(dim, groupValue),
      rawAmount: sum(children.map(c => c.rawAmount)),
      amount: abs(sum(children.map(c => c.rawAmount))),
      children,
      isLeaf: false,
    }
  }).sort(byRawAmountDesc)
```

**`groupKey` logic**:
- `dim = 'type'`: `balance.amount >= 0 ? 'asset' : 'debt'`
- `dim = 'currency'`: `balance.currency`

---

## Page-Level Component Contracts

### Balance Sheet Detail Page — Visualization Card

```
Props: { balances: Balance[] }
State: { chartType: BalanceDetailChartType }  — local useState

Derived data:
  assetBalances  = balances.filter(b => Decimal(b.amount) >= 0)
  debtBalances   = balances.filter(b => Decimal(b.amount) < 0)
  assetTotal     = sum(assetBalances.map(b => Decimal(b.amount)))
  debtTotal      = abs(sum(debtBalances.map(b => Decimal(b.amount))))

Charts:
  'asset-vs-debt' → Pie([{ label: 'Asset', value: assetTotal }, { label: 'Debt', value: debtTotal }])
  'assets-only'   → Pie(assetBalances.map(b => ({ label: b.account_name, value: Decimal(b.amount) })))
  'debts-only'    → Pie(debtBalances.map(b => ({ label: b.account_name, value: abs(Decimal(b.amount)) })))
```

### Balance Sheet Detail Page — Tree Aggregation Section

```
Props: { balances: Balance[] }
State:
  selectedDimensions: GroupingDimension[]  — ordered list of selected dims
  
Derived:
  treeData = buildAggTree(balances, selectedDimensions)

UI:
  - Select (mode="multiple") for dimension selection
  - Up/down reorder buttons for each selected dimension
  - Table with childrenColumnName="children", columns: [label, currency (leaf only), amount]
```

### Balance Sheet List Page — Visualization Card

```
Props: { balanceSheets: BalanceSheet[] }
State: { chartType: BalanceListChartType }

Data fetching:
  useQueries({ queries: balanceSheets.map(sheet => ({
    queryKey: ['finance', 'balances', sheet.id],
    queryFn: () => listBalances(sheet.id),
  })) })

Derived:
  'net-worth-trend' → [{ date: sheet.date, netWorth: sum(balances.map(b => Decimal(b.amount))) }]
  'stacked-breakdown' → balances.flatMap(b => ({ date: sheet.date, accountName: b.account_name, amount: Number(b.amount) }))

Loading: Spin overlay while any query is loading
Error: message.error() per Principle VII
```

---

## i18n Key Plan

All keys added to both `locales/en-US/pages.ts` and `locales/zh-TW/pages.ts`.

### New keys under `pages.finance.balanceSheets.detail`

| Key | en-US | zh-TW |
|-----|-------|-------|
| `pages.finance.balanceSheets.detail.visualization.title` | Visualization | 視覺化 |
| `pages.finance.balanceSheets.detail.visualization.assetVsDebt` | Asset vs Debt | 資產 vs 負債 |
| `pages.finance.balanceSheets.detail.visualization.assetsOnly` | Assets Only | 僅資產 |
| `pages.finance.balanceSheets.detail.visualization.debtsOnly` | Debts Only | 僅負債 |
| `pages.finance.balanceSheets.detail.visualization.noAssets` | No asset accounts | 無資產帳戶 |
| `pages.finance.balanceSheets.detail.visualization.noDebts` | No debt accounts | 無負債帳戶 |
| `pages.finance.balanceSheets.detail.aggregation.title` | Breakdown | 分組明細 |
| `pages.finance.balanceSheets.detail.aggregation.groupBy` | Group by | 分組方式 |
| `pages.finance.balanceSheets.detail.aggregation.dimType` | Type | 類型 |
| `pages.finance.balanceSheets.detail.aggregation.dimCurrency` | Currency | 幣別 |
| `pages.finance.balanceSheets.detail.aggregation.empty` | Select at least one grouping dimension | 請選擇至少一個分組維度 |
| `pages.finance.balanceSheets.detail.aggregation.col.group` | Group | 群組 |
| `pages.finance.balanceSheets.detail.aggregation.col.amount` | Amount | 金額 |
| `pages.finance.balanceSheets.detail.aggregation.label.asset` | Asset | 資產 |
| `pages.finance.balanceSheets.detail.aggregation.label.debt` | Debt | 負債 |

### New keys under `pages.finance.balanceSheets` (list)

| Key | en-US | zh-TW |
|-----|-------|-------|
| `pages.finance.balanceSheets.visualization.title` | Trend | 趨勢圖 |
| `pages.finance.balanceSheets.visualization.netWorthTrend` | Net Worth Trend | 淨資產趨勢 |
| `pages.finance.balanceSheets.visualization.stackedBreakdown` | Balance Breakdown | 餘額分析 |
| `pages.finance.balanceSheets.visualization.netWorth` | Net Worth | 淨資產 |
| `pages.finance.balanceSheets.visualization.empty` | No balance sheets yet | 尚無資產負債表 |

### Modified keys (terminology clarification)

Review any existing use of "asset" / "debt" labels in the locale files against the canonical definition (amount ≥ 0 = asset, amount < 0 = debt) and update wording if inconsistent.
