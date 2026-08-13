# Feature Specification: Quick Search

**Feature Branch**: `019-quick-search`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "for github issue #42" — Quick search (label: uni-infra): "For each entity, there should be an uniformed search endpoint that given a free text query, Unihub system fuzzy searches all attributes and returns the unioned results. With this feature, users don't need to waste time figuring out how to use filter dropdown. For the UI, add the search input box next to column dropdown in the entity toolbar. Stretch the search input box to fill container's width. As user types in the query, the search results should be displayed without trigger any actions. The search results are pre-scoped inside the view's filter, so the search is actually searching based on the active view. Switching to a different view should have a different search context. The matched part of content should be highlighted, if the matched part is in a visible column. Search requests should be throttled to prevent frequent keyboard typing."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find records by typing free text (Priority: P1)

A user looking at any entity table (currencies, accounts, exchange rates, inventory catalog, scenarios) wants to locate specific records without learning the filter controls. They type a fragment of anything they remember about the record — part of a name, an alias, a remark, a price, a custom parameter value — into a search box in the table toolbar. As they type, the table narrows to only the records where **any** attribute matches the query. No button press or Enter key is needed. Clearing the box restores the full table.

**Why this priority**: This is the core value of the feature — replacing "figure out which attribute to filter on and how" with "just type what you remember". Every other story refines this behavior.

**Independent Test**: On a single entity table with no views configured beyond the default, type a fragment known to appear in exactly one record's attribute; verify only that record remains listed and that clearing the box restores the original list. Delivers standalone value even if view scoping and highlighting are not yet built.

**Acceptance Scenarios**:

1. **Given** an entity table showing many records, **When** the user types a text fragment that appears in one record's name, **Then** the table shows only matching records without the user pressing Enter or clicking anything.
2. **Given** a record whose only occurrence of the fragment is in a custom parameter value (not a built-in field), **When** the user types that fragment, **Then** the record appears in the results — the search covers all attributes, and a record matching on any one attribute is included.
3. **Given** an active search with results showing, **When** the user clears the search box, **Then** the table immediately returns to its un-searched state (same records, ordering, and page size as before the search).
4. **Given** a query that matches no records, **When** results update, **Then** the table shows its standard empty state and the count reflects zero matches.
5. **Given** matching text in Chinese (the user's data is largely zh-TW), **When** the user types a CJK fragment, **Then** matching behaves identically to Latin text.

---

### User Story 2 - Search inside the active view (Priority: P2)

A user has a saved view with its own filter (e.g., a view showing only this year's acquisitions). When they type a search query, the results are drawn only from the records the active view's filter already admits — the search narrows the view, it never escapes it. Each open view keeps its own search context: switching to another view tab shows that view's records with that tab's own (possibly empty) query, and switching back restores the previous tab's query and results.

**Why this priority**: Views are how this product organizes entity tables; a search that ignored the active view's filter would silently show records the user believes are excluded, which is worse than no search.

**Independent Test**: Create a view whose filter admits a subset of records, activate it, and search for a term that matches both an admitted record and an excluded record; verify only the admitted record appears. Then switch tabs and back, verifying each tab's query is independently retained.

**Acceptance Scenarios**:

1. **Given** an active view whose filter excludes record X but admits record Y, both containing the search term, **When** the user searches for that term, **Then** only Y appears in the results.
2. **Given** a query typed in view tab A, **When** the user switches to view tab B, **Then** tab B shows its own results with its own search state (empty unless B already had a query), and switching back to A restores A's query and results.
3. **Given** any search query (active or cleared), **When** the user inspects the view, **Then** the view shows no unsaved-changes indicator caused by searching, and saving the view stores nothing about the search — the search is a transient lens, not part of the view's configuration.
4. **Given** an active search, **When** the user changes the view's filter or sort, **Then** the search re-applies on top of the changed scope and the results reflect both.

---

### User Story 3 - See why each record matched (Priority: P3)

While searching, the user can see at a glance why each listed record matched: the matched fragment is visually highlighted wherever it appears inside a visible column. If a record matched only on an attribute that is not shown as a visible column, the record still appears in the results — it simply carries no highlight.

**Why this priority**: Highlighting builds trust in the results and helps the user pick the right record quickly, but the search is fully usable without it.

**Independent Test**: Search for a fragment appearing in a visible column of one record and only in a hidden column of another; verify the first shows a highlight on the fragment, the second appears without a highlight.

**Acceptance Scenarios**:

1. **Given** search results where a record's visible Name cell contains the query text, **When** the results render, **Then** the matching fragment inside that cell is visually distinguished from the surrounding text.
2. **Given** a record that matched only on a hidden attribute, **When** the results render, **Then** the record is listed with no highlight.
3. **Given** the query text appears in several visible columns of the same record, **When** the results render, **Then** each visible occurrence is highlighted.

---

### User Story 4 - Typing stays smooth (Priority: P3)

A user typing a query at normal speed experiences a responsive input — every keystroke appears instantly — while the system consolidates lookups instead of issuing one per keystroke. Results always correspond to the latest text in the box, never to an earlier, partially-typed query.

**Why this priority**: Without consolidation, fast typing floods the system with lookups and risks showing stale results; but this is a quality-of-behavior refinement of Story 1.

**Independent Test**: Type a multi-character query quickly and observe that lookups are consolidated (far fewer lookups than keystrokes) and the final displayed results match the final query text.

**Acceptance Scenarios**:

1. **Given** a user typing a 10-character query in one continuous burst, **When** they stop, **Then** the results shown correspond to the full 10-character query, and the number of lookups performed is a small fraction of the keystroke count.
2. **Given** lookups for an earlier and a later query state complete out of order, **When** results render, **Then** the table reflects the latest typed query, never a superseded one.

---

### Edge Cases

- A query of only whitespace is treated as an empty query (no search active).
- The user is on page 3 of results and edits the query so fewer pages exist: the table returns to the first page of the new result set.
- The active view's filter admits zero records: any search over it returns zero results — the search never widens the scope.
- A record matches on the textual form of a number or date (e.g., typing "129" matches a price of 129): the record is included; numeric and date attributes participate via their textual representation.
- The matched fragment sits inside a truncated cell (text cut off with an ellipsis): the record is listed; the highlight appears wherever the fragment is actually rendered.
- Query characters that have special meaning in pattern languages (e.g., `%`, `_`, `(`, `)`) are treated as literal text to match, never as operators.
- The user types, then clears the box before the consolidated lookup fires: no search is applied and no stale "searching" state remains.
- Switching view tabs while a lookup is in flight: the arriving results for the old tab must not overwrite the new tab's table.
- A very long query (hundreds of characters) is accepted without error and simply matches nothing if nothing contains it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every entity table page MUST offer a single free-text search input located in the table toolbar, immediately adjacent to the column control, stretched to fill the toolbar's remaining width.
- **FR-002**: Search MUST be live: results update as the user types, with no explicit trigger (no Enter key, no search button) required.
- **FR-003**: A record MUST be included in results when the query matches **any** of its attributes (the union of per-attribute matches), including custom/user-defined parameters. Matching is case-insensitive partial-text matching against each attribute's textual representation.
- **FR-004**: Search MUST apply **within** the active view's filter scope: results are always a subset of what the active view would show unsearched. The view's sort order and page size continue to apply to the searched results.
- **FR-005**: Each open view tab MUST hold its own search query for the duration of the visit. Switching tabs restores that tab's query and results; a newly opened tab starts with an empty query.
- **FR-006**: The search query MUST be transient: it is never stored in a view's saved configuration, never causes the view's unsaved-changes indicator, and does not survive a page reload.
- **FR-007**: When query text appears in a visible column's rendered content, that occurrence MUST be visually highlighted. Records matching only on hidden attributes MUST still appear in results, without a highlight.
- **FR-008**: The system MUST consolidate lookups during continuous typing (issuing far fewer lookups than keystrokes) while keeping the input itself responsive to every keystroke.
- **FR-009**: Displayed results MUST always correspond to the latest query text; a lookup for a superseded query must never overwrite newer results.
- **FR-010**: Clearing the query (or reducing it to whitespace) MUST restore the un-searched view immediately.
- **FR-011**: Result counts and pagination MUST reflect the searched result set; changing the query returns the table to the first page.
- **FR-012**: The search capability MUST be uniform across all entity tables — one shared behavior with no per-table variation, so any future entity table receives it by construction.
- **FR-013**: Query text MUST be matched literally; characters with special meaning in any matching syntax are treated as plain text.

### Key Entities

- **Search query**: The free text the user typed, held per open view tab for the current visit only. Not persisted, not part of any saved view, not represented in the page address.
- **Match**: The association between a result record and the attribute(s)/fragment(s) that satisfied the query — used to render highlights in visible columns.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who knows any attribute fragment of a record can surface it on a populated entity table in under 10 seconds, without opening the filter, sort, or column controls.
- **SC-002**: After the user pauses typing, updated results appear within 1 second on typical datasets (the current largest table, ~1,000 records).
- **SC-003**: Typing a query in one continuous burst performs lookups totalling no more than a small fraction of the keystroke count (e.g., a 10-keystroke burst results in 1–2 lookups, not 10).
- **SC-004**: 100% of textual query occurrences inside visible columns are highlighted in the rendered results; records matching only hidden attributes still appear.
- **SC-005**: With a view filter active, 100% of search results also satisfy the view's filter — no search ever returns a record the active view would exclude.
- **SC-006**: Searching, clearing, and switching tabs never display the unsaved-changes indicator and never alter any saved view's stored configuration.
- **SC-007**: The same search behavior is observable on every entity table page, verified by the same test exercised against each table.

## Assumptions

- "Fuzzy" is interpreted as case-insensitive **partial (substring) matching** on each attribute's textual representation — the union across attributes provides the forgiving feel the issue asks for. Typo-tolerance (edit-distance matching) is out of scope for this iteration.
- The whole trimmed query is matched as one contiguous fragment (typing `blue box` matches records containing "blue box", not records containing "blue" and "box" separately).
- "Switching to a different view should have a different search context" is read as: each open view tab retains its own query within the visit, consistent with the product's per-visit tab model (views feature, round 5).
- Because the search is transient and per-visit, it is intentionally excluded from the page address; the established invariant that the address reflects exactly the active view's overrides is unchanged by this feature.
- All current entity tables (finance currencies, accounts, exchange rates; inventory catalog, scenarios) receive the search; the uniform pattern extends automatically to future entity tables.
- Numeric, date, and other non-text attributes participate through a sensible textual form; exact formatting equivalences (e.g., whether "1,000" matches 1000) follow the simplest literal interpretation of the stored textual representation.
- Records per table are in the hundreds-to-low-thousands range today; the 1-second responsiveness target (SC-002) is set against that scale.
