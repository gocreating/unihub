# Feature Specification: Data Migration Refinement

**Feature Branch**: `015-data-migration-refinement`

**Created**: 2026-07-20

**Status**: Implemented (all user stories, 2026-07-20); Sync-tab UI refinement round clarified and implemented 2026-07-21; commit-rail polish round and publish-button label rename clarified and implemented 2026-07-22 (manual walk-throughs T044/T050 pending a human session)

**Input**: User description: "for github issue #35" — GitHub issue #35 "Data migration refinement" (label: uni-infra): (1) critical bug — the catalog's default filter (obtained this year OR no obtained date) appears to be applied to the data sync push preview, showing 1000+ deletions of inventory items; (2) UI constitution violation — the preview table's page-size selector must sit to the left of the paginators; (3) new features — a commit graph in the sync tab (including force-push visibility), row-level staging of changes (default all checked, toggleable per row / per table / all), and replacing the legacy Preview/Apply Push/Pull buttons with commit-node interactions, where schema-incompatible commits are disabled for checkout.

## Clarifications

### Session 2026-07-21

User-review feedback on the shipped Sync tab, provided directly (no questions needed):

- Q: How should commit timestamps on the graph render? → A: Per the constitution's datetime rule — two stacked rows: absolute `YYYY-MM-DD HH:mm` primary, relative time (`fromNow()`) as muted secondary text.
- Q: How are node-level actions presented on the graph? → A: All per-node action buttons fold into a kebab (overflow "⋮") menu on each node; no standalone inline action buttons on graph rows.
- Q: How should graph tooltips anchor? → A: The hover target must be sized to fit its content (not the full row width) so the tooltip centers properly over what it describes.
- Q: How does the user review and publish local changes? → A: The "Review & publish" button and the "Local changes not yet published" placeholder are removed; the uncommitted node directly renders the pending (unstaged) changes — staging controls, per-table changesets, confirm — auto-loaded without a manual trigger.
- Q: What colors do the "Remote latest" and "Local" badges use? → A: Both use the standard blue info color (equal-rank informational markers).
- Q: How is a very long commit history handled? → A: Load the most recent few commits first (initial window: 10) with a "Load more" button fetching older commits in batches (20); the existing cursor pagination is retained with the smaller initial window.

### Session 2026-07-22

Second user-review round on the shipped commit rail, provided directly (no questions needed):

- Q: Does the commit graph keep its "History" container? → A: No — the content moves out of the "History" block and the container is removed entirely; the rail renders directly on the Sync tab.
- Q: Where does the "Load more" control live? → A: As its own timeline node at the end of the rail (own rail dot, part of the timeline), not a button below it.
- Q: Does the disabled Checkout kebab item show the incompatibility reason inline? → A: No — showing the reason inside the menu is an anti-pattern; the item is simply disabled, and the explanation stays on the node's tooltip (FR-018/FR-021).
- Q: How do the hash chip and the "Remote latest"/"Local" badges relate visually? → A: All three are badges of the same size (same chip height and font size); the hash renders as a badge, not inline code text.
- Q: What is the exact commit-node arrangement? → A: Line 1: hash badge, marker badge(s), kebab. Line 2: `{absolute time} ({relative time})` on a single line. Line 3: commit message. (User-directed deviation from the constitution's two-row datetime for this surface — both absolute and relative remain shown.)
- Q: What is the publish confirmation button's label? → A: "Publish Selected Changes" (renamed from "Publish staged changes"; the internal staging model and its terminology are unchanged — only the user-facing label changes).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sync Previews Reflect the Complete Dataset (Priority: P1)

The user opens the data migration page's Sync tab and requests a push preview. Even though their catalog page is configured with its default view filter (items obtained this year, or with no obtained date), the preview compares the **entire** local dataset against the remote snapshot. Items obtained in earlier years are not falsely reported as deletions, and confirming a publish never silently removes records from the remote snapshot that still exist locally.

**Why this priority**: This is a data-loss hazard. Today the push preview reports 1000+ deletions of inventory items that still exist locally; if the user confirmed that publish, the remote snapshot would lose those records and a later apply on another device would delete them from a real database. Nothing else in this feature matters if the preview cannot be trusted.

**Independent Test**: Seed a database with records spanning multiple years (some matching the catalog's default view filter, most not), publish once, change nothing, and request a push preview — it must report "up to date" with zero deletions. Change exactly one record and the preview must report exactly that one change.

**Acceptance Scenarios**:

1. **Given** a local database whose data is identical to the latest remote snapshot and a catalog page carrying its default view filter, **When** the user requests a push preview, **Then** the system reports everything is up to date and lists zero additions, zero modifications, and zero deletions.
2. **Given** a local database containing inventory records from many years (most outside the catalog's default filter range), **When** the user requests a push preview, **Then** no record is reported as a deletion unless it was actually removed from the local database.
3. **Given** the user modified exactly N records since the last publish, **When** they request a push preview, **Then** the preview lists exactly those N records — regardless of any list-view filters configured anywhere in the application.
4. **Given** a displayed push preview, **When** the user confirms the publish, **Then** the changes applied to the remote snapshot are exactly the changes that were previewed.
5. **Given** the same multi-year dataset, **When** the user requests a pull preview, **Then** the comparison likewise covers the complete dataset of every synced table.

---

### User Story 2 - Preview Tables Follow the Standard Footer Layout (Priority: P2)

The user pages through a large change preview. The pagination controls follow the project's constitution: interactive controls sit on the right, with the per-page size selector first (to the left of the page navigation).

**Why this priority**: An explicitly reported violation of the project constitution's table footer layout. Small in scope but it is a standing consistency defect on a highly visible surface.

**Independent Test**: Produce a change preview with more rows than one page, and inspect the pagination area of every change-preview table (push preview, pull preview, and any future checkout preview): the page-size selector renders immediately to the left of the page navigation.

**Acceptance Scenarios**:

1. **Given** a change preview whose row count exceeds one page, **When** the preview table renders, **Then** the page-size selector appears to the left of the page navigation controls, consistent with the constitution's footer layout (information left, controls right; size selector first, then pagination).
2. **Given** any surface in the data migration area that shows a paginated change preview, **When** it renders pagination, **Then** it follows this same layout — no preview table is exempt.

---

### User Story 3 - Commit Graph in the Sync Tab (Priority: P3)

The user opens the Sync tab and sees the data repository's history as a graph of commit nodes — when each snapshot was published and a summary of what it contains. The graph clearly marks which commit the local data state corresponds to and which commit is the latest on the remote, so the user understands the context of data changes before acting. If the data repository was force-pushed (history rewritten), the graph makes that visible instead of silently pretending nothing happened.

**Why this priority**: Foundation for the new interaction model (User Stories 4 and 5). Even standalone it delivers value: the user finally sees where their local data sits relative to remote history and can detect a rewritten remote.

**Independent Test**: Configure sync against a repository with several commits, open the Sync tab, and verify the graph lists the commits with their metadata and correctly marks the local and remote positions. Force-push the repository from outside the app, reload, and verify the divergence is visibly flagged.

**Acceptance Scenarios**:

1. **Given** a configured sync repository with existing history, **When** the user opens the Sync tab, **Then** a commit rail loads automatically directly on the tab (no enclosing "History" container), each node arranged per FR-027 — hash badge + marker badges + kebab, then a single-line `YYYY-MM-DD HH:mm (relative)` timestamp, then the message — with a loading indicator while it fetches.
2. **Given** the graph is displayed, **When** the user inspects it, **Then** they can identify which commit the local data state corresponds to and which commit is the newest on the remote (ahead / behind / in-sync at a glance).
3. **Given** the remote repository's history was rewritten (force-pushed) since the local state last synced, **When** the user opens or refreshes the Sync tab, **Then** the graph visibly indicates that the remote history no longer matches what was previously known, rather than failing or showing a misleading linear history.
4. **Given** the remote is unreachable, **When** the graph loads, **Then** the user sees a descriptive error and can retry.

---

### User Story 4 - Row-Level Staging of Changes (Priority: P4)

Before confirming a sync operation, the user reviews the change preview and unchecks specific rows they are not ready to sync. By default every row is checked. They can toggle selection at three levels: an individual row, an entire table, or all changes at once. Only checked rows are included in the confirmed operation; unchecked changes remain pending and reappear in the next preview.

**Why this priority**: Gives the user fine-grained control so they never have to sync everything at once, but it only becomes meaningful once previews are trustworthy (User Story 1).

**Independent Test**: Create a changeset of multiple rows across at least two tables, uncheck one row and one whole table, confirm, and verify the resulting snapshot contains exactly the checked changes while the unchecked ones reappear on the next preview.

**Acceptance Scenarios**:

1. **Given** a change preview is displayed, **When** it first renders, **Then** every row is checked by default.
2. **Given** a displayed preview, **When** the user toggles a single row, a table-level control, or the all-changes control, **Then** the selection updates at exactly that scope, and the displayed selected-versus-total counts update accordingly.
3. **Given** some rows are unchecked, **When** the user confirms the operation, **Then** only the checked rows are applied, and the unchecked changes remain pending and appear in the next preview.
4. **Given** every row is unchecked, **When** the user attempts to confirm, **Then** the system prevents the operation and explains there is nothing selected.
5. **Given** a checked change depends on an unchecked change (e.g., a selected record references another record that only exists in the unchecked set), **When** the user confirms, **Then** the system keeps the resulting snapshot internally consistent by automatically including the required dependent changes and informing the user which rows were added to the selection.

---

### User Story 5 - Operate Sync Through Commit-Node Interactions (Priority: P5)

Instead of the four legacy action buttons ("Preview Push", "Preview Pull", "Apply Push", "Apply Pull"), the user drives sync by interacting with nodes on the commit graph. Each node exposes its actions through a kebab (overflow) menu — graph rows carry no standalone inline action buttons. Interacting with a commit node lets the user check out that snapshot — restoring local data to the state captured at that commit — after reviewing a change preview. The node representing the local uncommitted state directly renders the pending changes (with staging controls) so the user reviews and confirms a publish in place — there is no separate "Review & publish" step or placeholder message. Commits whose data layout is incompatible with the current application are visibly disabled so the user cannot check out to them.

**Why this priority**: The full interaction redesign. It depends on the graph (User Story 3) and reuses trustworthy previews (User Story 1) and staging (User Story 4), so it lands last.

**Independent Test**: With a repository containing both compatible and incompatible commits, verify every legacy button's capability is reachable through graph interactions, a checkout to an older compatible commit restores exactly that snapshot after a previewed confirmation, and incompatible commits are disabled with an explanation.

**Acceptance Scenarios**:

1. **Given** the commit graph is displayed, **When** the user looks for sync actions, **Then** publishing local changes and applying/checking out remote snapshots are all available through interactions with graph nodes, and the four legacy standalone buttons are gone.
2. **Given** the user interacts with a compatible commit node, **When** they choose to check out that snapshot, **Then** the system shows a change preview of what would change locally (with row-level staging per User Story 4) and applies it only after explicit confirmation.
3. **Given** a commit whose data layout is incompatible with the current application version (a breaking change to the synced table structure), **When** the graph renders it, **Then** the node is visibly disabled with an explanation, and no checkout to it can be initiated.
4. **Given** the user has local changes not yet published, **When** they view the graph, **Then** the uncommitted node directly renders those pending changes — staging controls, per-table changesets, and the publish confirmation — without any manual trigger, and publishing behaves like today's publish (including the existing diverged-history recovery choices: apply the newer remote first, or force-overwrite the remote).
5. **Given** the user checks out an older commit and later publishes, **When** the publish completes, **Then** the remote gains a new latest snapshot reflecting the user's current local data (history moves forward; no silent rewriting of existing remote commits).

---

### Edge Cases

- Remote repository has no commits yet (first-ever sync): the graph shows an empty history with only the local pending state, and publish still works.
- Force-pushed remote where the local state's commit no longer exists on the remote at all: the graph must still render and clearly flag the divergence.
- Checkout requested while local unpublished changes exist: the preview must make clear those local changes would be overwritten, and nothing happens without confirmation.
- Partial staging that would orphan dependent records (e.g., staging a record whose parent record's creation is unstaged): the system auto-includes dependencies and tells the user.
- A table exists in a historical commit but no longer exists in the application (or vice versa): compatibility assessment must handle missing/extra tables, not just changed columns.
- Very long repository histories: the graph loads a bounded recent window and lets the user load more, rather than fetching unbounded history.
- Preview or graph fetch fails mid-way (network error, credential revoked): descriptive error, no partial application of changes.
- Zero-change checkout (checking out the commit the local state already matches): the system reports there is nothing to change.

## Requirements *(mandatory)*

### Functional Requirements

**Preview correctness (bug fix)**

- **FR-001**: All sync change previews (push and pull direction, and any checkout preview) MUST be computed over the complete dataset of every synced table, unaffected by any list-view filters, default catalog filters, or per-user saved view preferences anywhere in the application.
- **FR-002**: A change preview MUST report a row as added, modified, or deleted only if that operation would actually occur upon confirmation, and confirming MUST perform exactly the previewed (and staged) changes — nothing more, nothing less.
- **FR-003**: When the local dataset is identical to the compared snapshot, the system MUST report "up to date" and MUST NOT list any deletions. Publishing MUST never remove records from the remote snapshot that still exist in the local database.
- **FR-004**: The scenario of acceptance test US1-2 (multi-year dataset, default catalog filter active) MUST be covered by an automated regression test.

**Preview table pagination (constitution compliance)**

- **FR-005**: Every paginated change-preview table in the data migration area MUST follow the constitution's standard footer layout: non-interactive information on the left, all interactive controls on the right, ordered per-page size selector first, then the page navigation.

**Commit graph**

- **FR-006**: The Sync tab MUST display the configured data repository's history as a graph of commit nodes, each showing at least the commit time and its message/summary, loading automatically when the tab opens (with a loading indicator) using the already-configured repository credentials. Commit timestamps MUST render on a single line — absolute `YYYY-MM-DD HH:mm` followed by the relative time in parentheses (clarified 2026-07-22: an explicit user-directed deviation from the constitution's two-row datetime default for this surface; both absolute and relative values remain present).
- **FR-007**: The graph MUST distinctly mark (a) the commit corresponding to the current local data state and (b) the latest remote commit, making ahead / behind / in-sync status readable at a glance. Both the "Local" and "Remote latest" badges MUST use the standard blue info color — they are equal-rank informational markers; position and label convey the distinction, not contrasting colors.
- **FR-008**: The graph MUST make remote history rewrites (force-pushes) visible: when previously known commits are no longer part of the remote history, the user is explicitly informed instead of being shown a misleading linear history.
- **FR-009**: The graph MUST load only the most recent commits by default (initial window: 10) and let the user load older commits on demand via a "Load more" control that fetches further batches (20 per batch) using cursor pagination; history is never fetched unbounded. The "Load more" control MUST render as its own timeline node at the end of the rail (own rail dot, connected to the timeline), shown only while older commits exist.
- **FR-021**: Every tooltip on the graph MUST anchor to a hover target sized to fit its content (not stretched to the full row/card width) so the tooltip renders centered over the element it describes.

**Row-level staging**

- **FR-010**: Change previews MUST let the user include or exclude changes at three scopes — individual row, entire table, and all changes — with every row included by default.
- **FR-011**: The preview MUST display selected-versus-total counts so the user can see how much of the changeset is staged.
- **FR-012**: Confirming an operation MUST apply only the staged rows; unstaged changes MUST remain pending and reappear in subsequent previews, with no data lost.
- **FR-013**: When nothing is staged, the confirm action MUST be unavailable and the system MUST explain why.
- **FR-014**: The system MUST keep every produced snapshot internally consistent: if a staged change depends on an unstaged change, the dependency is automatically included and the user is informed which rows were added.

**Commit-node interactions**

- **FR-015**: All sync operations (publish local changes, apply/check out a remote snapshot) MUST be initiable from the commit graph, replacing the four legacy standalone action buttons ("Preview Push", "Preview Pull", "Apply Push", "Apply Pull").
- **FR-016**: Checking out a commit MUST restore the local dataset to the state captured at that commit, and MUST always show a change preview (with staging per FR-010–FR-014) and require explicit confirmation before anything is applied.
- **FR-017**: The system MUST assess each commit's compatibility with the current application version. A commit is compatible when its snapshot can be applied to the current data structure without error or data loss (tolerating additive differences the existing import already handles); commits with breaking structural differences are incompatible.
- **FR-018**: Incompatible commits MUST be visibly disabled on the graph with an explanation of why, and the system MUST refuse any checkout attempt against them.
- **FR-019**: Publishing MUST remain available when local and remote histories have diverged, presenting the existing recovery choices (apply the newer remote state first, or force-overwrite the remote) explicitly.
- **FR-020**: Publishing after a checkout to an older commit MUST create a new latest snapshot on the remote reflecting the current local data; the system itself MUST never rewrite existing remote history as a side effect of a normal publish.
- **FR-022**: Node-level actions MUST be presented in a per-node kebab (overflow) menu instead of inline buttons — graph rows carry no standalone action buttons. An action unavailable for a node (e.g., checkout of an incompatible commit) appears as a plainly disabled menu item; the menu MUST NOT embed the explanation text (clarified 2026-07-22) — the reason is conveyed by the node's tooltip per FR-018/FR-021.
- **FR-023**: When local unpublished changes exist, the uncommitted node MUST directly render the pending changes — staging controls per FR-010–FR-014, per-table changesets, and the publish confirmation labeled "Publish Selected Changes" (clarified 2026-07-22) — auto-loaded with no manual trigger. The "Review & publish" button and the "Local changes not yet published" placeholder text are removed. If the pending-changes preview fails to load, the node shows a descriptive error with a retry.
- **FR-024**: At most one staged review is active at a time: initiating a checkout review supersedes the uncommitted node's inline review (and its staging selection) until the checkout is confirmed or dismissed, after which the inline pending-changes review returns.
- **FR-025**: The commit rail MUST render directly on the Sync tab with no enclosing titled or collapsible container — the former "History" block is removed; loading, error, and rewritten-history states render in the same bare layout.
- **FR-026**: The commit hash MUST render as a badge visually uniform with the "Remote latest" and "Local" marker badges — identical chip height and font size for all three.
- **FR-027**: Each commit node MUST follow this arrangement: first line — hash badge, marker badge(s), kebab trigger; second line — the single-line timestamp per FR-006; third line — the commit message.

### Key Entities

- **Data Commit**: One published snapshot of the full dataset in the sync repository's history — identity, timestamp, message/summary, parent lineage, compatibility status with the current application, and whether it matches the local state and/or is the remote latest.
- **Change Record**: One row-level difference between two dataset states — the affected table, record identity, operation (add / modify / delete), and before/after values.
- **Table Changeset**: The grouped change records for one synced table within a preview, with per-operation counts and its table-level staging state.
- **Staging Selection**: The user's chosen subset of change records for a pending operation — defaults to everything, adjustable at row / table / all scopes, and augmented automatically with required dependencies.
- **Repository State**: The relationship between local data and remote history — the local state's commit, the remote latest, ahead/behind/diverged status, and whether the remote history was rewritten.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a local dataset identical to the latest remote snapshot — including datasets spanning many years with the catalog's default view filter active — a push preview reports up-to-date with zero deletions, 100% of the time.
- **SC-002**: When exactly N records differ from the compared snapshot, previews list exactly those N records; confirmed operations match their preview exactly in 100% of cases.
- **SC-003**: Every paginated change-preview table renders its page-size selector to the left of the page navigation with controls right-aligned — zero non-conforming preview tables in the data migration area.
- **SC-004**: Within 10 seconds of opening the Sync tab, the user can determine which commit their local data corresponds to, whether the remote is ahead/behind/in sync, and whether the remote history was rewritten.
- **SC-005**: The user can exclude any subset of rows from a changeset; the resulting operation contains exactly the staged changes and zero unstaged changes are lost (they reappear in the next preview).
- **SC-006**: Every capability previously reachable via the four legacy buttons is reachable through the commit graph; checkouts to compatible commits reproduce that snapshot exactly, and zero checkouts to incompatible commits are possible.
- **SC-007**: Graph rows contain zero standalone inline action buttons — every node action sits in that node's kebab menu — and when local changes exist their staged review is visible in the uncommitted node without a single prior click.
- **SC-008**: The commit rail renders with zero container chrome (no "History" title or card/collapse wrapper); 100% of commit nodes follow the FR-027 arrangement; the hash and marker badges share one chip size; "Load more" appears only as a timeline node; no menu anywhere embeds an incompatibility reason.

## Assumptions

- Row-level staging applies to every change preview direction — publish (push), apply (pull), and checkout — with the same selection model and defaults.
- The legacy buttons are fully replaced (the issue says they "may be replaced"; this spec commits to the replacement) as long as every existing capability — publish, preview, apply, force-publish on divergence — remains reachable through the graph.
- When a staged change depends on an unstaged one, the default resolution is to auto-include the dependency and inform the user (rather than blocking the operation).
- Commit compatibility follows the existing import tolerance: snapshots with only additive/omitted-column differences that the current import already fills with safe defaults are compatible; missing tables, renamed/removed structures, or values the current application cannot ingest make a commit incompatible.
- The commit graph reads history using the already-configured repository credentials; no new credentials or external registrations are introduced.
- The graph's default history window is the 10 most recent commits, with "Load more" fetching older commits in batches of 20 (clarified 2026-07-21; supersedes the earlier ~50 default).
- Auto-rendering the pending changes in the uncommitted node reuses the existing publish-preview computation on Sync tab load; at this application's personal scale that cost is acceptable, and the preview's staleness pinning (`base_commit` + digest) continues to guard the confirm.
- The single-line commit-node timestamp (FR-006, clarified 2026-07-22) is an explicit user-directed deviation from the constitution's two-row datetime default, scoped to the commit rail only; other surfaces keep the two-row rule. Formalizing the pattern would require a constitution amendment.
- Checkout moves the local dataset to the selected commit's state; the remote repository is never modified by a checkout. Publishing afterwards always appends a new latest snapshot (force-overwrite remains an explicit, separate recovery action).
- The existing behaviors not called out by issue #35 — configuration form, PAT guidance, automatic status check on tab load, up-to-date short-circuits — are preserved.
