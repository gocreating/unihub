# Data Model: Finance App Enhancement

**Phase**: 1 — Design  
**Date**: 2026-05-29 | **Updated**: 2026-05-31 (reflects delivered implementation)  
**Branch**: `006-finance-app-enhancement`

---

## Backend Model Changes

### Currency (modified)

```python
class Currency(models.Model):
    code = models.CharField(max_length=3, primary_key=True)
    name = models.CharField(max_length=100)
    symbol = models.CharField(max_length=10, blank=True)
    is_base_currency = models.BooleanField(default=False)  # NEW
```

`is_base_currency=True` currencies appear in the base currency selector on all Finance pages. No uniqueness constraint enforced at the DB level.

### Account (modified)

```python
class Account(models.Model):
    id = models.CharField(max_length=12, primary_key=True, ...)
    name = models.CharField(max_length=200)
    currency = models.CharField(max_length=3)
    color = models.CharField(max_length=25, blank=True, default="")  # NEW — '#rrggbb'
    open_datetime = models.DateTimeField(null=True, blank=True)
    close_datetime = models.DateTimeField(null=True, blank=True)
```

`color` stores a `#rrggbb` hex string (7 chars). `max_length=25` accommodates the `rgb(...)` CSS format that browsers sometimes return; values are normalized to hex before storage. Empty string means "no custom color assigned."

---

## Frontend API Types (as delivered)

File: `apps/unihub/frontend/src/services/unihub-backend/finance.ts`

```typescript
interface Currency {
  code: string
  name: string
  symbol: string
  is_base_currency: boolean  // NEW
}

interface Account {
  id: string
  name: string
  currency: string
  color: string              // NEW — '#rrggbb' hex or '' (empty = unset)
  open_datetime: string | null
  close_datetime: string | null
}

interface Balance {
  id: string
  account_id: string
  account_name: string
  currency: string        // e.g., "TWD", "USD"
  amount: string          // signed decimal string; ≥0 = asset, <0 = debt
  color: string           // denormalized from account; '' if unset
}

interface BalanceSheet {
  id: string
  date: string
  created_at: string
  updated_at: string
}

interface ExchangeRate {
  id: string
  base_currency: string
  quote_currency: string
  rate: string
  date: string
}
```

---

## Frontend Utility Types

### `apps/unihub/frontend/src/utils/finance.ts`

```typescript
export type GroupingDimension = 'type' | 'currency'

export interface AggTreeNode {
  key: string          // composite path, e.g. "type:asset/currency:TWD"
  label: string        // display label: "Asset", "TWD", or account name
  amount: Decimal      // absolute value (always ≥ 0; for display and sort)
  rawAmount: Decimal   // signed value (negative for debt groups)
  /** Net worth in base currency. undefined = no base currency selected;
   *  null = base currency selected but rate unavailable for this node. */
  netWorthInBase?: Decimal | null
  currency?: string    // set on currency-dimension nodes AND leaf nodes;
                       // undefined on type-dimension nodes (spans multiple currencies)
  children?: AggTreeNode[]
  accountId?: string   // leaf nodes only
  accountName?: string // leaf nodes only
  isLeaf: boolean
}
```

### `apps/unihub/frontend/src/pages/finance/balance-sheets/detail.tsx` (inline)

```typescript
// Four tabs in the visualization card
type BalanceDetailChartType = 'asset-vs-debt' | 'assets-only' | 'debts-only' | 'aggregation'
```

### `apps/unihub/frontend/src/pages/finance/balance-sheets/index.tsx` (inline)

```typescript
type BalanceListChartType = 'net-worth-trend' | 'stacked-breakdown'

interface NetWorthDataPoint {
  date: string      // YYYY-MM-DD
  netWorth: number  // signed net worth (base currency when selected, raw sum otherwise)
}

interface StackedDataPoint {
  date: string
  accountName: string
  amount: number
  color: string     // account's custom color (may be '')
}
```

---

## Frontend Utility Functions

### `apps/unihub/frontend/src/utils/finance.ts`

#### `formatAmount(value: string | number | Decimal): string`

Formats a balance amount for display. Output: comma-separated, exactly 2 decimal places (`"1,234,567.50"`, `"-1,234.50"`). Uses `Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.

#### `getCurrencySymbol(code: string): string`

Maps currency code to display symbol. Fallback: returns the code itself.

| Code | Symbol | Code | Symbol |
|------|--------|------|--------|
| TWD  | NT$    | JPY  | ¥      |
| USD  | $      | GBP  | £      |
| EUR  | €      | HKD  | HK$    |
| CNY  | ¥      | SGD  | S$     |

#### `computeNetWorthInBase(amount, currency, baseCurrency, rates, targetDate?): Decimal | null`

Converts `amount` in `currency` to `baseCurrency` using the most recent exchange rate on or before `targetDate`.

- Direct rate: `base_currency = currency`, `quote_currency = baseCurrency` → `amount × rate`
- Inverse rate: `base_currency = baseCurrency`, `quote_currency = currency` → `amount / rate`
- Returns `null` when no applicable rate exists.

#### `buildAggTree(balances, dimensions, labels, parentKey?, computeNw?): AggTreeNode[]`

Recursively partitions a flat balance list into a nested tree.

- `dimensions`: ordered list of grouping dimensions (first = outer group)
- `labels`: `{ asset: string; debt: string }` — localized labels for type nodes
- `computeNw`: optional FX conversion function; each node accumulates `netWorthInBase` when provided
- Leaf nodes: `amount = raw.abs()`, `rawAmount = raw`; non-leaf nodes sum children
- Sort: descending by `rawAmount` at each level
- `currency` field: set to the currency code on currency-dimension nodes; `undefined` on type-dimension nodes

**groupKey logic**:
- `dim = 'type'`: `amount.gte(0) ? 'asset' : 'debt'`
- `dim = 'currency'`: `balance.currency`

#### `buildTreeWithRoot(treeData, totalNwInBase, rootLabel): AggTreeNode[]`

Wraps a tree in a root node (key: `'root'`) displaying the total net worth. When `treeData` is empty, root is a leaf showing the total only. Root label is `'All'` in the current implementation.

#### `reorderDimension(dims, dragging, target): GroupingDimension[]`

Moves `dragging` dimension to the position of `target` in the ordered list. Used by the drag-and-drop dimension reorder control.

---

### `apps/unihub/frontend/src/utils/chartData.ts`

#### `resolveAccountColor(accountName: string, customColor?: string): string`

Returns the account's display color for charts:
1. If `customColor` is a non-empty string → returns it (the account's custom `#rrggbb`)
2. Otherwise → djb2 hash of `accountName` → index into `ECHARTS_COLORS[Math.abs(h) % 36]`

The same name always resolves to the same color regardless of list order.

#### `ECHARTS_COLORS: readonly string[]`

36-color palette of maximally distinct hues at varying lightness and saturation. Used as the ECharts fallback palette and by `resolveAccountColor`.

#### `classifyAccountStacks(stackedData, accounts): Map<string, 'assets' | 'debts'>`

Classifies each account as `'assets'` (net total ≥ 0) or `'debts'` (net total < 0) across all balance sheet dates. Used to:
- Assign separate ECharts `stack` groups so assets stack upward and debts stack downward
- Color Equity Curve legend pills (green = assets, red = debts)

#### `buildNetWorthWithCrossings(netWorthData): { positiveData, negativeData }`

Splits a net worth time series into two subseries (positive and negative) with interpolated zero-crossing points. Both subseries share an `[x, 0]` data point at each sign change, so ECharts renders them as a continuous line that changes color exactly at y=0.

#### `computeGreenRedSeries(values): { greenVals, redVals }`

Alternative splitter for the single-series + visualMap approach: returns green (≥0) and red (<0) value arrays where adjacent values get `0` as a bridge to maintain line continuity. Used internally for reference; the delivered implementation uses `visualMap.continuous` with a 100-stop bicolor array for a sharper transition.

---

## Tree Expansion Helpers (detail.tsx)

```typescript
/**
 * Default expanded state: expand all non-leaf parent nodes EXCEPT those
 * whose children are all leaves (the level directly above accounts).
 * Those stay collapsed so accounts are hidden until the user explicitly opens them.
 */
function collectDefaultExpandedKeys(nodes: AggTreeNode[]): React.Key[] {
  // For each node with children:
  //   allChildrenAreLeaves = node.children.every(c => !c.children || !c.children.length)
  //   if allChildrenAreLeaves → skip (don't expand; user expands manually)
  //   else → push node.key, recurse into children
}

/**
 * Returns all nodes reachable through currently-expanded keys.
 * Used to compute aggDataWidths from only the visible row labels.
 */
function collectVisibleNodes(nodes: AggTreeNode[], expandedKeySet: Set<React.Key>): AggTreeNode[] {
  // Push node. If node.key ∈ expandedKeySet AND has children → recurse.
}
```

---

## Page-Level Component Contracts

### Balance Sheet Detail — Visualization Card

```
State:
  chartType: BalanceDetailChartType     default: 'asset-vs-debt'
  expandedKeys: React.Key[]             default: collectDefaultExpandedKeys(treeWithRoot)
  baseCurrency: string | undefined      from useBaseCurrency(baseCurrencies) hook

Derived:
  assetBalances = balances.filter(b => Decimal(b.amount) >= 0)
  debtBalances  = balances.filter(b => Decimal(b.amount) < 0)
  computeNw     = baseCurrency ? (amount, currency) => computeNetWorthInBase(...) : undefined
  treeData      = buildAggTree(balances, activeGrouping, aggLabels, '', computeNw)
  treeWithRoot  = baseCurrency ? buildTreeWithRoot(treeData, totalNwInBase, 'All') : treeData
  aggDataWidths = widths measured from collectVisibleNodes(treeWithRoot, expandedKeySet)

ECharts pie series (roseType: 'area'):
  'asset-vs-debt': color: ['#52c41a', '#ff4d4f']
                   data:  [{ name: 'Asset', value: assetTotal }, { name: 'Debt', value: debtTotal }]
  'assets-only':   color: [resolveAccountColor(acc, color) per item, sorted by nwv desc]
  'debts-only':    same as assets-only but for debtBalances

Statistics tab:
  ProTable ghost (no nested ProCard) + controlled expandedRowKeys
  Dimension selector: drag-reorderable checkboxes (Checkbox + Dropdown + HolderOutlined)
```

### Balance Sheet List — Visualization Card

```
State:
  chartType: BalanceListChartType         default: 'net-worth-trend'
  hiddenSeries: Set<string>               Account Trend toggle (clear on tab switch)
  excludedFromNetWorth: Set<string>       Equity Curve exclusion (clear on tab switch)
  baseCurrency: string | undefined

Data:
  useQueries — one query per balance sheet, fetches balances in parallel

Equity Curve (ECharts line, type: 'time'):
  data:       [[timestamp, netWorth], ...]
  visualMap:  continuous, type, min: -maxAbs, max: maxAbs
              inRange.color: [...50×'#ff4d4f', ...50×'#52c41a']
  Legend pills: green if classifyAccountStacks → 'assets', red if 'debts'
  "All" pill: CheckOutlined (all active) | MinusOutlined (partial or none)

Account Trend (ECharts stacked area, type: 'time'):
  stack: classifyAccountStacks result per account
  areaStyle.color: resolveAccountColor(acc, accountColors.get(acc))
  lineStyle.width: 0 (area only, no outline stroke)
  "All" pill: same icon pattern
```

---

## i18n Keys (as delivered)

All keys added to both `locales/en-US/pages.ts` and `locales/zh-TW/pages.ts`.

### `pages.finance.balanceSheets.detail`

| Suffix | en-US | zh-TW |
|--------|-------|-------|
| `visualization.assetVsDebt` | Asset vs Debt | 資產 vs 負債 |
| `visualization.assetsOnly` | Assets Only | 僅資產 |
| `visualization.debtsOnly` | Debts Only | 僅負債 |
| `visualization.noAssets` | No asset accounts | 無資產帳戶 |
| `visualization.noDebts` | No debt accounts | 無負債帳戶 |
| `aggregation.title` | Aggregation View | 彙總視圖 |
| `aggregation.groupBy` | Group by | 分組方式 |
| `aggregation.dimType` | A/L Type | 資產/負債類型 |
| `aggregation.dimCurrency` | Currency | 幣別 |
| `aggregation.empty` | Select at least one grouping dimension | 請選擇至少一個分組維度 |
| `aggregation.total` | Total Net Worth | 總淨值 |
| `aggregation.col.group` | Group | 群組 |
| `aggregation.col.amount` | Amount | 金額 |
| `aggregation.label.asset` | Asset | 資產 |
| `aggregation.label.debt` | Debt | 負債 |
| `col.account` | Account | 帳戶 |
| `col.amountWithSymbol` | Amount | 金額 |
| `col.netWorth` | Net Worth ({currency}) | 淨資產 ({currency}) |

### `pages.finance.balanceSheets` (list)

| Suffix | en-US | zh-TW |
|--------|-------|-------|
| `visualization.netWorthTrend` | Net Worth Trend | 淨資產趨勢 |
| `visualization.stackedBreakdown` | Balance Breakdown | 餘額分析 |
| `visualization.netWorth` | Net Worth | 淨資產 |
| `visualization.empty` | No balance sheets yet | 尚無資產負債表 |
| `baseCurrency.label` | Base Currency | 基準幣別 |
| `baseCurrency.none` | No base currency | 無基準幣別 |
| `col.netWorth` | Net Worth ({currency}) | 淨資產 ({currency}) |

### `pages.finance.accounts`

| Suffix | en-US | zh-TW |
|--------|-------|-------|
| `col.color` | Color | 顏色 |
| `form.color` | Color | 顏色 |

### `pages.finance.currencies`

| Suffix | en-US | zh-TW |
|--------|-------|-------|
| `col.isBaseCurrency` | Base Currency | 基準幣別 |
| `col.symbol` | Symbol | 符號 |
