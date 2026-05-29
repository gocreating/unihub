# Feature Specification: Finance App Enhancement

**Feature Branch**: `006-finance-app-enhancement`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Finance app enhancement (GitHub issue #11)"

## Clarifications

### Session 2026-05-29

- Q: Story 2 UI layout — visualization toggle or persistent two-card display? → A: Two-card layout: visualization card always visible above, account table card always visible below; no toggle between views
- Q: Story 3 grouping — single or multi-select with ordering? → A: User can select one or multiple group dimensions simultaneously and customize their order, creating a configurable nested hierarchy
- Q: Story 4 UI layout — follows Story 2 pattern? → A: Yes — chart card always visible above, balance sheet list card always visible below; no toggle
- Q: Visualization card — all charts simultaneously or one at a time? → A: One chart visible at a time; user switches between charts via a tab/button control within the card

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Numeric Display (Priority: P1)

When reviewing any financial data — balances, totals, amounts — the user sees numbers formatted with comma separators (e.g., 1,234,567.89) and right-aligned, making it easy to compare magnitudes at a glance. In tabular views, decimal points are vertically aligned across rows.

**Why this priority**: Numeric readability is foundational — it affects every finance page that shows amounts. Poor formatting makes values hard to compare; fixing this first delivers immediate, broad value.

**Independent Test**: Open any finance table with multiple rows of balance amounts and verify: comma separators appear, values are right-aligned, and decimal points align vertically across rows.

**Acceptance Scenarios**:

1. **Given** a finance table with multiple rows, **When** the user views balance amounts, **Then** all amounts display with comma separators (e.g., "1,234,567.89"), are right-aligned, and decimal points are vertically aligned
2. **Given** a single numeric amount outside a table, **When** the user views it, **Then** it displays with comma separators and right-alignment
3. **Given** a negative amount (debt), **When** the user views it, **Then** it displays with comma separators and right-alignment, with the minus sign included

---

### User Story 2 - Balance Sheet Detail Pie Chart Visualizations (Priority: P2)

When reviewing a specific balance sheet, the user sees a persistent two-card layout: a visualization card above containing pie charts, and an account table card below always showing the account entries. The visualization card contains three pie charts: overall asset-vs-debt ratio, asset-only account breakdown, and debt-only account breakdown.

**Why this priority**: Pie charts on the detail page reveal financial composition in a way tabular data cannot, directly answering "where is my money?" for a given snapshot. The always-visible table ensures the user never loses access to the raw data.

**Independent Test**: Open a balance sheet detail page with at least one asset account and one debt account; confirm a visualization card renders above the account table card, and that three pie charts are accessible in the visualization card.

**Acceptance Scenarios**:

1. **Given** a balance sheet detail page, **When** the user views the page, **Then** a visualization card is displayed above a persistent account table card, both always visible
2. **Given** the visualization card on the balance sheet detail page, **When** the user views it, **Then** a chart selector control is visible with three options: (1) asset vs. debt ratio, (2) asset-only account breakdown, (3) debt-only account breakdown — and exactly one pie chart is displayed at a time
3. **Given** the visualization card, **When** the user selects a different chart option, **Then** the displayed pie chart switches to the selected type
4. **Given** a balance sheet with no debt accounts, **When** the user views the debt-only pie chart, **Then** the chart shows an empty/zero state with a clear message

---

### User Story 3 - Balance Sheet Detail Tree Aggregation (Priority: P3)

When reviewing a balance sheet detail, the user can select one or more grouping dimensions simultaneously — account type (asset/debt), currency (TWD, USD, etc.) — and customize their order to define the nesting hierarchy of the resulting tree. Within each group, accounts are sorted by balance amount descending, and each group node shows the sum of its children.

**Why this priority**: Multi-dimensional tree aggregation lets users view their financial position from multiple angles simultaneously (e.g., by type then currency) without manual calculation, revealing structure invisible in a flat list.

**Independent Test**: Open a balance sheet detail page; select both "type" and "currency" grouping dimensions, set type as the outer group, and verify a nested tree appears with type nodes containing currency subnodes, each with correct subtotals and descending sort.

**Acceptance Scenarios**:

1. **Given** a balance sheet detail page, **When** the user selects the "type" grouping dimension only, **Then** accounts are grouped into "Asset" and "Debt" nodes, each showing the sum of child balances, with children sorted by amount descending
2. **Given** a balance sheet detail page, **When** the user selects both "type" and "currency" grouping dimensions with "type" as the outer group, **Then** a nested tree appears with type nodes (Asset, Debt) each containing currency subnodes, all with correct subtotals and descending sort at each level
3. **Given** two grouping dimensions are selected, **When** the user reorders the dimensions (e.g., swapping type and currency), **Then** the tree re-renders with the new nesting hierarchy applied
4. **Given** a group node in the tree, **When** the user views the node's total, **Then** it equals the sum of all its direct children's balance amounts

---

### User Story 4 - Balance Sheet List Time-Series Visualizations (Priority: P4)

When viewing the list of all balance sheets, the user sees a persistent two-card layout: a visualization card above containing time-series charts, and the balance sheet list card below always showing all entries. Two chart types are available within the visualization card: a net worth trend line and a stacked account balance breakdown.

**Why this priority**: Time-series charts reveal trends across snapshots — whether net worth is improving or declining — without needing to open individual balance sheets. The always-visible list ensures the user retains full navigation access.

**Independent Test**: Open the balance sheet list with at least three entries on different dates; confirm a visualization card renders above the list card, and that both time-series chart types are accessible in the visualization card.

**Acceptance Scenarios**:

1. **Given** the balance sheet list page, **When** the user views the page, **Then** a visualization card is displayed above a persistent balance sheet list card, both always visible
2. **Given** the visualization card on the balance sheet list page, **When** the user views it, **Then** a chart selector control is visible with two options: (1) net worth trend, (2) stacked balance breakdown — and exactly one chart is displayed at a time
3. **Given** the chart selector is on "net worth trend", **When** the user views the chart, **Then** it displays each balance sheet date on the x-axis and net worth on the y-axis
4. **Given** the chart selector is on "stacked balance breakdown", **When** the user views the chart, **Then** it shows each account's balance contribution stacked for each balance sheet date
5. **Given** the user selects a different chart option, **When** the selection changes, **Then** the visualization card switches to display the newly selected chart
6. **Given** only one balance sheet exists, **When** the user views the visualization card, **Then** charts render with a single data point and no error

---

### User Story 5 - Balance Sheet Form Currency Input (Priority: P5)

When creating a new balance sheet entry, monetary input fields display the relevant currency symbol as a prefix and align the entered value to the right, matching standard financial input conventions.

**Why this priority**: Form input clarity reduces data entry errors and aligns the creation experience with the display conventions established in other parts of the app.

**Independent Test**: Open the new balance sheet creation form; verify currency symbol appears as a prefix on monetary fields and typed values are right-aligned.

**Acceptance Scenarios**:

1. **Given** the balance sheet creation form, **When** the user views a monetary input field, **Then** the currency symbol (e.g., "NT$", "$") appears as a prefix and the input value is right-aligned
2. **Given** a monetary input with a selected currency, **When** the user changes the currency, **Then** the prefix symbol updates to match the new currency

---

### Edge Cases

- What happens when a balance sheet has no accounts — do charts show a clear empty state?
- How are negative debt amounts handled in pie chart percentage calculations (absolute value)?
- What if a balance sheet contains accounts in multiple currencies — how does the tree aggregation node display the subtotal when a single-dimension group contains mixed currencies?
- What if only one balance sheet exists — do the list-page time-series charts still render meaningfully with a single data point?
- What if net worth is negative — does the net worth trend chart handle negative y-axis values correctly?
- What if the user selects all available grouping dimensions — does the tree render correctly with maximum nesting depth?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All numeric financial amounts MUST display with comma separators (e.g., 1,234,567.89)
- **FR-002**: All numeric financial amounts in tabular views MUST be right-aligned
- **FR-003**: In tabular views, decimal points of numeric amounts MUST be vertically aligned across rows
- **FR-004**: The term "asset" in the finance domain MUST consistently refer to accounts with balance amount ≥ 0; "debt" MUST consistently refer to accounts with balance amount < 0
- **FR-005**: Monetary input fields on the balance sheet creation form MUST display the relevant currency symbol as a prefix
- **FR-006**: Monetary input fields on the balance sheet creation form MUST align entered values to the right
- **FR-007**: The balance sheet detail page MUST display a persistent two-card layout: a visualization card above (always visible) and an account table card below (always visible)
- **FR-008**: The visualization card on the balance sheet detail page MUST provide a chart selector control offering three options — (1) asset vs. debt ratio, (2) asset-only account breakdown by account, (3) debt-only account breakdown by account — displaying exactly one pie chart at a time
- **FR-009**: The balance sheet detail page MUST support flexible tree aggregation where the user can select one or more grouping dimensions simultaneously (at minimum: account type and currency) and customize the order of selected dimensions to define the nesting hierarchy
- **FR-010**: Within each aggregation group, accounts MUST be sorted by balance amount in descending order
- **FR-011**: Each aggregation group node MUST display the sum of its direct children's balance amounts
- **FR-012**: The balance sheet list page MUST display a persistent two-card layout: a visualization card above (always visible) and a balance sheet list card below (always visible)
- **FR-013**: The visualization card on the balance sheet list page MUST provide a chart selector control offering two options — (1) net worth trend (time on x-axis, net worth on y-axis) and (2) stacked balance breakdown (each account's balance contribution over time) — displaying exactly one chart at a time

### Key Entities

- **Balance Sheet**: A dated snapshot of all account balances representing the user's financial position at a point in time
- **Account Entry**: A single account within a balance sheet, carrying a currency, a balance amount, and a derived type ("asset" if amount ≥ 0, "debt" if amount < 0)
- **Currency**: The denomination of an account's balance (e.g., TWD, USD), which determines the display symbol used in inputs and labels

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can scan any finance table and compare balance amounts without mental parsing — all amounts consistently show comma separators, are right-aligned, and decimal points are vertically aligned
- **SC-002**: Users can determine their overall asset-vs-debt ratio and the breakdown of their largest assets and debts from the balance sheet detail visualization card without performing any manual calculations
- **SC-003**: Users can view their financial position grouped by multiple dimensions simultaneously from the balance sheet detail tree aggregation view and immediately see correct subtotals without leaving the page
- **SC-004**: Users can identify their net worth trend direction and understand how individual account balances have contributed to it over time, directly from the balance sheet list visualization card
- **SC-005**: Users entering amounts in the balance sheet creation form can identify the currency of each input field from the prefix symbol without consulting a separate label

## Assumptions

- Currency symbols are derivable from each account's currency code (e.g., TWD → "NT$", USD → "$") using standard mappings already available or trivially addable
- Multi-currency subtotals in tree aggregation nodes display the raw sum within each group in its own currency; cross-currency conversion is out of scope for this feature
- The balance sheet list and detail pages already render tabular data; visualization cards and tree aggregation are additive components displayed alongside existing tables
- All enhancements are display/frontend changes; no new backend API endpoints are required — existing data endpoints supply sufficient information for all visualizations and aggregations
- "Asset" and "debt" terminology clarification is a labeling/copy change; no data model changes are needed
