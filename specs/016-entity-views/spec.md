# Feature Specification: Entity Views

**Feature Branch**: `016-entity-views`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "for github issue #19 — Entity views: once entity operations (#6) are implemented, users should be able to save pre-configured filtering + sorting + column visibility + column ordering as a view; view configs are serializable (inline in the URL or saved server-side), and a tab row of view controls sits above the entity toolbar."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save a table configuration and reopen it later (Priority: P1)

A user repeatedly performs the same task on an entity table (for example, reviewing recent acquisitions in the inventory catalog with specific filters, sort order, and a trimmed column set). Today they must rebuild that configuration by hand every time. With this feature, they configure the table once, save the setup as a named view, and from then on reopen it with a single click.

**Why this priority**: This is the core value of the feature — eliminating repeated manual reconfiguration of filters, sorting, and columns. Without it, nothing else in this feature matters.

**Independent Test**: Can be fully tested by configuring a table, saving the configuration under a name, resetting or leaving the page, then reopening the saved view and confirming the exact configuration is restored.

**Acceptance Scenarios**:

1. **Given** an entity table whose filters, sorting, column visibility, column ordering, or page size differ from the default, **When** the user saves the current configuration under a name, **Then** a saved view is created for that table and the active tab shows the given name with no unsaved-changes indicator.
2. **Given** a saved view exists for a table, **When** the user selects it from the View control, **Then** it opens as a tab and the table applies exactly the stored filters, sorting, column visibility, column ordering, and page size.
3. **Given** a saved view is open, **When** the user changes any part of its configuration, **Then** the tab shows an unsaved-changes indicator and the Save action becomes available.
4. **Given** a saved view with unsaved changes, **When** the user chooses Save, **Then** the stored configuration is updated and the unsaved-changes indicator clears.

---

### User Story 2 - Work across multiple views with tabs (Priority: P2)

A user juggles several perspectives on the same data — e.g., "everything", "this year's electronics", and "items missing prices". A tab row above the table's toolbar shows their pinned views plus any views opened this session, and a "+" button spins up a fresh scratch tab at any time. Switching tabs switches perspectives instantly, each tab keeping its own configuration.

**Why this priority**: Tabs make saved views usable in day-to-day flow — pinning keeps frequent views one click away across sessions, and scratch tabs allow experimentation without disturbing saved setups.

**Independent Test**: Can be tested by pinning views, opening additional tabs, switching between them, and reloading in a fresh session to confirm that pinned tabs reappear while unpinned session tabs do not.

**Acceptance Scenarios**:

1. **Given** a user visits an entity table with no saved views, **When** the page loads, **Then** the view row shows the standard "Tabular" view as a pinned, active tab.
2. **Given** the view row is displayed, **When** the user clicks the "+" button at the left edge, **Then** a new anonymous (unsaved) tab opens immediately with the default configuration, ready to be adjusted through the existing toolbar dropdowns.
3. **Given** multiple tabs are open, **When** the user switches between them, **Then** each tab retains and re-applies its own configuration without affecting the others.
4. **Given** a user has pinned views, **When** they return in a new session, **Then** the pinned tabs appear in their saved order, and unpinned tabs from previous sessions do not reappear.
5. **Given** more tabs than fit the available width, **When** the row overflows, **Then** the tabs area scrolls horizontally while the "+" button stays fixed at the left edge and the View control stays fixed at the right edge (layout: `[+] _Tab1_ Tab2 Tab3 [View]`).

---

### User Story 3 - Share and deep-link a view via URL (Priority: P3)

A user wants to bookmark a specific table state or reopen it from another device. Every view state is representable in the page URL — either as a fully inlined configuration or as a reference to a saved view, optionally with overriding parameters. Opening such a URL lands directly on that view.

**Why this priority**: URL addressability makes views bookmarkable and navigable (back/forward, links from elsewhere in the hub), but it builds on views already existing.

**Independent Test**: Can be tested by copying the URL of a configured view, opening it in a fresh browser session, and confirming the identical table state renders; and by editing view parameters in the URL and confirming the table follows.

**Acceptance Scenarios**:

1. **Given** a table configured on an anonymous tab, **When** the user copies the page URL and opens it in another session, **Then** the same configuration is applied on load from the inlined view state.
2. **Given** a URL that references a saved view together with override parameters, **When** it is opened by the view's owner, **Then** the saved configuration loads with the overrides applied on top, and the tab shows the unsaved-changes indicator because the effective configuration differs from the stored one.
3. **Given** the user is viewing an entity table, **When** the view-related query string changes (navigation, back/forward, an edited URL), **Then** the table navigates directly to the newly described view state.
4. **Given** a page hosting more than one entity table, **When** view parameters are present under different table namespaces, **Then** each table applies its own view state independently.

---

### User Story 4 - Organize saved views (Priority: P4)

Over time a user accumulates views and needs to manage them: rename, pin or unpin, reorder, delete, and duplicate an existing view as a starting point for a variation.

**Why this priority**: Housekeeping matters once several views exist, but the feature is valuable before management tooling is complete.

**Independent Test**: Can be tested by opening the management modal from the View control and performing rename, pin/unpin, reorder, and delete operations, plus duplicating a view from the View control, and confirming each change persists.

**Acceptance Scenarios**:

1. **Given** saved views exist for a table, **When** the user opens "Edit" from the View control, **Then** a management modal lists that table's saved views with controls for renaming, pinning/unpinning, reordering, and deleting.
2. **Given** a view named "X" is active, **When** the user chooses Duplicate, **Then** a new unsaved tab opens with an identical configuration named "X (1)"; duplicating again produces "X (2)", and so on, always taking the first unused suffix.
3. **Given** a pinned view, **When** the user unpins it, **Then** its tab no longer appears by default in future sessions while the view remains selectable from the View control.
4. **Given** a saved view is open in a tab, **When** the user deletes that view in the management modal, **Then** the tab stays open as an unsaved anonymous tab holding the same configuration, so no work in progress is lost.

---

### Edge Cases

- A URL references a saved view that no longer exists or belongs to a different account: the table falls back to the standard "Tabular" view and the user is informed with a non-blocking notice.
- A URL carries an invalid or corrupted inline view serialization: the table falls back to the standard "Tabular" view with a non-blocking notice rather than failing to render.
- A saved view references a column or attribute that no longer exists (for example, a removed dynamic parameter column): the unavailable parts are ignored, the rest of the configuration applies, and the view can be re-saved in its cleaned form.
- The user tries to save a view under a name already used on the same table: the system rejects the name and asks for a different one (automatic "(n)" suffixes apply only to duplication).
- The session ends while unsaved anonymous tabs are open: those tabs are discarded; saved and pinned views are unaffected.
- All user views are unpinned or deleted: the view row always retains at least the standard "Tabular" tab as a fallback.
- A very long view name: the tab shows a truncated name with the full name available on demand, and the row's overflow behavior is unaffected.

## Requirements *(mandatory)*

### Functional Requirements

**View capture & scope**

- **FR-001**: The system MUST let a user capture an entity table's current configuration — filter conditions, sorting, column visibility, column ordering, and page size — as a named saved view.
- **FR-002**: Saved views MUST be scoped to the entity table they were created on and to the owning user account; a table's View control lists only that table's views for the signed-in account.
- **FR-003**: A standard primary view named "Tabular", representing the table's default configuration, MUST always exist for every entity table; it cannot be renamed or deleted and is pinned by default.

**Serialization & URL navigation**

- **FR-004**: A view configuration MUST be fully serializable, so any view state can be represented either inline in the page URL or as a stored saved view referenced by identifier.
- **FR-005**: A URL MUST be able to reference a saved view together with override parameters; on load, the stored configuration applies first and the overrides apply on top of it.
- **FR-006**: Opening a URL containing serialized view state MUST navigate directly to that view, and subsequent changes to the view-related query string MUST navigate the table to the newly described state.
- **FR-007**: View parameters in the URL MUST be namespaced per table so that pages hosting multiple entity tables can address each table's view independently.
- **FR-008**: Invalid, corrupted, or unresolvable view references in a URL MUST NOT break the page; the affected table falls back to the standard "Tabular" view and the user is informed.

**View tab row**

- **FR-009**: Every entity table with the standard operations toolbar MUST display a view-control row above that toolbar, laid out left to right as: a "+" button, the open view tabs, and a "View" control.
- **FR-010**: The displayed tabs MUST be the account's pinned views for that table, in their saved order, plus any additional views opened during the current session.
- **FR-011**: The "+" button MUST immediately open a new anonymous (unsaved) tab with the default configuration, which the user then adjusts through the existing toolbar dropdowns.
- **FR-012**: The "View" control MUST provide: the list of the table's saved views to open; a Save action enabled only while at least one open view has unsaved changes; a Duplicate action for the active view; and an Edit action opening the view-management modal.
- **FR-013**: Modifying an open view's effective configuration — whether through the toolbar or through URL overrides — MUST mark that tab with an unsaved-changes indicator.
- **FR-014**: Saving a modified saved view MUST persist the current configuration to that view and clear its unsaved-changes indicator; saving an anonymous tab MUST ask for a name and create a new saved view from it.
- **FR-015**: Duplicating the active view "X" MUST open a new unsaved tab with an identical configuration named "X (1)", "X (2)", …, using the first unused suffix.
- **FR-016**: Saved view names MUST be unique per table per account; an attempt to save under an existing name is rejected with a request for a different name.
- **FR-017**: The view-management modal MUST support renaming, pinning/unpinning, reordering, and deleting saved views; pin state and ordering MUST persist per account and drive which tabs appear by default.
- **FR-018**: Unpinned tabs opened during a session MUST be closable and MUST NOT reappear in later sessions; pinned tabs MUST reappear each session until unpinned.
- **FR-019**: Deleting a saved view that is currently open MUST keep its tab open as an unsaved anonymous tab holding the same configuration.
- **FR-020**: On narrow screens, the tabs area MUST scroll horizontally while the "+" button and the "View" control remain fixed at the left and right edges respectively.
- **FR-021**: A view configuration that references columns or attributes no longer available MUST degrade gracefully: unavailable parts are ignored and the remainder of the configuration applies.

### Key Entities

- **Saved View**: A named, per-account, per-table record holding a view configuration plus presentation preferences — name, owning account, target entity table, pinned flag, and display order among the account's views for that table.
- **View Configuration**: The serializable payload describing a table state — filter conditions, sorting, column visibility, column ordering, and page size. Exists inline (in a URL or an unsaved tab) or as the content of a Saved View; a saved reference may carry overrides layered on top.
- **View Tab**: A session-level element in the view row representing either an opened Saved View (clean or with unsaved changes) or an anonymous unsaved configuration. Pinned Saved Views produce tabs in every session; other tabs live only for the session that opened them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from an unconfigured table to reopening a previously saved view in at most 2 interactions (open the View control, pick the view) — versus rebuilding filters, sorting, and columns by hand.
- **SC-002**: Reopening a saved view restores 100% of the captured configuration — every saved filter condition, sort rule, column visibility choice, column position, and the page size — with no manual correction needed.
- **SC-003**: Opening a copied URL in a different browser session reproduces the identical table state on first load, with zero additional user actions.
- **SC-004**: For a recurring task requiring 3 filter conditions, 2 sort rules, and a custom column set, total setup time drops from over a minute of manual configuration to under 5 seconds via a pinned tab.
- **SC-005**: Users can always tell at a glance which open views have unsaved changes: 100% of dirty views show an indicator on their tab, and none show it when clean.
- **SC-006**: On a narrow (mobile-width) screen with 6+ open tabs, every tab, the "+" button, and the "View" control remain reachable without any layout breakage.

## Assumptions

- The entity operations from issue #6 (multi-condition filtering, multi-column sorting, column visibility and ordering, pagination via the standard toolbar) are already implemented and are the source of the configuration a view captures.
- The view capability is generic and applies to every entity table that uses the standard operations toolbar across domains (finance, inventory catalog, etc.); rollout may start with one table, but nothing in the design is table-specific.
- Views are personal: saved views, pin state, and ordering belong to the signed-in user account. Inline-serialized URLs reproduce a configuration for any account with access to the page; URLs referencing a saved view resolve only for the view's owner.
- Page size is part of a saved view's configuration; the current page position travels only in inline URL serialization (so shared links land on the exact page) and is not persisted when saving a view.
- "Current session" means the browser session for the signed-in account: unsaved and unpinned tabs do not survive past it.
- The name "Tabular" for the standard primary view anticipates possible future non-tabular presentations; alternative view types (charts, boards, etc.) are out of scope for this feature.
- Cross-account sharing or transfer of saved views is out of scope; the only sharing mechanism is an inline-serialized URL.
