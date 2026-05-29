# Feature Specification: Apply PageTable Component

**Feature Branch**: `005-apply-page-table-component`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Replace ProTable with PageTable to support sticky top table header, sticky bottom table footer, html body/document as the table scrolling container, sticky bottom horizontal scrollbar, auto fit content width cell, sticky header columns follow horizontal scrolling."

## Clarifications

### Session 2026-05-29

- Q: Which pages are in scope for migration — domain data pages only, or all tabular pages including IO/system? → A: All pages that render tabular data, including IO/system pages (import-export preview, sync preview). PageTable is the universal default for any tabular view.
- Q: Do any current ProTable instances use the built-in in-table search/filter toolbar that must be preserved? → A: No. ProTable's built-in search form is not used. All search, filter, and sort interactions are implemented as custom controls outside PageTable.
- Q: Does any current page have a footer/totals row that requires the sticky footer, or is it forward-looking only? → A: The Finance page has a totals row; the sticky footer must be active for it as part of this migration.
- Bug report: The current PageTable adoption has two confirmed defects that must be fixed as part of this feature: (1) column widths only account for header text length, not actual cell content width — cells are truncating data; (2) horizontal scrolling is broken — the sticky header does not follow the horizontal scroll position of the table body. The PageTable component is NOT yet production-ready; bug fixes are in scope.
- Root cause: Both bugs share a single missing pattern from ov-fleet. The ov-fleet reference implementation computes `dataWidths` — a per-column max content width measured across all data rows — and sets each column width to `Math.max(headerWidth, dataWidth)`. Finance pages in unihub use `widthForHeader` only (header text sizing), so column widths are too narrow, cell content overflows, AND `scroll.x` is underestimated. Because ProTable's sticky header uses `scroll.x` to size the header table, an underestimated `scroll.x` makes the header narrower than the body — causing misalignment during horizontal scroll. Fix: adopt ov-fleet's `dataWidths` pattern in every Finance page.
- Additional finding: A full code diff of `PageTable/index.tsx` between ov-fleet and unihub reveals three CSS rules missing from unihub's `stickyToolbar` block (mobile toolbar layout, right `.ant-space` gap, responsive button-label collapse at `<1024px`). These must be added for full parity.
- Testing requirement: The `PageTable` component, `useStickyFix`, `useStickyHorizontalScrollbar`, and `useStickyHeaderOffset` hooks have zero automated tests. Comprehensive behavioral tests must be written as part of this feature to ensure ov-fleet parity is maintained going forward. See `test-plan.md` for the full test specification (41 test cases across 9 categories).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan Long Data Tables Without Losing Context (Priority: P1)

A user opens a data page (e.g., Finance, Language, Music) that contains many rows. As they scroll down through the list, the column header row stays fixed at the top of the viewport so they always know which column they are looking at.

**Why this priority**: Without a sticky header, users must scroll back to the top to recall column names — a core usability regression for any data-heavy page.

**Independent Test**: Open any data list page, scroll down past the first screenful of rows, and verify that the column headers remain visible at the top of the viewport.

**Acceptance Scenarios**:

1. **Given** a data table with more rows than fit on screen, **When** the user scrolls down, **Then** the column header row remains fixed and fully visible at the top of the viewport.
2. **Given** a data table with more rows than fit on screen, **When** the user scrolls back to the top, **Then** the header row returns to its natural position at the top of the table.
3. **Given** a wide table that requires horizontal scrolling, **When** the user scrolls horizontally, **Then** the sticky header columns stay perfectly aligned with their corresponding body columns at all scroll positions.

---

### User Story 2 - Always-Accessible Horizontal Scrollbar for Wide Tables (Priority: P2)

A user views a table whose columns extend beyond the visible width. Without scrolling all the way to the bottom of the data, they can use a horizontal scrollbar that is always docked to the bottom of the viewport.

**Why this priority**: For wide tables with many columns, the native scrollbar appears only at the very bottom of the table content. Users must scroll all the way down to reach it, which is disruptive when the table has hundreds of rows.

**Independent Test**: Open a wide table (many columns), resize the browser to a narrower viewport so horizontal scrolling is needed, and confirm a horizontal scrollbar is docked at the bottom of the screen regardless of vertical scroll position.

**Acceptance Scenarios**:

1. **Given** a table that is wider than the viewport, **When** the user views any row position (top, middle, or bottom), **Then** a horizontal scrollbar is visible and usable at the bottom of the viewport.
2. **Given** the user drags the sticky horizontal scrollbar, **Then** the table content scrolls horizontally in sync.

---

### User Story 3 - Readable Column Widths Without Manual Tuning (Priority: P3)

A user loads a data table and each column is automatically sized to fit its header label and the typical cell content — no column is unnecessarily wide or truncated by default.

**Why this priority**: Manually specifying pixel widths for every column is error-prone and breaks when data changes. Auto-fit column widths reduce maintenance effort and improve readability out of the box.

**Independent Test**: Open a data page, inspect the columns, and verify that no column has excessive whitespace or truncated content on typical data.

**Acceptance Scenarios**:

1. **Given** a data table is loaded, **When** the user views the table, **Then** each column is wide enough to display its header label without truncation.
2. **Given** a data table is loaded with typical cell values, **When** the user views the table, **Then** no cell content is truncated by the column width — values are fully readable without hovering or expanding.
3. **Given** a data table is loaded, **When** the total of all column widths exceeds the viewport, **Then** the table becomes horizontally scrollable rather than squeezing columns.

---

### User Story 4 - Pinned Columns Stay Visible During Horizontal Scroll (Priority: P4)

A user scrolls a wide table horizontally to view columns on the right side. Columns that are designated as "sticky" (e.g., an entity name or ID column) remain fixed on the left side so the user can still identify which row they are reading.

**Why this priority**: Without frozen columns, horizontal scrolling loses row identity — the user cannot tell which entity a data cell belongs to.

**Independent Test**: Open a wide table that has a sticky column configured, scroll it horizontally, and verify the sticky column stays in place while other columns scroll beneath it.

**Acceptance Scenarios**:

1. **Given** a table with a sticky left column, **When** the user scrolls the table horizontally, **Then** the sticky column remains visible and aligned on the left side.
2. **Given** the user scrolls the table back to the leftmost position, **Then** the sticky column blends seamlessly with the rest of the table.

---

### Edge Cases

- What happens when a data table has zero rows? The sticky header is still displayed correctly with an appropriate empty-state message.
- What happens when the viewport is very narrow (mobile)? The table is still horizontally scrollable with the sticky scrollbar accessible.
- What happens when a page contains multiple tables? Each table manages its own sticky header and scrollbar independently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every data table view in the dashboard MUST display a header row that remains fixed at the top of the viewport during vertical scrolling AND stays horizontally aligned with the table body columns during horizontal scrolling.
- **FR-002**: Every data table view MUST provide a horizontal scrollbar that remains docked at the bottom of the viewport regardless of vertical scroll position.
- **FR-003**: The page body/document MUST act as the scrolling container (not an inner div with fixed height), so the browser's native scroll position is used for sticky positioning.
- **FR-004**: Column widths MUST be automatically calculated to fit both the column header text AND the typical cell content — no cell data must be truncated by default without manual per-column overrides.
- **FR-005**: Columns designated as sticky/pinned MUST remain horizontally fixed and aligned with their corresponding header cells during horizontal scrolling.
- **FR-006**: All pages that render tabular data MUST be migrated to use PageTable — this includes all domain pages (Finance, Language, Music, People, Visiting, and future domains) AND system/utility pages such as the IO import-export preview and sync preview tables.
- **FR-007**: The Finance page MUST display a sticky footer row (totals/summary) that remains fixed at the bottom of the viewport during vertical scrolling. Other domain pages MAY use a sticky footer if they have summary rows; PageTable must support it as a ready capability.
- **FR-008**: The `PageTable` component and all its hooks (`useStickyFix`, `useStickyHorizontalScrollbar`, `useStickyHeaderOffset`) MUST have automated behavioral tests covering the cases enumerated in `test-plan.md`. The existing `utils.test.ts` must achieve 100% coverage of the utility functions.
- **FR-009**: `PageTable/index.tsx` MUST include the three missing CSS rules present in the ov-fleet reference: mobile toolbar container layout, right toolbar `.ant-space` gap/wrap, and responsive button-label collapse at `<1024px` viewport width.

### Key Entities

- **Data Table Page**: A dashboard page that presents a domain's entities in tabular form (rows = entities, columns = attributes).
- **Sticky Header**: The row of column labels that persists at the top of the viewport during scroll.
- **Sticky Footer**: An optional summary/totals row that persists at the bottom of the viewport during scroll.
- **Sticky Scrollbar**: A horizontal scrollbar docked to the bottom of the viewport, always visible when the table is wider than the viewport.
- **Pinned Column**: A column configured to stay horizontally fixed when the user scrolls the table sideways.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every data table page, the column header row is visible at all vertical scroll positions AND stays horizontally aligned with the table body columns at all horizontal scroll positions — verified across all domain pages.
- **SC-002**: On every wide data table page, the horizontal scrollbar is reachable without scrolling to the bottom of the table content — verified across all domain pages.
- **SC-003**: All existing data table pages render without visual regression (no misaligned columns, no overlapping headers, no broken layouts) after the migration. All 41 behavioral test cases in `test-plan.md` pass.
- **SC-004**: No data table page requires a manual per-column pixel width to display header labels AND cell content legibly — no cell data is truncated by default at typical data values.
- **SC-005**: Pinned columns remain aligned with their header cells at all horizontal scroll positions.

## Assumptions

- All existing data table pages currently use ProTable (Ant Design Pro Components). The migration replaces ProTable with PageTable across ALL of them — including domain pages and system/utility pages (IO import-export preview, sync preview).
- ProTable's built-in search form (the `search` prop / in-table filter bar) is not used anywhere. All search, filter, and sort interactions are implemented as custom controls outside the table component.
- The Finance page currently has a totals/summary footer row. It is the only page confirmed to require the sticky footer in this migration cycle.
- The PageTable component exists in the codebase but Finance pages are missing the ov-fleet `dataWidths` pattern (computing max content width per column across data rows and using `Math.max(headerWidth, dataWidth)` as column width). This omission causes both confirmed bugs. This feature includes adopting the correct pattern from ov-fleet — it is NOT a pure migration task.
- Mobile-first or responsive breakpoints are out of scope; the target device is a desktop/laptop browser.
- Domain data (Finance, Language, Music, etc.) and API contracts are unchanged — only the table rendering layer is affected.
- Any page that does not use a data table (e.g., forms, dashboards with cards) is out of scope.
