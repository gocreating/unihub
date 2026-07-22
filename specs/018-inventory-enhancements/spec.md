# Feature Specification: Inventory App Enhancements (Issue #39)

**Feature Branch**: `018-inventory-enhancements`

**Created**: 2026-07-22

**Status**: Draft

**Input**: GitHub issue #39 — "Inventory app enhancement":
- Length default to "cm" instead of "mm"
- If user clears accumulated cost to 0, then never auto calculate again, even when editing next time.
- Bug: during the creation of acquisition, even user force clear accumulated cost factor to empty or zero, the created acquisition still auto accumulated a non-zero cost.
- Bug: any editing on acquisition will force auto calculate accumulated cost factor again, that is totally an unexpected disaster.
- Pin both toggle column and acquisition column by default

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accumulated cost respects the user's manual value (Priority: P1)

Each acquisition shows an "accumulated" cost line per currency that the system pre-fills as the sum of item prices (price × quantity). Today this pre-fill fights the user: when the user clears it to zero (or empty) while creating an acquisition, the saved acquisition still ends up with the auto-calculated non-zero amount; and later edits to the acquisition can silently re-trigger the auto-calculation. The user needs the opposite: the moment they manually set the accumulated value — including clearing it to zero — that value is theirs, is exactly what gets saved, and is never overwritten automatically again. Only the explicit per-line "Reset" control returns the line to system-calculated behavior.

**Why this priority**: This is data corruption from the user's point of view — the system records costs the user explicitly zeroed out, and re-corrupts them on every edit. It breaks trust in all cost totals across the inventory.

**Independent Test**: Create an acquisition with priced items, clear the accumulated cost to zero, save; reopen it, confirm zero everywhere; edit unrelated fields and items, save again; confirm the accumulated cost is still zero.

**Acceptance Scenarios**:

1. **Given** a new acquisition being created with items priced at a non-zero total, **When** the user clears the accumulated cost line to zero (or empty) and saves, **Then** the saved acquisition's accumulated cost is zero — in the reopened edit form, in the catalog's cost columns, and in the acquisition's total.
2. **Given** a new acquisition being created, **When** the user changes the accumulated cost line to any manual amount (not just zero) and saves, **Then** exactly that amount is saved.
3. **Given** a saved acquisition whose accumulated cost the user has manually set, **When** the user later edits anything about the acquisition (source, dates, remark, manual cost factors, item details including prices and quantities, adding or removing items) and saves, **Then** the accumulated cost keeps the user's value — the system never auto-recalculates it.
4. **Given** a saved acquisition whose accumulated cost the user has manually set, **When** the user reopens the edit form, **Then** the form shows the user's stored value (no recalculated preview replaces it).
5. **Given** an accumulated cost line the user has manually set, **When** the user clicks that line's Reset control, **Then** the line returns to the system-calculated total (sum of item price × quantity for that currency) and resumes updating automatically as item prices/quantities change, until the user manually edits it again.
6. **Given** an acquisition whose accumulated cost has NOT been manually touched, **When** item prices or quantities change during editing, **Then** the accumulated line keeps updating automatically exactly as today.

---

### User Story 2 - Length values default to centimetres (Priority: P2)

When the user records a length-type parameter on an item (e.g. 長度/寬度/高度/直徑), the unit selector currently defaults to millimetres. Real-world entries are almost always centimetres, so the user has to switch the unit on nearly every entry. The unit selector for length-family parameters should default to centimetres instead.

**Why this priority**: Pure friction fix — one extra interaction on almost every length entry; no data integrity impact.

**Independent Test**: Add a length-family parameter row on an item and confirm the unit selector already reads "cm" without any interaction.

**Acceptance Scenarios**:

1. **Given** an item's parameter editor, **When** the user adds a value for a length-family parameter (length, width, height, diameter, waist, …), **Then** the unit selector defaults to "cm".
2. **Given** the "new parameter definition" flow, **When** the user creates a definition with the length unit family, **Then** the pre-filled unit for its first value row is "cm".
3. **Given** an existing parameter value stored in any unit (e.g. 74 mm), **When** the user edits that row, **Then** the stored unit is shown unchanged — the new default applies only where no unit has been chosen yet.
4. **Given** the unit selector defaulting to "cm", **When** the user picks another length unit (mm, m, in), **Then** that choice is respected as today.

---

### User Story 3 - Toggle and Acquisition columns pinned by default (Priority: P3)

On the inventory catalog table, the caret "Toggle" column is already pinned to the left edge by default. The "Acquisition" column — the table's anchor for reading merged acquisition rows — should also be pinned left by default, so both stay visible while scrolling horizontally through the many optional columns. Users can still unpin or re-pin any column through the column settings panel.

**Why this priority**: Convenience default; the per-column pinning feature already shipped, this only changes the out-of-the-box configuration.

**Independent Test**: Open the catalog with default (fresh) column settings, scroll the table horizontally, and confirm the Toggle and Acquisition columns stay fixed at the left edge.

**Acceptance Scenarios**:

1. **Given** a fresh visit to the catalog (default column settings), **When** the table is scrolled horizontally, **Then** the Toggle column and the Acquisition column stay pinned at the left edge (in that order), and the Actions column stays pinned at the right edge as today.
2. **Given** a user who previously loaded the catalog under the old defaults, **When** they next visit the catalog without having customized pins themselves, **Then** they see the new defaults (Acquisition pinned left).
3. **Given** the column settings panel, **When** the user unpins the Acquisition column, **Then** it unpins normally; **and When** the user resets columns to defaults, **Then** Toggle and Acquisition return to pinned-left and Actions to pinned-right.

---

### Edge Cases

- Clearing the accumulated amount to empty and typing an explicit 0 are the same action: both record a user-managed value of zero.
- The user-managed state is per accumulated line (per currency). If the user zeroes the TWD line and then adds an item priced in JPY, a new JPY accumulated line appears at its system-calculated value (auto-managed); the TWD line stays at the user's zero.
- If every priced item of a currency is removed while that currency's accumulated line is user-managed, the line is kept at the user's value (it is user data now); an auto-managed line in the same situation disappears as today.
- Reset on a user-managed line whose currency no longer has priced items restores the system-calculated total for that currency, which is zero, and the line returns to auto-managed behavior (so it may then be removed by the normal reconciliation).
- The importer and other system-created acquisitions are unaffected: their accumulated values remain system-derived and stay auto-managed unless a user later edits them.
- Length default applies only to length-family unit selectors; other unit families (weight, volume, temperature, time, battery) keep their current defaults.
- A user who has already manually pinned/unpinned catalog columns in their current session keeps their own configuration; the new pin defaults apply to fresh/default configurations and to explicit Reset.

## Requirements *(mandatory)*

### Functional Requirements

**Accumulated cost ownership (US1)**

- **FR-001**: Saving a newly created acquisition MUST store the accumulated cost values exactly as displayed in the form at save time, including zero — the system MUST NOT replace them with recalculated amounts.
- **FR-002**: Any manual edit by the user to an accumulated cost line's amount — including clearing it to empty (treated as zero) — MUST mark that line as user-managed.
- **FR-003**: A user-managed accumulated line MUST never be auto-recalculated: not while the form stays open, not on save, and not during any later edit of the acquisition, regardless of what else changes (items, prices, quantities, other cost factors, scalar fields).
- **FR-004**: The user-managed state of an accumulated line MUST persist with the acquisition, so it survives reopening the edit form in a later session.
- **FR-005**: Each accumulated line MUST keep an explicit Reset control that (a) restores the system-calculated total for its currency and (b) returns the line to auto-managed behavior, after which it updates automatically again until the next manual edit.
- **FR-006**: Accumulated lines that the user has never manually edited MUST keep today's automatic behavior: they appear per item currency, update live as item prices/quantities change, and are stored at their derived values.

**Length unit default (US2)**

- **FR-007**: Everywhere a unit selector offers the length unit family with no unit chosen yet (new parameter value rows, new length-family definition flows), the default selection MUST be "cm" instead of "mm".
- **FR-008**: Existing stored parameter values and their units MUST be unaffected; the default never rewrites a previously chosen or stored unit.

**Default pinned catalog columns (US3)**

- **FR-009**: The catalog's default column configuration MUST pin both the Toggle (caret) column and the Acquisition column to the left edge, with Toggle outermost, while the Actions column remains pinned right.
- **FR-010**: The new defaults MUST take effect for users on their next visit unless they have since customized pins themselves, and the column panel's Reset MUST restore these defaults.

### Key Entities

- **Acquisition**: A purchase/obtainment event holding items and cost factors; its total cost is the sum of all its cost factor amounts per currency.
- **Accumulated cost line**: The system-seeded cost factor (one per item currency) representing the summed item prices; gains a new persistent state — auto-managed (system keeps it in sync) vs user-managed (user's amount is authoritative and untouched).
- **Item parameter (length family)**: A measured attribute of an item whose value carries a length unit; only the default unit offered for new entries changes.
- **Catalog column configuration**: The per-column visibility/order/pin settings of the catalog table; only its default pin seeds change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of acquisitions created with a manually cleared (zero) accumulated cost show zero accumulated cost after save — in the reopened form, catalog cost columns, and totals.
- **SC-002**: Zero occurrences of automatic recalculation of a user-managed accumulated line across any sequence of edit-and-save operations on the acquisition.
- **SC-003**: Recording a centimetre length value requires zero unit-selector interactions (the default is already "cm").
- **SC-004**: On a fresh catalog visit with default settings, the Toggle and Acquisition columns remain fully visible at the left edge through any horizontal scroll position, with no user configuration.
- **SC-005**: All existing accumulated-cost behavior for untouched lines (live derivation, per-currency seeding, reset) continues to work — no regressions in the existing acquisition form test suites.

## Assumptions

- "Never auto calculate again" generalizes beyond zero: ANY manual edit of an accumulated amount makes it user-managed (zero/empty is the emphasized case from the issue). The explicit Reset control is the only way back to automatic behavior.
- The Reset control both restores the derived value AND re-enables automatic recalculation; the issue's "never … again" applies until the user deliberately resets.
- The user-managed state is tracked per accumulated line (per currency), not per acquisition, so mixed-currency acquisitions behave independently per currency.
- The Acquisition column pins to the LEFT edge (it is the leading data column and the toggle caret is already left-pinned); pinning order is Toggle, then Acquisition.
- The "cm" default applies wherever a length-family unit has not yet been chosen, and does not alter parsing/import behavior (imported text keeps its explicitly stated units) nor internal canonical storage.
- Column settings remain per-visit (no server persistence today); "users see the new defaults on next visit" therefore means the default seed changes, with the existing mechanism ensuring stale prior defaults do not shadow the new ones.
