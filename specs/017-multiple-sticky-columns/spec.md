# Feature Specification: Multiple Sticky Columns

**Feature Branch**: `017-multiple-sticky-columns`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "for github issue #37" — *Multiple sticky columns*: "Currently Unihub system only supports single sticky column for both left most and right most side. In this feature, I'd like the system support multiple sticky columns for both sides. I haven't come up with how the UI/UX would be."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep several leading columns visible while scrolling (Priority: P1)

Unihub's tabular views can grow very wide (the inventory catalog alone shows expand controls, item identity, parameters, acquisition details, prices, and more). Today only the single first visible column can be kept in place while scrolling horizontally. A user working through a wide table wants to pin **several** leading columns — for example both the expand-control column *and* the item name column — so they never lose track of which row they are looking at while scrolling to far-right columns.

**Why this priority**: This is the core capability the feature request names. Losing row identity while scrolling is the main usability pain in wide tables, and one pinned column is often not enough to carry that identity (e.g. the current catalog default pins only the narrow expand-control column, so the item name scrolls away).

**Independent Test**: On any wide tabular view, pin two or more columns on the left, scroll horizontally to the far right, and confirm all pinned columns remain fully visible, in order, with their headers and cells aligned.

**Acceptance Scenarios**:

1. **Given** a table wider than the viewport with two columns pinned to the left, **When** the user scrolls horizontally to the rightmost column, **Then** both pinned columns remain fixed at the left edge with their header, body, and footer cells aligned, and the remaining columns scroll beneath them.
2. **Given** a table with three columns pinned to the left, **When** the user scrolls horizontally, **Then** the pinned columns keep their relative order and a single visual boundary (edge shadow/divider) appears after the last pinned column, not between pinned columns.
3. **Given** a table with no columns pinned, **When** the user scrolls horizontally, **Then** all columns scroll freely (pinning remains fully optional).

---

### User Story 2 - Keep several trailing columns visible while scrolling (Priority: P2)

A user also wants multiple columns pinned to the **right** edge — for example a per-row Actions column *and* a total/price column — so key values and row operations stay reachable without scrolling back.

**Why this priority**: Same capability mirrored to the right side; slightly lower priority only because today's most painful gap (per the catalog default) is on the left. The feature request explicitly asks for both sides.

**Independent Test**: Pin two columns on the right of a wide table, scroll horizontally to the far left, and confirm both stay fixed at the right edge, aligned and in order.

**Acceptance Scenarios**:

1. **Given** a table wider than the viewport with two columns pinned to the right, **When** the user scrolls horizontally to the leftmost column, **Then** both right-pinned columns remain fixed at the right edge, aligned across header, body, and footer.
2. **Given** columns pinned on both sides at once, **When** the user scrolls horizontally, **Then** the left-pinned group stays at the left edge, the right-pinned group stays at the right edge, and only the middle columns scroll between them.

---

### User Story 3 - Choose, keep, and reset pinned columns (Priority: P3)

A user wants to decide *which* columns are pinned per table view, have that choice hold throughout their work with the view exactly like the other column settings (visibility, order), and be able to return to the view's default pin setup at any time. Views that ship with sensible default pins today (e.g. the catalog's expand-control column on the left and Actions column on the right) must keep working without the user doing anything.

**Why this priority**: Configuration controls make the capability practical day-to-day, but they build on the pinning mechanics of Stories 1–2.

**Independent Test**: Change the pinned columns on a view, keep working with it (filter, sort, page through data), and confirm the pins hold; then reset the view's column settings and confirm the default pins return.

**Acceptance Scenarios**:

1. **Given** the column settings of a table view, **When** the user marks any visible column as pinned-left or pinned-right (any number of columns per side), **Then** the table immediately reflects the new pin layout without a page reload.
2. **Given** a customized pin setup, **When** the user continues working with the view (paging, filtering, sorting, opening and cancelling other panels), **Then** the pin setup remains in effect until the user changes or resets it.
3. **Given** a customized pin setup, **When** the user resets the view's column settings to default, **Then** the view's default pinned columns (and only those) are pinned again.
4. **Given** a user who relied on the previous view-wide "pin first column / pin last column" toggles, **When** they open the column settings after the upgrade, **Then** they can achieve the same layouts by pinning the first or last column directly, and the old global toggles are gone (no duplicate or conflicting pin controls).
5. **Given** a pinned column that the user then hides, **When** the user re-shows that column later, **Then** it returns with its pin state intact.

---

### Edge Cases

- **Pinned columns wider than the viewport**: if the combined width of pinned columns approaches or exceeds the visible table width, the table must remain usable — horizontal scrolling of the middle region stays available, layout must not break, and the user can always unpin columns from the column settings (which remain reachable regardless of pin state).
- **Pinning a middle column**: pinning is not limited to the current first/last columns. A column pinned from the middle of the table joins the pinned group at its side; the displayed order becomes left-pinned group → scrollable middle → right-pinned group, with each group preserving the columns' relative order.
- **All visible columns pinned**: the table degrades gracefully (nothing left to scroll; no errors, no overlapping groups).
- **The same column on both sides**: a column can be pinned to at most one side at a time; choosing one side clears the other.
- **Narrow tables**: when the table fits the viewport without horizontal scrolling, pinned columns look and behave like ordinary columns (no stray shadows/dividers).
- **Interplay with existing sticky behaviors**: pinned columns must stay correctly aligned with the sticky header, sticky footer/summary row, and sticky horizontal scrollbar at every scroll position, including with expanded tree rows in views that have them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to designate any number of visible columns as pinned to the left side and any number as pinned to the right side of a tabular view (including zero on either side).
- **FR-002**: While the user scrolls horizontally, left-pinned columns MUST remain fixed at the left edge and right-pinned columns at the right edge, with all remaining columns scrolling between the two groups; header, body, and footer/summary cells of pinned columns MUST stay aligned at every scroll position.
- **FR-003**: Pinned columns MUST display as contiguous groups at their respective edges: the displayed column order is the left-pinned group, then the scrollable columns, then the right-pinned group, each group preserving the columns' relative display order.
- **FR-004**: Each column entry in a view's column settings MUST offer per-column pin controls (pin left / pin right / unpinned, one state at a time), replacing the current global "pin first column" / "pin last column" toggles; pin changes MUST apply together with the user's other pending column changes and take effect without a page reload.
- **FR-005**: A view's pin setup MUST behave as part of that view's column configuration: pin changes MUST follow the same pending → Apply/Cancel flow as visibility and order changes, remain in effect throughout the user's work with the view exactly as those settings do, and resetting the view's column settings MUST restore that view's default pins.
- **FR-006**: Views MUST be able to declare default pinned columns — multiple per side — and views that today default to a pinned first and/or last column (e.g. the inventory catalog's expand-control column left and Actions column right) MUST keep an equivalent default without user action.
- **FR-007**: The previous view-wide "pin first column" / "pin last column" controls MUST be removed and fully superseded: every layout achievable with them MUST remain achievable by pinning the corresponding column directly, and no duplicate or conflicting pin controls may remain.
- **FR-008**: The visual pinned-edge affordance (shadow/divider that appears only when there is hidden scrollable content on that side) MUST appear once per side — after the last left-pinned column and before the first right-pinned column — never between pinned columns.
- **FR-009**: The capability MUST be available uniformly on every tabular view that offers column settings today, without per-view rework beyond declaring defaults.
- **FR-010**: Hiding a pinned column MUST remove it from display while retaining its pin state, so re-showing the column restores it to its pinned group.

### Key Entities

- **Column configuration (per view)**: the user's working arrangement for one tabular view — for each column: visibility, display order, and pin state (left / right / none). Replaces the two view-wide "pin first/last" flags with per-column pin states; views' declared defaults seed it and Reset restores it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On any wide tabular view, a user can pin at least two columns on the left and two on the right simultaneously, and 100% of pinned columns remain fully visible and correctly aligned at every horizontal scroll position.
- **SC-002**: A user can change which columns are pinned in under 15 seconds from opening the view's column settings, and the change is visible immediately (no page reload).
- **SC-003**: Applying or resetting pins updates the table immediately (within 1 second), and a single Reset action restores the view's default pin setup 100% of the time.
- **SC-004**: After the upgrade, every existing view behaves identically for users who take no action: the same columns are pinned by default as before, with zero configuration required.
- **SC-005**: At every horizontal scroll offset, pinned column headers, body cells, and footer cells show no visible misalignment (verified against real rendered geometry, per the project's visual-verification practice).

## Assumptions

- **Interaction model (the issue leaves UI/UX open)**: pinning is controlled from the existing per-view column-settings panel via per-column pin controls — the natural generalization of the panel's current two pushpin toggles, and the prevailing pattern in comparable data-grid tools. Alternative models (e.g. drag-into-pin-zones, "freeze first N columns" counters) are out of scope for this iteration; the interaction model can be revisited during clarification if the author prefers a different one.
- **Grouping over in-place stickiness**: pinned columns are grouped at their table edge (industry-standard behavior) rather than remaining sticky at arbitrary middle positions.
- **No hard cap** on the number of pinned columns per side; the system degrades gracefully rather than enforcing a limit (see Edge Cases).
- **Scope**: applies to all tabular views that use the hub's shared table + column-settings experience; views without column settings are unaffected.
- **Session-scoped settings (no new persistence)**: today a view's column settings (visibility, order, pins) are working state for the visit — they do not survive a page reload — and this feature intentionally keeps that behavior for pin state. Introducing cross-session persistence of column settings is a separate concern and out of scope here.
- **Row-spanning / merged cells**: views that merge cells across rows (e.g. catalog acquisition groups) keep their current merge behavior; pinning only affects horizontal placement.
