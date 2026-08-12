# Feature Specification: Entity Views

**Feature Branch**: `016-entity-views`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "for github issue #19 — Entity views: once entity operations (#6) are implemented, users should be able to save pre-configured filtering + sorting + column visibility + column ordering as a view; view configs are serializable (inline in the URL or saved server-side), and a tab row of view controls sits above the entity toolbar."

## Clarifications

### Session 2026-07-23

- Q: Should the standard primary view keep the name "Tabular"? → A: No — the generic name is "Table" (formerly "Tabular"), used everywhere the standard view is named.
- Q: Where does the "+" (new tab) button sit? → A: Immediately to the right of the rightmost tab, and it must stay visible even when the tab strip overflows (it docks at the visible right edge of the strip, before the View control). *(Superseded 2026-08-03: the "+" button and the View control are both replaced by a single kebab menu fixed at the row's right edge.)*
- Q: Is the default view special or a plain view? → A: A plain view — modifiable, renamable, and savable like any saved view; only deletion is excluded (it is the guaranteed fallback). Each page provides its initial name: "Table" generically, "YTD" for the inventory catalog.
- Q: How does a user rename a view directly from the tab row? → A: Double-clicking a tab triggers the edit-name flow (rename in place for saved/default views; name-and-save for anonymous tabs). *(Superseded 2026-08-03: the gesture is gone — Rename is an action in the tab's own menu, running the same edit-name flow.)*
- Q: Do saved views participate in git-remote data sync? → A: Yes — views join data export/import and sync publish/checkout like domain data; a round trip preserves name, target table, configuration, pin state, and order, and imported views attach to the importing account.
- Q: Is the round-1 packed `view[<tableKey>]` URL mini-format acceptable? → A: No — replace it with a human-readable, hand-editable query format: discrete named parameters per configuration facet, no opaque encoded blob.
- Q: Must the view tab row always render? → A: No — when a table has only its default view and no other tabs or URL view state, the row hides by default; a compact toolbar affordance (which also carries the unsaved-changes indicator) reveals it on demand, and the row auto-shows whenever a second view/tab exists.
- Q: (carried open decision from round 1) How is column pinning captured in a view? → A: Per column, left/right, any number per side — matching the per-column pin model from feature 017 — in both saved views and the URL format, so multi-pin layouts round-trip exactly (replaces the round-1 boolean-pair projection).

### Session 2026-08-03

- Q: How does a user activate a tab now that clicking the active tab opens its menu, and does double-click-to-rename survive? → A: Left-click an inactive tab switches to it; left-click the active tab opens its menu; right-click opens the menu on any tab. Double-click-to-rename is removed — rename is a menu action (replaces FR-023).
- Q: What does the tab menu's "Set as default" do, given the default flag is unique per table? → A: It transfers the default role to that view atomically; the previous default demotes to an ordinary saved view (unpinnable, closable, deletable) while the new default becomes pinned and undeletable.
- Q: What happens to the right-edge "View" control now that per-tab actions moved into the tab menu? → A: The kebab replaces it at the row's right edge, carrying "Add empty view", an "Open" submenu of not-currently-open views, and "Manage views…"; Save moves into each tab's own menu. *(Amended 2026-08-04: "Manage views…" is removed — the kebab carries only "Add empty view" and the "Open" submenu.)*
- Q: Does tab drag-reordering persist, and can the default view be dragged? → A: Yes — the new order persists for saved/pinned views; the default view is draggable like any other, so it is no longer locked to the first position.
- Q: Does setting a view as default change its position in the tab row? → A: No — the view stays where it is; the default role and tab ordering are independent.

### Session 2026-08-04

- Q: With Save no longer opening a modal, how does a brand-new unsaved tab get its name and become a stored view? → A: It is auto-labelled "New view"; Save stores it immediately under whatever the tab is currently called, and the Rename modal edits that label (relabelling only, until Save) — no naming prompt exists anywhere.
- Q: Duplicate view names are now allowed, but shareable URLs reference saved views by name — how should an ambiguous name resolve? → A: Stop referencing by name; the URL carries the saved view's identifier instead, so a reference is always exact.
- Q: Removing "Manage views" takes away the only bulk management surface — how are views that are not open as tabs managed? → A: Open the view first (kebab → "Open"), then use its own tab menu; the management modal is removed entirely.
- Q: Now that names may repeat, should Duplicate still append a "(n)" suffix? → A: No — the copy carries exactly the same name as its source.

### Session 2026-08-04b

- Q: The Cancel-on-the-left violation is not unique to the delete-view dialog — how far should the fix reach? → A: Everywhere: one shared confirmation helper with a constitution-compliant footer, adopted at every confirmation call site in the app.

### Session 2026-08-04c

- Q: What should the unsaved-changes indicator mean, given it appears on a freshly loaded default view that the user never touched? → A: Keep the meaning "the effective configuration differs from the stored one" and fix the defect that manufactures a false difference: the URL must never carry override parameters that merely restate a view's stored configuration, so a load with no user change is always clean.

### Session 2026-08-04d

- Q: On reload the URL describes an unsaved scratch view — should it return as its own tab, or be discarded? → A: It returns as its own unsaved tab (labelled "New view") and becomes the active one; the default tab is left untouched and clean. Inline URL state MUST NEVER be applied to the default tab.

### Session 2026-08-04e

- Q: The indicator rule is tied to the URL, but the URL only describes the ACTIVE tab — should an inactive tab holding unsaved work keep its indicator? → A: Yes. The URL rule governs what the active tab publishes; the indicator still reflects each tab's own state, so unsaved work on another tab stays visible.

### Session 2026-08-04f

- Q: Where should "Reset changes" live, and what does it do on a tab with no stored view? → A: An item in each tab's own menu, enabled only while that tab is dirty; it reloads a stored view's saved configuration, and restores a scratch tab's original blank configuration.
- Q: Should discarding those edits ask for confirmation? → A: No — reset applies immediately; the discarded edits are cheap to redo and the action is only offered when there is something to discard.

### Session 2026-08-12

- Q: FR-036 was declared satisfied in the previous round, but navigating to the catalog and reloading still produced override parameters and the unsaved indicator. Is the requirement wrong, or the implementation? → A: The implementation. Reproduced against the running application with the user's own data: the stored default view was never applied, so the page defaults were published as its "overrides". FR-036 and SC-017 stand unchanged; the previous round's "not reproducible here" conclusion was wrong.
- Q: What must hold for the URL writer, given that adoption lands asynchronously? → A: Its decision must be made against the URL as it actually is, not a remembered value — see FR-037. A writer that believes the URL is already correct silently abandons the correction that adoption requires.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save a table configuration and reopen it later (Priority: P1)

A user repeatedly performs the same task on an entity table (for example, reviewing recent acquisitions in the inventory catalog with specific filters, sort order, and a trimmed column set). Today they must rebuild that configuration by hand every time. With this feature, they configure the table once, save the setup as a named view, and from then on reopen it with a single click.

**Why this priority**: This is the core value of the feature — eliminating repeated manual reconfiguration of filters, sorting, and columns. Without it, nothing else in this feature matters.

**Independent Test**: Can be fully tested by configuring a table, saving the configuration under a name, resetting or leaving the page, then reopening the saved view and confirming the exact configuration is restored.

**Acceptance Scenarios**:

1. **Given** an entity table whose filters, sorting, column visibility, column ordering, or page size differ from the default, **When** the user chooses Save on the tab, **Then** a saved view is created for that table under the tab's current label — with no naming prompt — and the tab shows that name with no unsaved-changes indicator.
2. **Given** a saved view exists for a table, **When** the user selects it from the kebab menu's "Open" submenu, **Then** it opens as a tab and the table applies exactly the stored filters, sorting, column visibility, column ordering, and page size.
3. **Given** a saved view is open, **When** the user changes any part of its configuration, **Then** the tab shows an unsaved-changes indicator and the Save action becomes available.
4. **Given** a saved view with unsaved changes, **When** the user chooses Save, **Then** the stored configuration is updated and the unsaved-changes indicator clears.

---

### User Story 2 - Work across multiple views with tabs (Priority: P2)

A user juggles several perspectives on the same data — e.g., "everything", "this year's electronics", and "items missing prices". A tab row above the table's toolbar shows their pinned views plus any views opened during this visit, and a kebab menu at the row's right edge spins up a fresh scratch tab or opens a saved view at any time. Switching tabs switches perspectives instantly, each tab keeping its own configuration, and tabs can be dragged into whatever order suits the user.

**Why this priority**: Tabs make saved views usable in day-to-day flow — pinning keeps frequent views one click away across sessions, and scratch tabs allow experimentation without disturbing saved setups.

**Independent Test**: Can be tested by pinning views, opening additional tabs, switching between them, dragging them into a new order, and reloading to confirm that pinned tabs reappear in the dragged order while every other tab except the URL's is gone.

**Acceptance Scenarios**:

1. **Given** a user visits an entity table with no saved views and no view state in the URL, **When** the page loads, **Then** the view row is hidden and a compact affordance near the table toolbar reveals it on demand; the revealed row shows the table's default view — named per the page ("YTD" for the inventory catalog, "Table" otherwise) — as a pinned, active tab.
2. **Given** the view row is displayed, **When** the user opens the kebab menu at the row's right edge and chooses "Add empty view", **Then** a new unsaved tab named "New view" opens immediately with a blank configuration — no filters, no sorting, all columns visible in natural order, nothing pinned — ready to be adjusted through the existing toolbar dropdowns.
3. **Given** saved views exist that are not currently open as tabs, **When** the user opens the kebab menu's "Open" submenu, **Then** exactly those not-open views are listed, and choosing one opens it as a tab and activates it.
4. **Given** multiple tabs are open, **When** the user switches between them, **Then** each tab retains and re-applies its own configuration without affecting the others.
5. **Given** multiple tabs are open, **When** the user drags a tab to a new position in the row, **Then** the tabs reorder to match, and for saved views the new order persists so a later visit shows the same order.
6. **Given** a user has pinned views plus some scratch and opened-but-unpinned tabs, **When** they refresh the page or navigate away and back, **Then** the row shows exactly the pinned views in their persisted order plus the view the URL addresses; every other tab is gone.
7. **Given** more tabs than fit the available width, **When** the row overflows, **Then** the tabs area scrolls horizontally with no visible scrollbar — an edge shadow on each overflowing side signals that more tabs exist — while the kebab stays fixed and fully visible at the row's right edge (layout: `_Tab1_ Tab2 Tab3 … [⋮]`).

---

### User Story 3 - Share and deep-link a view via URL (Priority: P3)

A user wants to bookmark a specific table state or reopen it from another device. Every view state is representable in the page URL — either as a fully inlined configuration or as a reference to a saved view, optionally with overriding parameters. Opening such a URL lands directly on that view.

**Why this priority**: URL addressability makes views bookmarkable and navigable (back/forward, links from elsewhere in the hub), but it builds on views already existing.

**Independent Test**: Can be tested by copying the URL of a configured view, opening it in a fresh browser session, and confirming the identical table state renders; and by editing view parameters in the URL and confirming the table follows.

**Acceptance Scenarios**:

1. **Given** a table configured on an unsaved tab, **When** the user copies the page URL and opens it in another session, **Then** the same configuration is applied on load from the inlined view state.
2. **Given** a URL that references a saved view together with override parameters, **When** it is opened by the view's owner, **Then** the saved configuration loads with the overrides applied on top, and the tab shows the unsaved-changes indicator because the effective configuration differs from the stored one.
3. **Given** the user is viewing an entity table, **When** the view-related query string changes (navigation, back/forward, an edited URL), **Then** the table navigates directly to the newly described view state.
4. **Given** a page hosting more than one entity table, **When** view parameters are present under different table namespaces, **Then** each table applies its own view state independently.

---

### User Story 4 - Organize saved views (Priority: P4)

Over time a user accumulates views and needs to manage them: rename, pin or unpin, reorder, delete, and duplicate an existing view as a starting point for a variation.

**Why this priority**: Housekeeping matters once several views exist, but the feature is valuable before management tooling is complete.

**Independent Test**: Can be tested by opening each tab's own menu and performing save, close, duplicate, pin, set-as-default, rename, and delete — including on a view first opened from the kebab's "Open" submenu — and confirming each change persists.

**Acceptance Scenarios**:

1. **Given** a saved view that is not currently open as a tab, **When** the user opens it from the kebab's "Open" submenu, **Then** it becomes a tab whose own menu offers the full set of management actions (rename, pin/unpin, set as default, delete) — there is no separate management modal.
2. **Given** a tab is active, **When** the user left-clicks it (or right-clicks any tab), **Then** that tab's menu opens offering Save, Close, Duplicate, Pin/Unpin, Set as default, Rename, and Delete, with actions that cannot apply to that tab shown disabled rather than hidden.
3. **Given** a view named "X" is active, **When** the user chooses Duplicate from its menu, **Then** a new unsaved tab opens with an identical configuration also named "X"; saving it creates a second stored view sharing that name.
4. **Given** a pinned view, **When** the user unpins it from its tab menu, **Then** its tab no longer appears by default in future sessions while the view remains listed in the kebab's "Open" submenu.
5. **Given** a saved view is open in a tab, **When** the user deletes that view from its tab menu, **Then** the tab stays open as an unsaved tab holding the same configuration, so no work in progress is lost.
6. **Given** any saved view that is not the current default, **When** the user chooses "Set as default" from its menu, **Then** it becomes the table's default view — pinned and no longer deletable — the previous default demotes to an ordinary saved view that can be unpinned, closed, and deleted, and neither view changes position in the tab row.
7. **Given** any open tab, **When** the user chooses Rename from its menu, **Then** a Rename dialog opens pre-filled with the tab's current name: committing a trimmed non-empty name renames a stored view in place or relabels an unsaved tab; cancelling leaves the name unchanged.

---

### Edge Cases

- A URL references a saved view whose identifier no longer exists or belongs to a different account: the table falls back to its default view and the user is informed with a non-blocking notice.
- A URL carries an invalid or corrupted inline view serialization: the table falls back to its default view with a non-blocking notice rather than failing to render.
- A saved view references a column or attribute that no longer exists (for example, a removed dynamic parameter column): the unavailable parts are ignored, the rest of the configuration applies, and the view can be re-saved in its cleaned form.
- Two or more views on the same table carry the same name: this is allowed. They remain distinguishable by tab order and by their URLs, which reference the stored identifier rather than the name.
- A name is submitted as whitespace only (or with surrounding spaces): surrounding whitespace is trimmed; a name that is empty after trimming is rejected and the Rename dialog stays open.
- A saved view is edited and then saved: the override parameters leave the URL immediately, returning it to the bare view reference, and the indicator clears in the same step (FR-034).
- A saved view is edited and the user switches to another tab: the edited tab keeps its indicator while inactive; the URL now describes the newly active tab, so it carries no overrides for the edited one (FR-013).
- The user navigates to a table from the nav menu (no view parameters in the URL) while a default view is stored: the stored configuration is applied, the row is clean, and the URL stays free of override parameters — arriving fresh never manufactures a difference against the view being displayed.
- Reset changes is chosen on a tab whose edits came from URL overrides rather than the toolbar: the same rule applies — the tab returns to its stored (or blank) configuration and the overrides leave the URL.
- Reset changes is chosen on a tab that is not active: that tab returns to its baseline and loses its indicator; the active tab and the URL are unaffected.
- A view is opened or the page is reloaded and the user changes nothing: no tab shows the unsaved-changes indicator, and the URL contains no override parameters beyond the view reference itself (FR-032).
- The user adds an empty view and reloads: the blank view returns as its own unsaved tab and is active; the default view's tab is present, clean, and carries its own configuration untouched (FR-018).
- The URL carries an inline configuration while NO unsaved tab is open (the usual case after a reload): a new unsaved tab is created for it rather than the default tab being overwritten.
- A saved view whose stored configuration differs from the page defaults is the active tab at load: the table adopts the STORED configuration and the tab is clean — the pre-adoption state is never published to the URL.
- The page is refreshed, or the user navigates away and back, while unsaved tabs are open: those tabs are discarded (FR-018). The one exception is the tab the URL addresses, which returns with its inline configuration intact.
- An unpinned saved view is open as a tab and the page reloads: it returns only if the URL addresses it (i.e. it was the active tab); otherwise it closes and stays listed under the kebab's "Open" submenu.
- A pinned view's tab is closed and the page reloads: it comes back — the row always shows every pinned view (closing is a per-visit action, unpinning is the persistent one).
- All other views are unpinned or deleted: the view row always retains at least the table's default view tab as a fallback (whichever view currently holds the default role cannot be deleted).
- A very long view name: the tab shows a truncated name with the full name available on demand, and the row's overflow behavior is unaffected.
- A rename targets a name already used on the same table: accepted — names are not unique (FR-016).
- The view row is hidden (single default view) and the user modifies the table configuration: the reveal affordance surfaces the unsaved-changes indicator, so the dirty state stays visible without the row.
- Every saved view is already open as a tab (or the account has none): the kebab's "Open" submenu shows a disabled "no views to open" entry rather than an empty menu.
- "Set as default" is chosen on a tab that has no stored view yet, or on the view that already holds the default role: the action is unavailable (shown disabled) — a view must be saved before it can take the default role.
- The default role transfers while the previous default has unsaved changes: the demotion does not touch either tab's configuration or dirty state; only the default role, and the pinned/undeletable status that rides with it, move.
- Another view is set as default while the page's own default view is still virtual (never saved or renamed): the promoted view takes the role, and the virtual tab — which has no stored identity to demote — stays open as an unsaved tab holding the same configuration, as it does when a saved view is deleted.
- A tab is dragged onto the position of a tab that has no stored view: the visual order updates for this visit; only saved views contribute to the persisted order.
- A tab menu is open and the user clicks elsewhere on the page (another tab, the table, the toolbar): the menu closes without running any action; the click otherwise behaves normally.
- A wide tab is dragged past a narrow one (or the reverse): the dragged tab keeps its own width throughout the drag — no horizontal stretching or squeezing to match its neighbours.
- Tabs are dragged while the strip is scrolled: the drop position follows the pointer over the scrolled strip, and the persisted order reflects the resulting left-to-right sequence.

## Requirements *(mandatory)*

### Functional Requirements

**View capture & scope**

- **FR-001**: The system MUST let a user capture an entity table's current configuration — filter conditions, sorting, column visibility, column ordering, per-column pinning (left/right, any number of columns per side), and page size — as a named saved view.
- **FR-002**: Saved views MUST be scoped to the entity table they were created on and to the owning user account; a table's view row and kebab menu list only that table's views for the signed-in account.
- **FR-003**: A default view MUST always exist for every entity table (formerly the fixed "Tabular" view). It is a plain view: the user can modify, rename, save, and reposition it like any saved view; only deletion is excluded — it is the guaranteed fallback and is pinned for as long as it holds the default role. Its initial name and configuration come from the hosting page: "Table" and the built-in defaults unless the page specifies otherwise (the inventory catalog's default view is named "YTD", matching its seeded year-to-date filter). Until first saved or renamed it exists virtually (nothing stored); the first save or rename materializes it as a stored view for the account. The default role is not tied to a position in the tab row — the default view can be dragged anywhere like any other tab.
- **FR-026**: Exactly one view per table per account MUST hold the default role, and that role MUST be transferable to any other saved view of the same table. Transferring is atomic: the receiving view becomes default (pinned, no longer deletable) and the previous holder demotes to an ordinary saved view (unpinnable, closable, deletable) in the same operation, so the table is never left with zero or two defaults. Transferring the role MUST NOT change either view's configuration, dirty state, or position in the tab row: the promoted tab MUST stay exactly where it sits (it is never moved to the front) and the demoted view MUST remain clean — its stored configuration is still its baseline.

**Serialization & URL navigation**

- **FR-004**: A view configuration MUST be fully serializable, so any view state can be represented either inline in the page URL or as a stored saved view referenced by identifier.
- **FR-005**: A URL MUST be able to reference a saved view together with override parameters; on load, the stored configuration applies first and the overrides apply on top of it.
- **FR-006**: Opening a URL containing serialized view state MUST navigate directly to that view, and subsequent changes to the view-related query string MUST navigate the table to the newly described state.
- **FR-007**: View parameters in the URL MUST be namespaced per table so that pages hosting multiple entity tables can address each table's view independently.
- **FR-008**: Invalid, corrupted, or unresolvable view references in a URL MUST NOT break the page; the affected table falls back to its default view and the user is informed.
- **FR-022**: The inline URL serialization MUST be human-readable and hand-editable: each configuration facet (filters, sorting, column visibility/order, pinning, page size, page, or a saved-view reference) appears as a discrete, named query parameter under the table's namespace — never as a single opaque encoded value — so a person can read and edit the state directly in the address bar. (Replaces the round-1 packed `view[<tableKey>]` mini-format.) **The saved-view reference is the exception**: because names need not be unique (FR-016), it carries the view's stored identifier rather than its name, so a shared link always resolves to exactly one view. All other facets stay in plain readable form. A tab with no stored view (a scratch tab) carries no reference and serializes its configuration inline.

**View tab row**

- **FR-009**: Every entity table with the standard operations toolbar MUST provide a view-control row above that toolbar, laid out left to right as: the open view tabs, then a kebab menu fixed at the row's right edge — subject to the auto-hide behavior in FR-025. (The kebab replaces both the round-2 "+" button and the round-2 "View" control.)
- **FR-010**: The displayed tabs MUST be the account's pinned views for that table, in their persisted order, plus any additional views opened during the current visit (see FR-018 — the list is rebuilt on every page load).
- **FR-011**: The kebab menu MUST provide exactly two entries: "Add empty view" and an "Open" submenu. "Add empty view" immediately opens a new unsaved tab holding a **blank** configuration — no filter conditions, no sort rules, every column visible in the page's natural column order, and no pinned columns — at the page's default page size. (This is deliberately NOT the table's default view configuration, which may carry a seeded filter such as the inventory catalog's "YTD".)
- **FR-012**: The kebab's "Open" submenu MUST list exactly the table's saved views that are not currently open as tabs; choosing one opens it as a tab and activates it. When no such view exists, the submenu MUST show a disabled empty-state entry.
- **FR-013**: A tab MUST show the unsaved-changes indicator in exactly two situations, and in no others:
  1. the tab has no stored view (an unsaved/inline configuration, whether created this visit or restored from the URL); or
  2. the tab represents a stored view whose effective configuration differs from the stored one.

  The indicator reflects each tab's OWN state, so a tab holding unsaved work keeps its indicator while inactive, even though the URL describes only the active tab.
- **FR-033**: The indicator and the URL MUST agree for the ACTIVE tab, in both directions: an active tab that represents a stored view shows the indicator **if and only if** the URL carries at least one override parameter for that table. A dot with no overrides means the system invented a difference; overrides with no dot means the URL is describing state the table is not in. Either is a defect.
- **FR-034**: The URL MUST stay as compact as the state allows. While the active tab matches its stored view exactly, the URL carries ONLY that view's reference — no override parameters. Override parameters appear only for facets the user has actually changed, and MUST disappear again the moment those changes are saved (the save makes them the stored configuration, so there is nothing left to override). A clean default view carries no view parameters at all, the bare page URL being the most compact form of "the default view".
- **FR-032**: The indicator MUST NOT appear as a side effect of loading. Opening or reloading a table without touching it MUST leave every tab clean, which requires two things of the URL writer: (a) it MUST NOT emit override parameters that merely restate a view's stored configuration, and (b) it MUST NOT publish a tab's state before that tab has finished loading its stored configuration — a half-loaded tab's state must never be written to the URL, because a later visit would replay it as genuine overrides and mark the view dirty forever.
- **FR-014**: Save MUST never prompt for input. Saving a modified saved view persists the current configuration to that view and clears its unsaved-changes indicator; saving a tab that has no stored view yet creates one immediately, named exactly as the tab is currently labelled (a new scratch tab is auto-labelled "New view"). No naming dialog exists anywhere in the save path.
- **FR-015**: Duplicating a view from its tab menu MUST open a new unsaved tab with an identical configuration and **the same name** as its source — names need not be unique, so no "(n)" suffix is generated.
- **FR-016**: Saved view names MUST NOT be required to be unique: any number of views on the same table may share a name. Leading and trailing whitespace MUST be trimmed from a name before it is stored, and a name that is empty after trimming MUST be rejected.
- **FR-017**: Every view-management action — rename, pin/unpin, set as default, delete, and reorder — MUST be reachable from a view's own tab: rename/pin/set-as-default/delete through its tab menu, ordering through tab drag (FR-027). A view that is not currently open as a tab is managed by opening it first from the kebab's "Open" submenu. There is no separate view-management modal.
- **FR-018**: Tabs other than the one holding the default role MUST be closable. Open tabs MUST NOT be persisted: on every page load — a refresh, a navigation back to the table, or a fresh session — the row is rebuilt from scratch and shows exactly (a) the account's pinned views for that table, including the one holding the default role, and (b) the single view addressed by the URL, which may be an unpinned saved view or an inline unsaved configuration. Every other tab open before the load — unsaved scratch tabs and opened-but-unpinned saved views — is discarded, along with any unsaved changes they held. When the URL describes an **inline** (unsaved) configuration rather than a stored view, it MUST be restored as its OWN unsaved tab — auto-labelled "New view" — and made active. It MUST NEVER be applied to the default tab: doing so silently rewrites the default view's configuration and makes it show the unsaved indicator on arrival.
- **FR-031**: All confirmation dialogs MUST follow the constitution's footer rule: Cancel flushed to the LEFT edge of the footer, the primary (confirming) action on the right. This MUST come from ONE shared confirmation helper adopted at every confirmation call site in the app, so no surface can drift back to a right-aligned button pair.
- **FR-019**: Deleting a saved view that is currently open MUST keep its tab open as an unsaved tab holding the same configuration.
- **FR-020**: When the tabs overflow the available width (including narrow screens), the tabs area MUST scroll horizontally while the kebab stays fixed and fully visible at the row's right edge. The horizontal scrollbar MUST NOT be visible; instead, an edge shadow on each side that has content scrolled out of sight signals that more tabs exist, appearing and disappearing as the strip scrolls to either end.
- **FR-021**: A view configuration that references columns or attributes no longer available MUST degrade gracefully: unavailable parts are ignored and the remainder of the configuration applies.
- **FR-023**: Each tab MUST expose its own menu, opened by left-clicking the tab while it is active or by right-clicking any tab (left-clicking an inactive tab switches to it instead). The menu MUST offer Save, Close (labelled simply "Close" — it acts on this tab, so "Close tab" is redundant), Duplicate, Pin/Unpin, Set as default, Rename, and Delete for that tab; actions that cannot apply to the tab MUST be shown disabled rather than hidden. The menu MUST close when the user clicks anywhere outside it (and on Esc), leaving the tab otherwise untouched. Rename MUST open a **Rename dialog pre-filled with the tab's current name**: committing a trimmed non-empty name renames a stored view in place, or relabels an unsaved tab locally (it is stored on the next Save, per FR-014); cancelling leaves the name unchanged. (Replaces the round-2 double-click rename gesture, the round-3 inline rename input, and the per-tab close button, which moves into this menu.)
- **FR-035**: Each tab's menu MUST offer a **Reset changes** action, enabled only while that tab shows the unsaved-changes indicator. It discards the tab's edits without confirmation and without touching stored data: a tab representing a stored view returns to that view's saved configuration; a tab with no stored view returns to the blank configuration it was created with. After a reset the tab MUST be clean and, if it is the active tab, the URL MUST drop the override parameters that described those edits (FR-033).
- **FR-036**: On arriving at an entity table, the view holding the default role MUST have its STORED configuration applied to the table before anything is published to the URL. A fresh navigation with no view state in the URL MUST therefore land clean: the default view's own filters, sorting, columns and page size are in effect, no tab shows the unsaved indicator, and the URL carries no override parameters. The adoption MUST NOT be skipped because the application has already written parameters of its own — only view state that arrived with the navigation counts as user-provided.
- **FR-037**: Whatever the system publishes to the URL MUST be decided against the URL as it stands at that moment. When the visible state changes after the address bar was last written — which is the normal case, because a view's configuration is applied asynchronously — the system MUST issue the corrective write that brings the two back together. It MUST NOT skip that write on the belief that the URL already matches: a URL left describing state the table is not in is replayed as genuine overrides by the next load (the failure behind FR-032 and FR-036).
- **FR-027**: Tabs MUST be reorderable by dragging them within the tab row. The resulting left-to-right order MUST persist per account for saved views — surviving reload and later sessions, because it rides on the views themselves — while unsaved tabs order for the current visit only. Any tab may be dragged, including the one holding the default role. While a tab is being dragged it MUST keep its own rendered width: the dragged tab must never stretch, shrink, or otherwise distort to the size of the tab it passes over.
- **FR-025**: When a table has only its default view (no other saved views for the account), no additional tabs open, and no non-default view state in the URL, the view row MUST be hidden by default. A compact affordance near the table toolbar reveals it on demand; while the row is hidden, that affordance MUST surface the default tab's unsaved-changes indicator. The row MUST appear automatically as soon as a second view or tab exists (saved, opened this visit, or URL-addressed); a manual reveal persists for the rest of the session, surviving reloads (it is a display preference, not a tab).

**Sync & portability**

- **FR-024**: Saved views (including a materialized default view) MUST be part of the account's data export/import and git-remote sync alongside domain data: a publish → checkout (or export → import) round trip preserves each view's name, target table, configuration, pin state, display order, and which view holds the default role. Imported views attach to the account performing the import.

### Key Entities

- **Saved View**: A named, per-account, per-table record holding a view configuration plus presentation preferences — name, owning account, target entity table, pinned flag, and display order among the account's views for that table. Participates in data export/import and git-remote sync.
- **Default View**: The role held by exactly one of a table's views at a time — the guaranteed fallback. Initially seeded from the page's built-in configuration and page-provided name ("Table" unless the page overrides it; "YTD" for the inventory catalog) and existing only virtually until first saved or renamed. The holder behaves as a Saved View in every way except deletion, is pinned while it holds the role, and occupies no fixed position in the tab row. The role can be transferred to any other saved view of the same table, demoting the previous holder to an ordinary Saved View.
- **View Configuration**: The serializable payload describing a table state — filter conditions, sorting, column visibility, column ordering, per-column pinning, and page size. Exists inline (in a URL or an unsaved tab) or as the content of a Saved View; a saved reference may carry overrides layered on top.
- **View Tab**: A per-visit element in the view row representing either an opened Saved View (clean or with unsaved changes) or an unsaved configuration that has no stored view yet (auto-labelled "New view" until renamed or saved). Each tab carries its own menu of per-tab actions and can be dragged to reorder the row. Nothing about the tab list is stored: every page load rebuilds it from the account's pinned Saved Views plus the view the URL addresses (FR-018).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from an unconfigured table to reopening a previously saved view in at most 3 interactions (open the kebab, open "Open", pick the view) — or 1 for a pinned view already tabbed — versus rebuilding filters, sorting, and columns by hand.
- **SC-002**: Reopening a saved view restores 100% of the captured configuration — every saved filter condition, sort rule, column visibility choice, column position, column pin, and the page size — with no manual correction needed.
- **SC-003**: Opening a copied URL in a different browser session reproduces the identical table state on first load, with zero additional user actions.
- **SC-004**: For a recurring task requiring 3 filter conditions, 2 sort rules, and a custom column set, total setup time drops from over a minute of manual configuration to under 5 seconds via a pinned tab.
- **SC-005**: Users can always tell at a glance which open views have unsaved changes: 100% of dirty views show an indicator on their tab, and none show it when clean.
- **SC-016**: For the active tab, the indicator and the URL never disagree: across a load, an edit, a save, and a tab switch, an active stored-view tab shows the indicator exactly when the URL holds override parameters for that table — checked in both directions.
- **SC-017**: Arriving at a table by navigation, by reload, or by a bookmark carrying no view parameters produces the stored default view's configuration, zero unsaved indicators, and zero override parameters — every time, with no user action.
- **SC-019**: A page whose column set is discovered asynchronously (the catalog's parameter columns) satisfies SC-017 exactly as a page with a fixed column set does — the late columns change neither the adopted configuration, nor the indicator, nor the parameters written.
- **SC-018**: Reset changes returns the tab to its baseline in ONE interaction: the indicator clears, the table shows the baseline configuration, and any override parameters the edits had added disappear from the URL.
- **SC-015**: Loading or reloading a table and touching nothing produces ZERO unsaved-changes indicators on any tab that represents a stored view — on the first load and on every subsequent one. The state written to the URL on load never differs from what the loaded views already store, and inline URL state never lands on a stored view's tab.
- **SC-006**: On a narrow (mobile-width) screen with 6+ open tabs, every tab and the kebab menu remain reachable without any layout breakage, and the kebab stays fully visible at the row's right edge without scrolling the tab strip.
- **SC-007**: A person reading a shared view URL can identify the table and every configuration facet as a named query parameter, with no encoded blobs to decode. The only non-prose value permitted is the saved-view reference, which carries the view's identifier so that duplicate names cannot make a link ambiguous (FR-016/FR-022).
- **SC-008**: After a sync round trip (publish then checkout, or export then import), 100% of saved views are restored with identical names, target tables, configurations, pin states, ordering, and default-role assignment.
- **SC-009**: With the tab strip overflowing, no horizontal scrollbar is rendered at any scroll position, and an edge shadow is present on exactly the sides that have tabs scrolled out of view — both edges mid-scroll, one edge at each end.
- **SC-010**: A tab dragged to a new position stays in that position after a page reload and in a new session (saved views — the order rides on the views, not on the tab list), and the dragged tab's width stays within 2px of its resting width for the whole drag.
- **SC-011**: Setting a view as default leaves the table with exactly one default view at all times — never zero, never two — and neither the promoted nor the demoted view moves position, changes configuration, or acquires an unsaved-changes indicator.
- **SC-012**: Saving any tab — stored or brand-new — completes in exactly one interaction (the Save menu item) with no dialog in the path; naming is a separate, optional Rename action.
- **SC-013**: After a refresh with several scratch and unpinned tabs open, the row contains exactly the pinned views plus the URL's view — no leftover unsaved tabs, and no unsaved change survives except the one the URL carries.
- **SC-014**: 100% of confirmation dialogs in the app render Cancel at the footer's left edge and the confirming action at its right, from the one shared helper.

## Assumptions

- The entity operations from issue #6 (multi-condition filtering, multi-column sorting, column visibility and ordering, pagination via the standard toolbar) are already implemented and are the source of the configuration a view captures.
- The view capability is generic and applies to every entity table that uses the standard operations toolbar across domains (finance, inventory catalog, etc.); rollout may start with one table, but nothing in the design is table-specific.
- Views are personal: saved views, pin state, and ordering belong to the signed-in user account. Inline-serialized URLs reproduce a configuration for any account with access to the page; URLs referencing a saved view resolve only for the view's owner.
- Page size is part of a saved view's configuration; the current page position travels only in inline URL serialization (so shared links land on the exact page) and is not persisted when saving a view.
- A page's default view configuration must describe the state its table actually boots into (the same seeded filters, sorting, columns and page size passed to the table hook). A mismatch makes the default tab differ from its own baseline at mount and show the unsaved indicator forever — the pages adopting views today satisfy this, and any new adopter must too.
- Tabs are per-visit, not per-session: nothing about the open-tab list is persisted, so a refresh or a navigation rebuilds the row from the account's pinned views plus the URL (FR-018). The only view-row state that persists across a reload is the "row revealed" display preference from FR-025.
- The generic default-view name is "Table"; entity table pages may provide a more meaningful default name (the inventory catalog uses "YTD"). A brand-new scratch tab is auto-labelled "New view" until renamed. Alternative view types (charts, boards, etc.) remain out of scope for this feature.
- View names are labels, not identifiers: nothing in the system keys off a name (URLs, sync, and every stored reference use the view's identifier), which is what makes duplicate names safe.
- Cross-account sharing or transfer of saved views is out of scope; the sharing mechanisms are inline-serialized URLs and the account's own git-remote data sync (a same-account backup/transfer channel, not cross-account sharing).
- Each unihub deployment is effectively single-user; on data import, saved views attach to the importing account regardless of which account exported them.
