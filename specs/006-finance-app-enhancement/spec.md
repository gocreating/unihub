# Feature Specification: Finance App Enhancement

**Feature Branch**: `006-finance-app-enhancement`

**Created**: 2026-05-29  
**Implemented**: 2026-05-31  
**Status**: Implemented

**Input**: User description: "Finance app enhancement (GitHub issue #11)"

---

> **Reflection note (2026-05-31)**: This spec was written before implementation began. Significant scope was added during development. The original assumption that this was a "frontend-only" feature proved incorrect — backend model changes, new migrations, and backend tests were required. The chart library was replaced (ECharts instead of @ant-design/plots). A major unplanned feature (Account Color Attribute) was added. Tab/chart names diverged from the original spec. This document has been updated to reflect the actual delivered implementation.

---

## Clarifications

### Session 2026-05-29

- Q: Story 2 UI layout — visualization toggle or persistent two-card display? → A: Two-card layout: visualization card always visible above, account table card always visible below; no toggle between views
- Q: Story 3 grouping — single or multi-select with ordering? → A: User can select one or multiple group dimensions simultaneously and customize their order, creating a configurable nested hierarchy
- Q: Story 4 UI layout — follows Story 2 pattern? → A: Yes — chart card always visible above, balance sheet list card always visible below; no toggle
- Q: Visualization card — all charts simultaneously or one at a time? → A: One chart visible at a time; user switches between charts via a tab/button control within the card

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Numeric Display (Priority: P1)

When reviewing any financial data — balances, totals, amounts — the user sees numbers formatted with comma separators (e.g., 1,234,567.89) and right-aligned, making it easy to compare magnitudes at a glance. In tabular views, decimal points are vertically aligned across rows. When a base currency is selected, a net worth valuation column appears alongside the original amount column, showing the FX-converted equivalent.

**Status**: ✅ Implemented. `formatAmount()` + `getCurrencySymbol()` applied across all finance tables. `computeNetWorthInBase()` powers per-row valuation columns.

**Acceptance Scenarios**:

1. **Given** a finance table with multiple rows, **When** the user views balance amounts, **Then** all amounts display with comma separators (e.g., "1,234,567.89"), are right-aligned, and decimal points are vertically aligned
2. **Given** a single numeric amount outside a table, **When** the user views it, **Then** it displays with comma separators and right-alignment
3. **Given** a negative amount (debt), **When** the user views it, **Then** it displays with comma separators and right-alignment, with the minus sign included
4. **Given** a base currency is selected, **When** an exchange rate exists for an account's currency, **Then** a net worth column shows the converted amount prefixed with the base currency symbol
5. **Given** a base currency is selected but no exchange rate exists for an account, **Then** the net worth cell shows the standard `—` placeholder

---

### User Story 2 - Balance Sheet Detail Chart Visualizations (Priority: P2)

When reviewing a specific balance sheet, the user sees a persistent two-card layout: a visualization card above containing rose charts, and an account table card below always showing the account entries. The visualization card has four tabs: **A/L** (asset vs. debt ratio), **Assets Breakdown**, **Debts Breakdown**, and **Statistics** (tree aggregation — see US3).

All three chart tabs render **Nightingale rose charts** (`roseType: 'area'`) where each slice's area is proportional to its value. The A/L tab uses green for assets and red for debts. The per-account breakdown tabs use each account's custom color (falling back to a deterministic hash-based palette).

**Status**: ✅ Implemented. Chart library is ECharts v6.1.0 via `echarts-for-react`. Charts use option-level `color` arrays for reliable tab-switch color assignment.

**Acceptance Scenarios**:

1. **Given** a balance sheet detail page, **When** the user views the page, **Then** a four-tab visualization card is displayed above a persistent account table card, both always visible
2. **Given** the visualization card, **When** the user views the "A/L" tab, **Then** a nightingale rose chart renders with a green sector for total assets and a red sector for total debts
3. **Given** the "Assets Breakdown" tab, **When** rendered, **Then** each asset account is a differently-colored sector, sorted by net worth value descending, with the base currency symbol in the tooltip when a base currency is selected
4. **Given** the "Debts Breakdown" tab, **Then** same as above but for debt accounts (amounts shown as absolute values)
5. **Given** a balance sheet with no debt accounts, **When** the user views the Debts Breakdown tab, **Then** the chart shows a clear empty-state message
6. **Given** switching between tabs, **When** a previous tab used green/red colors, **Then** the next tab's per-account colors apply correctly (no bleed-through from previous option)

---

### User Story 3 - Balance Sheet Detail Statistics View (Priority: P3)

When reviewing a balance sheet detail, the user clicks the **Statistics** tab in the visualization card and sees a tree aggregation table. The user can select one or more grouping dimensions — **A/L Type** (asset/debt) and **Currency** (TWD, USD, etc.) — and reorder them via drag to define the nesting hierarchy.

Default state: all parent nodes expanded, account-level (leaf) rows collapsed. Group column width updates dynamically as rows are expanded or collapsed. Amount cells show `—` for nodes that aggregate across multiple currencies (summing TWD + USD is meaningless without FX conversion); currency-homogeneous nodes show the amount with the currency symbol prefix.

**Status**: ✅ Implemented. Statistics is the 4th tab in the visualization card. Uses `ProTable ghost` to avoid nested ProCard CSS interference with the card tab-bar border. Controlled `expandedRowKeys` drives both the tree state and the dynamic column width measurement.

**Acceptance Scenarios**:

1. **Given** the Statistics tab is selected with default grouping (A/L Type → Currency), **When** the tree renders, **Then** Asset and Debt parent nodes are expanded showing currency sub-nodes, but currency nodes are collapsed (accounts not visible by default)
2. **Given** a currency node (e.g., TWD), **When** the user clicks to expand it, **Then** individual accounts appear and the Group column widens to accommodate account names
3. **Given** the user drags to reorder dimensions to Currency → A/L Type, **Then** the tree re-renders with currency as outer groups
4. **Given** a node spanning multiple currencies (e.g., the "Asset" type node), **When** viewed, **Then** the Amount column shows `—` (cross-currency sum is meaningless)
5. **Given** a currency-homogeneous node (e.g., "TWD" under Asset), **When** viewed, **Then** Amount shows "NT$ 3,800,000.00" (currency symbol + value)
6. **Given** a base currency is selected, **When** any node is viewed, **Then** a Net Worth column shows the FX-converted total; root node shows total net worth across all accounts

---

### User Story 4 - Balance Sheet List Time-Series Visualizations (Priority: P4)

When viewing the list of all balance sheets, the user sees a persistent two-card layout: a visualization card above containing time-series charts, and the balance sheet list card below. Two chart types are available: **Equity Curve** and **Account Trend**.

**Equity Curve**: Single green/red line chart where the line and area fill are green when net worth ≥ 0 and red when < 0. Custom legend pills below the chart are **green for asset-majority accounts** and **red for debt-majority accounts**. Clicking a pill excludes that account from the net worth calculation, allowing what-if analysis.

**Account Trend**: Stacked area chart showing each account's balance contribution over time. Time axis is proportional to actual elapsed time (not categorical slots). Custom legend pills use each account's custom color. Clicking a pill hides/shows that account's area.

Both charts: custom "All" pill button with `CheckOutlined` / `MinusOutlined` / faded-`MinusOutlined` icons for checked/indeterminate/unchecked states.

**Status**: ✅ Implemented. Chart library is ECharts v6.1.0. ECharts `visualMap.continuous` with a 100-stop bicolor array achieves the sharp green/red line transition at y=0.

**Acceptance Scenarios**:

1. **Given** the balance sheet list page, **When** viewed, **Then** a two-tab visualization card renders above the balance sheet list table, both always visible
2. **Given** the Equity Curve tab, **When** net worth is positive throughout all dates, **Then** the entire line and fill area are green
3. **Given** the Equity Curve tab, **When** net worth crosses zero between dates, **Then** the line switches color at the crossing and the fill area reflects the sign
4. **Given** an asset-majority account's legend pill, **When** viewed, **Then** the pill background is green; for a debt-majority account it is red
5. **Given** the Account Trend tab, **When** viewed, **Then** each account's stacked area uses the account's custom color (or hash-based fallback)
6. **Given** a single balance sheet exists, **When** charts render, **Then** a single data point shows without error on both chart types

---

### User Story 5 - Balance Sheet Form Currency Input (Priority: P5)

When creating a new balance sheet entry, monetary input fields display the relevant currency symbol as a prefix.

**Status**: ✅ Implemented. `InputNumber` with `addonBefore={getCurrencySymbol(account.currency)}`.

**Acceptance Scenarios**:

1. **Given** the balance sheet creation form, **When** the user views a monetary input field, **Then** the currency symbol (e.g., "NT$", "$") appears as a prefix
2. **Given** a monetary input with a selected currency, **When** the user changes the currency, **Then** the prefix symbol updates to match the new currency

---

### User Story 6 - Account Color Attribute (Priority: added during implementation)

Each account carries an optional custom color, stored as a `#rrggbb` hex string. Users can assign a color from a 20-color Material Design preset palette or choose any custom hex color. In visualization contexts (charts, legend pills), the account's custom color is used; when no custom color is set, a deterministic hash-based color is assigned automatically so the same account always gets the same color.

In the Accounts table, a Color column shows a filled circle swatch (custom color) or `—` (unset). In charts, custom colors propagate through all series, area fills, and legend pills without requiring any user action after assignment.

**Status**: ✅ Implemented. `Account.color` field (backend). `resolveAccountColor(name, customColor?)` utility (frontend). ColorPicker with `placement="topLeft"` and `getPopupContainer` for modal containment.

**Acceptance Scenarios**:

1. **Given** an account with no color, **When** viewed in the Accounts table, **Then** the Color column shows `—`
2. **Given** the user clicks Edit on an account and opens the color picker, **When** they select a preset color and save, **Then** the Accounts table shows a colored circle in the Color column
3. **Given** an account with a custom color, **When** viewed in any chart (Equity Curve, Account Trend, Assets/Debts Breakdown), **Then** that account's chart series and legend pill use the custom color
4. **Given** an account with no custom color, **When** viewed in a chart, **Then** a consistent automatic color is shown (same account always gets the same auto-color regardless of list order)

---

### Edge Cases

- What happens when a balance sheet has no accounts — charts show empty state messages
- Negative debt amounts in pie/rose chart percentage calculations use absolute values
- Multi-currency aggregation nodes show `—` in Amount column (meaningless to add TWD + USD without FX); net worth column always shows the FX-converted total when a base currency is set
- Single balance sheet: time-series charts render with a single data point and no error
- Negative net worth: equity curve line/fill turn red below zero with a smooth color transition
- Maximum nesting depth: with two dimensions selected, tree has 4 levels (root → type → currency → accounts); renders correctly with all levels
- ColorPicker in modal: opens upward (`placement="topLeft"`) and is scoped to the modal (`getPopupContainer`) to prevent overflow
- Account color is stored as `#rrggbb` hex; the API must receive this format — `rgb(...)` returned by the browser's computed style is normalized to hex before the PATCH request

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All numeric financial amounts MUST display with comma separators and exactly 2 decimal places (e.g., `1,234,567.89`)
- **FR-002**: All numeric financial amounts in tabular views MUST be right-aligned
- **FR-003**: In tabular views, decimal points of numeric amounts MUST be vertically aligned across rows
- **FR-004**: "Asset" in the Finance domain MUST consistently refer to accounts with balance amount ≥ 0; "Debt" MUST consistently refer to accounts with balance amount < 0
- **FR-005**: Monetary input fields on balance sheet create/edit forms MUST display the relevant currency symbol as a prefix
- **FR-006**: The `Currency` model MUST include `is_base_currency: boolean`; only currencies with `is_base_currency=True` appear in the base currency selector
- **FR-007**: The `Account` model MUST include an optional `color: string` field storing a `#rrggbb` hex value; stored as empty string when unset
- **FR-008**: The balance sheet detail page MUST display a four-tab visualization card (A/L, Assets Breakdown, Debts Breakdown, Statistics) above the account table; both always visible
- **FR-009**: The A/L chart MUST use green (`#52c41a`) for the asset sector and red (`#ff4d4f`) for the debt sector
- **FR-010**: The Assets Breakdown and Debts Breakdown charts MUST use each account's custom color (via `resolveAccountColor()`), sort slices by net worth value descending, and prefix the base currency symbol in tooltip amounts when a base currency is selected
- **FR-011**: The Statistics tab MUST render a tree aggregation table with at minimum two grouping dimensions: A/L Type and Currency; dimensions are selectable and reorderable via drag
- **FR-012**: The Statistics tree MUST default to all parent nodes expanded and all account-level (leaf) nodes collapsed
- **FR-013**: The Statistics tree Group column width MUST recalculate from currently-visible row labels whenever rows are expanded or collapsed
- **FR-014**: Statistics Amount cells for nodes spanning multiple currencies MUST display `—`; currency-homogeneous nodes MUST display the amount with currency symbol prefix
- **FR-015**: The balance sheet list page MUST display a two-tab visualization card (Equity Curve, Account Trend) above the balance sheet list table; both always visible
- **FR-016**: The Equity Curve chart MUST render green when net worth ≥ 0 and red when net worth < 0, with the color transition at y=0
- **FR-017**: The Equity Curve legend pills MUST be colored green (asset-majority accounts) or red (debt-majority accounts); clicking a pill excludes/includes that account from the net worth calculation
- **FR-018**: The Account Trend chart MUST use each account's custom color; time axis MUST be proportional to actual elapsed time (not categorical)
- **FR-019**: Both charts' "All" pill button MUST use `CheckOutlined` (all active), `MinusOutlined` (partial/none) icon states and match the legend pill visual style
- **FR-020**: Account color assignment in charts MUST be deterministic: the same account name always resolves to the same color via `resolveAccountColor()` regardless of list ordering

### Key Entities

- **Currency**: Code (primary key), name, symbol, `is_base_currency` flag. Base currencies are eligible for net worth valuation selection.
- **Account**: ID, name, currency code, optional `color` (#rrggbb hex). Custom color propagates to all chart visualizations.
- **Balance Sheet**: Dated snapshot. Each sheet has zero or more Balance records.
- **Balance**: Links account + balance sheet + decimal amount. Sign convention: ≥ 0 = asset, < 0 = debt.
- **Exchange Rate**: Base/quote currency pair + decimal rate + date. Used for FX net worth conversion.

## Success Criteria *(mandatory)*

- **SC-001**: Users can scan any finance table and compare amounts without mental parsing — comma separators, right-alignment, decimal alignment across all finance tables
- **SC-002**: Users can determine their asset/debt composition and per-account breakdown from the balance sheet detail visualization card without any manual calculation
- **SC-003**: Users can explore their financial position through multiple aggregation dimensions from the Statistics tab and see correct subtotals; dynamic column widths keep the view uncluttered at all times
- **SC-004**: Users can identify their net worth trend direction from the Equity Curve (green = growing, red = declining) and understand per-account contributions from the Account Trend
- **SC-005**: Users entering amounts in balance sheet forms can identify the input currency from the prefix symbol without consulting a separate label
- **SC-006**: Users can assign a recognizable color to each account and see that color consistently across all chart views without any extra configuration

## Assumptions (as delivered)

- Currency symbols are derived from a hardcoded lookup table (`getCurrencySymbol()`) with a code-as-fallback for unknown currencies
- Backend model changes were required: `Currency.is_base_currency` and `Account.color` fields + migrations
- Cross-currency subtotals in aggregation nodes show `—` when the node spans multiple currencies; the Net Worth column (base currency) always shows a meaningful converted total when exchange rates are available
- All chart library work uses ECharts v6.1.0 (via `echarts-for-react`) with the SVG renderer; `@ant-design/plots` was evaluated but replaced due to ECharts being a better fit for custom legend, tooltip, and color requirements
- Account color is stored as `#rrggbb` hex (7 characters); the ColorPicker returns hex values which are normalized before API submission
- "Asset" and "Debt" terminology is enforced by sign convention in the data (not a separate boolean field)
