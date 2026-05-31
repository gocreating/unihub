# Feature Specification: Entity Operations

**Feature Branch**: `008-entity-operations`

**Created**: 2026-05-31

**Status**: Draft

**Input**: GitHub Issue #6 — Entity operations (filter, sort, attribute visibility & ordering, pagination)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter Entity List (Priority: P1)

A user browsing an entity list wants to narrow down the results to only the records that match specific criteria. They open the filter panel from the toolbar, define one or more conditions (e.g., "status equals active"), then click the Apply button inside the panel to update the list. The user can combine conditions using "and" / "or" logic and group them into condition groups for more complex queries before confirming.

**Why this priority**: Filtering is the most fundamental data exploration operation and delivers the most immediate value — without it, users must scroll through all records to find relevant ones.

**Independent Test**: Can be fully tested by opening a populated entity list, applying a filter condition, and verifying only matching records appear. Delivers standalone value even without sorting or column customization.

**Acceptance Scenarios**:

1. **Given** an entity list with multiple records, **When** the user opens the filter dropdown, adds a condition (attribute + operator + value), and clicks Apply, **Then** the list updates to show only records matching that condition.
2. **Given** an active filter with one condition, **When** the user adds a second condition to the same group with "and" logic and clicks Apply, **Then** the list shows only records matching both conditions simultaneously.
3. **Given** an active filter with one condition group, **When** the user adds a new condition group with "or" logic and clicks Apply, **Then** the list shows records matching either condition group.
4. **Given** no filters applied, **When** the user opens the filter dropdown, **Then** one empty condition row is shown by default and no Apply has yet occurred.
5. **Given** an active filter, **When** the user removes all conditions and clicks Apply, **Then** the unfiltered full list is restored.
6. **Given** the filter panel is open with unsaved changes, **When** the user closes the panel without clicking Apply, **Then** the changes are discarded and the previously applied filter remains active.

---

### User Story 2 - Sort Entity List (Priority: P2)

A user wants to order an entity list by one or more attributes — for example, first by date (newest first) and then by name (A–Z) for ties. They can sort quickly by clicking a column header directly (immediate effect, no panel needed) or configure multi-column sort rules with full priority control via the sort panel and Apply. Both entry points stay in sync: the sort panel always reflects the current sort state regardless of how it was set.

**Why this priority**: Sorting enables users to quickly identify the most relevant records (e.g., most recent, highest value) without scanning the entire list. It complements filtering and is the second most-used data navigation operation.

**Independent Test**: Can be fully tested by applying a two-column sort on a dataset with duplicate values in the primary column, verifying the secondary column correctly orders the ties.

**Acceptance Scenarios**:

1. **Given** an entity list, **When** the user opens the sort dropdown, adds a sort rule (column + direction), and clicks Apply, **Then** the list reorders according to that rule.
2. **Given** one active sort rule, **When** the user adds a second sort rule for a different column and clicks Apply, **Then** the list applies the first rule as primary sort and the second as a tiebreaker.
3. **Given** multiple sort rules, **When** the user changes the priority order of rules and clicks Apply, **Then** the list re-sorts respecting the new rule order.
4. **Given** an active sort rule, **When** the user toggles the direction from ascending to descending and clicks Apply, **Then** the list reverses its order.
5. **Given** active sort rules, **When** the user removes all sort rules and clicks Apply, **Then** the list returns to its default order.
6. **Given** the sort panel is open with unsaved changes, **When** the user closes the panel without clicking Apply, **Then** the changes are discarded and the previously applied sort remains active.
7. **Given** a column with no active sort, **When** the user clicks its table header, **Then** the list immediately sorts by that column ascending and the column header shows an ascending indicator.
8. **Given** a column currently sorted ascending, **When** the user clicks its table header, **Then** the sort direction immediately changes to descending and the column header indicator updates; the rule's priority among other rules is unchanged.
9. **Given** a column currently sorted descending, **When** the user clicks its table header, **Then** the sort rule for that column is immediately removed and the header shows no sort indicator.
10. **Given** columns A and B both have active sort rules (A higher priority), **When** the user clicks column C's header (unsorted), **Then** a sort rule for C is appended at the lowest priority and the list re-sorts immediately.
11. **Given** the sort panel is open showing pending unapplied changes, **When** the user clicks a column header, **Then** the header-click sort takes effect immediately and the sort panel refreshes to show the resulting active state (pending panel changes are replaced).

---

### User Story 3 - Customize Column Visibility, Order, and Sticky Pinning (Priority: P3)

A user wants to focus on the attributes most relevant to their current task. They open the column panel, hide attributes they don't need, drag to reorder the remaining visible columns, and optionally toggle sticky-left or sticky-right pinning. They then click Apply to commit all column changes to the table.

**Why this priority**: Column customization reduces cognitive load and helps users focus on relevant data. It is lower priority than filter and sort because users can still accomplish their primary goals with all columns visible.

**Independent Test**: Can be fully tested by hiding two columns, reordering the remaining visible columns, enabling sticky-left, clicking Apply, then horizontally scrolling to verify the pinned column stays visible.

**Acceptance Scenarios**:

1. **Given** an entity list showing all columns, **When** the user opens the column dropdown, unchecks an attribute, and clicks Apply, **Then** that column is hidden from the table.
2. **Given** hidden columns, **When** the user re-checks a hidden attribute and clicks Apply, **Then** the column reappears in the table.
3. **Given** visible columns, **When** the user drags a column to a new position in the column panel and clicks Apply, **Then** the table columns reorder to match.
4. **Given** one column visible, **When** the user attempts to hide it, **Then** the system prevents this action regardless of Apply (at least one column must remain visible).
5. **Given** the column panel is open, **When** the user enables the sticky-left toggle and clicks Apply, **Then** the first visible column becomes pinned to the left edge and remains visible while horizontally scrolling.
6. **Given** sticky-left is active, **When** the user disables the sticky-left toggle and clicks Apply, **Then** the first visible column scrolls normally with the rest of the table.
7. **Given** the column panel is open, **When** the user enables the sticky-right toggle and clicks Apply, **Then** the last visible column becomes pinned to the right edge and remains visible while horizontally scrolling.
8. **Given** sticky-left is active and the user reorders columns and clicks Apply, **Then** the new first visible column inherits the sticky-left pinning.
9. **Given** the column panel is open with unsaved changes, **When** the user closes the panel without clicking Apply, **Then** the changes are discarded and the previously applied column configuration remains.

---

### User Story 4 - Navigate Paginated Results (Priority: P2)

A user viewing a large entity list wants to browse through pages of results. Pagination controls at the bottom of the table allow them to move between pages. When filters or sorting are active, pagination applies only to the filtered/sorted result set.

**Why this priority**: Pagination is required for any dataset beyond a trivial size and directly impacts system performance and usability at scale.

**Independent Test**: Can be fully tested independently of filter/sort by navigating a multi-page dataset and verifying page transitions work correctly.

**Acceptance Scenarios**:

1. **Given** more records than the page size, **When** the user views the entity list, **Then** pagination controls are visible in the sticky table footer.
2. **Given** a multi-page list, **When** the user clicks to the next page, **Then** the next set of records loads and pagination controls reflect the current position.
3. **Given** active filters and a multi-page result, **When** the user navigates to page 2, **Then** only records matching the active filters appear on page 2.
4. **Given** page 3 is active, **When** the user changes or clears a filter, **Then** the view resets to the first page of the new result set.
5. **Given** a cursor-based paginated view, **When** the user navigates forward, **Then** only "previous" and "next" navigation is available (no jump-to-page or total count display).

---

### Edge Cases

- What happens when a filter condition is partially filled (attribute selected but no value entered)? — The condition is treated as incomplete and not applied; the user is shown a visual indicator that the condition is invalid.
- What happens when filtering or sorting returns zero results? — The table shows an empty state message indicating no records match the current criteria, with a clear option to reset filters.
- What happens when the user hides all columns? — The system prevents hiding the last visible column and shows an informational message.
- How does cursor-based pagination behave when records are added or deleted between page navigations? — The cursor continues from where it left off; new or deleted records may cause slight result inconsistencies, which is an accepted trade-off for cursor-based approaches.
- What happens when a sort column is also hidden? — The sort remains active even if the column is hidden; the data is still sorted by that attribute's values. The hidden column does not display a header sort indicator.
- What happens when the sort panel is open with pending changes and the user clicks a column header? — The header click takes immediate effect; the sort panel discards its pending changes and refreshes to reflect the new active sort state.
- What happens when a filtered attribute is not available for the current entity type? — [Handled at the domain level; each domain exposes only its own filterable attributes.]

## Requirements *(mandatory)*

### Functional Requirements

**Filtering**

- **FR-001**: System MUST display one empty filter condition row by default when the user opens the filter panel for the first time.
- **FR-002**: Users MUST be able to add, edit, and remove individual filter conditions; each condition consists of an attribute, an operator, and a value.
- **FR-003**: System MUST support grouping multiple filter conditions into a condition group, where conditions within a group are joined by "and" or "or".
- **FR-004**: Users MUST be able to add multiple condition groups; groups are combined with an "or" operator between them.
- **FR-005**: Filter operators available MUST be appropriate to the attribute's data type (e.g., text attributes support contains/equals/starts with; numeric attributes support equals/greater than/less than; date attributes support date range comparisons).
- **FR-006**: System MUST apply filters server-side so that only matching records are returned to the client.
- **FR-006a**: Filter conditions take effect only when the user explicitly clicks the Apply button inside the filter panel; changes made inside the panel before clicking Apply do not affect the displayed list.
- **FR-006b**: Closing the filter panel without clicking Apply MUST discard all pending changes and restore the last applied filter state.
- **FR-007**: Clicking Apply in the filter panel MUST reset pagination to the first page.

**Sorting**

- **FR-008**: Users MUST be able to add sort rules, each specifying a column and a direction (ascending or descending).
- **FR-009**: Users MUST be able to add multiple sort rules that are applied in priority order (first rule is primary, second is tiebreaker, etc.).
- **FR-010**: Users MUST be able to change the priority order of sort rules.
- **FR-011**: System MUST apply sorting server-side so results are ordered before delivery to the client.
- **FR-011a**: Sort rules take effect only when the user explicitly clicks the Apply button inside the sort panel; changes made inside the panel before clicking Apply do not affect the displayed list. Exception: table header clicks (FR-028–FR-031) are immediate and bypass the panel Apply step.
- **FR-011b**: Closing the sort panel without clicking Apply MUST discard all pending changes and restore the last applied sort state.
- **FR-012**: Clicking Apply in the sort panel MUST reset pagination to the first page.
- **FR-028**: Each sortable column header MUST display a sort state indicator showing the current sort direction (ascending, descending, or none).
- **FR-029**: Clicking an unsorted column header MUST immediately add a new sort rule for that column in ascending order, appended at the lowest priority among any existing sort rules, re-sort the list, and reset pagination to the first page.
- **FR-030**: Clicking an ascending-sorted column header MUST immediately change that rule's direction to descending (in-place, priority unchanged) and reset pagination to the first page; clicking a descending-sorted header MUST immediately remove that column's sort rule and reset pagination to the first page. No Apply button is required for either transition.
- **FR-031**: The sort panel MUST always reflect the current active sort rules, including rules added or modified via column header clicks. When the sort panel is open and a header click occurs, the panel MUST update to show the resulting state, discarding any pending unapplied panel edits.

**Column Visibility & Ordering**

- **FR-013**: Users MUST be able to show or hide individual entity attributes from the table view.
- **FR-014**: Users MUST be able to reorder visible columns by dragging them to a new position in the column panel.
- **FR-015**: System MUST prevent the user from hiding all columns; at least one column must remain visible at all times.
- **FR-016**: Column visibility, order, and sticky-pinning changes take effect when the user clicks the Apply button inside the column panel; no page reload or data re-fetch is required.
- **FR-016a**: Closing the column panel without clicking Apply MUST discard all pending changes and restore the last applied column configuration.
- **FR-025**: The column panel MUST include a sticky-left toggle that, when enabled, pins the first visible column to the left edge of the table so it remains visible during horizontal scrolling.
- **FR-026**: The column panel MUST include a sticky-right toggle that, when enabled, pins the last visible column to the right edge of the table so it remains visible during horizontal scrolling.
- **FR-027**: Sticky pinning is positional — if columns are reordered, whichever column occupies the first (or last) visible position inherits the active sticky-left (or sticky-right) state.

**Pagination**

- **FR-017**: System MUST support offset-based pagination as the default mode, showing total record count and allowing jump-to-page navigation.
- **FR-018**: System MUST support cursor-based pagination as an alternative mode, providing only previous/next navigation without displaying total count.
- **FR-019**: The pagination mode (offset vs. cursor) MUST be configurable per domain or per view.
- **FR-020**: Paginated results MUST always respect any active filter conditions and sort rules.

**User Interface**

- **FR-021**: The entity table MUST include a sticky toolbar above the table body containing a filter dropdown, a sort dropdown, and a column dropdown.
- **FR-022**: Each toolbar dropdown (filter, sort, column) MUST open an inline panel for configuring that operation independently without navigating away from the entity view.
- **FR-023**: Pagination controls MUST be placed in a sticky footer below the entity table, always visible regardless of scroll position.
- **FR-024**: The toolbar MUST display a visible indicator when any filter or sort rule is active (e.g., a badge or highlighted state on the relevant button).

### Key Entities

- **Filter Condition**: A single rule consisting of an attribute identifier, an operator, and a comparison value. Belongs to a condition group.
- **Condition Group**: A collection of one or more filter conditions joined by a logical operator ("and" / "or"). Multiple groups are combined with "or" between them.
- **Sort Rule**: A directive specifying a column and sort direction (ascending/descending). Multiple rules form an ordered priority list.
- **Column Configuration**: Per-view settings controlling the visibility, display order, and sticky-pinning state of entity attributes. Sticky pinning is positional (first column = sticky-left, last column = sticky-right). Scoped to the current session.
- **Pagination Cursor**: An opaque pointer used in cursor-based pagination to fetch the next or previous page relative to a known position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can apply a multi-condition filter in under 30 seconds from opening the filter panel.
- **SC-002**: Filtered and sorted entity lists display updated results within 2 seconds of the user confirming a filter or sort change, for datasets up to 100,000 records.
- **SC-003**: Users can customize column visibility and reorder columns without leaving the entity view, completing the task in under 20 seconds.
- **SC-004**: Pagination controls remain visible and accessible at all scroll positions on the entity table page.
- **SC-005**: At least 90% of users can independently locate and use the filter, sort, and column controls without assistance on their first interaction.
- **SC-006**: Applying a new filter on a paginated list always returns the user to the first page of results, with zero cases of displaying stale page-offset data.

## Assumptions

- Filter, sort, and column preferences are session-scoped and not persisted across page reloads or browser sessions in this version. Persistence can be added in a future iteration.
- Each entity domain exposes its own set of filterable and sortable attributes; the operations framework is domain-agnostic but attributes are domain-specific.
- The default pagination mode (offset vs. cursor) is determined per domain at the view level; individual users cannot switch pagination modes.
- Filter operators are determined by attribute data type; the set of supported types and their operators are defined at the domain level.
- Mobile / small-screen support is out of scope for this feature; the entity table with its toolbar and sticky controls targets desktop-width viewports.
- Users are authenticated; there are no guest or public-facing entity views in scope.
- Active filters and sort rules are reflected in the URL query string so that the current view state is shareable via link.

## Clarifications

### Session 2026-05-31

- Q: Should the column panel include sticky-pinning controls? → A: Yes — add a sticky-left toggle (pins the first visible column) and a sticky-right toggle (pins the last visible column). Sticky state is positional: it transfers to whichever column occupies the first or last position after a reorder.
- Q: Do filter, sort, and column panels auto-apply changes or require an explicit confirm action? → A: All three panels require an explicit Apply button click before any changes take effect. Closing a panel without clicking Apply discards pending changes and restores the last applied state.
- Q: Should the toolbar button show a distinct "pending changes" indicator when the panel has unapplied edits? → A: No — the Apply button inside the panel is sufficient. No additional toolbar-level dirty-state indicator needed (keep scope small).
- Q: Should sort support a direct table-header shortcut that bypasses the sort panel's Apply step? → A: Yes — clicking a column header cycles through three states immediately (no-sort → ascending → descending → no-sort). Non-sorted to sorted appends a new rule at lowest priority; direction toggle updates the rule in-place; sorted to no-sort removes the rule. The sort panel always reflects the live sort state and discards pending panel edits if a header click occurs while it is open.
