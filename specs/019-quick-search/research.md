# Research: Quick Search (019)

**Feature**: free-text quick search on all five entity tables, scoped inside the active view's filter.
**Date**: 2026-08-12. All decisions below were made against the current code on branch `019-quick-search` (post-016 round 13).

---

## R1 — Transport: one `search` query param on the existing list endpoints

**Decision**: Add a single optional `search=<free text>` query parameter to the existing entity list endpoints, applied server-side by a new filter backend that runs alongside `EntityFilterBackend`. DRF applies filter backends sequentially, so the search ANDs with the view's `filters` payload by construction — results are always a subset of the active view's scope (FR-004/SC-005), and pagination + `get_footer_totals` (computed over the filtered queryset in `EntityOffsetPagination.paginate_queryset`) reflect the searched set with zero extra work (FR-011).

**Rationale**: The issue asks for "an uniformed search endpoint" per entity; the uniform thing we already have per entity IS its list endpoint with declarative filtering. A search that must compose *inside* an arbitrary filter has to be server-side AND-composed.

**Alternatives considered**:
- *Frontend-synthesized OR-groups* (the existing scenarios Add-modal precedent at `pages/inventory/scenarios/detail.tsx:320-335`, which fakes union search with three single-condition groups): rejected — groups OR with each other, so a search group would OR with (i.e. escape) the view's filter instead of narrowing it. Exactly the failure FR-004 forbids.
- *Client-side filtering of loaded rows*: rejected — pagination is server-side; hidden pages would be unsearchable and counts wrong.
- *A dedicated `/search/` endpoint per entity*: rejected — duplicates ordering/pagination/serialization/permission machinery for no gain.

## R2 — Backend shape: `EntitySearchFilter` in `core/filters.py`, declarative opt-in

**Decision**: New `EntitySearchFilter(BaseFilterBackend)` in `apps/unihub/backend/core/filters.py` (constitution XII: cross-domain query capability lives in `core/`, viewsets opt in via declared attributes). Opt-in attributes on the view:

```python
searchable_fields: dict[str, str]   # ORM lookup path -> "text" | "cast"
search_attribute_values: bool       # opt-in union over dynamic AttributeValues (default False)
```

Behavior: read `request.query_params.get("search", "")`; strip; empty → return queryset unchanged (no-op, never 400 — same forgiving contract as unknown `attr` keys, `filters.py:139-140`). Non-empty → build one OR'd `Q` union across all declared fields (+ the AttributeValue `Exists` leg when enabled) and `.filter()` it. Views without `searchable_fields` ignore the param entirely.

**Rationale**: Mirrors `filterable_fields` — the established declarative pattern. A dict (not a bare list) lets each path carry its match strategy, because non-text columns cannot take `__icontains` directly (the documented iteration-17 hazard at `filters.py:244-246`).

**Alternatives**: DRF's built-in `SearchFilter`/`search_fields` — rejected: no support for casting non-text columns, no AttributeValue union, and its `^/=/@/$` prefix syntax conflicts with FR-013 literal matching.

## R3 — Non-text attributes match via `Cast(..., TextField())`; booleans and computed fields excluded

**Decision**: Fields declared `"cast"` are annotated `Cast(<path>, TextField())` and matched with `__icontains` on the annotation (PostgreSQL `::text`). This covers `ExchangeRate.rate`/`date` (an entity with *no* text columns at all), `Account.open_datetime`/`close_datetime`, `Item.quantity`/`sku_price`/`deprecate_time`. Trailing-zero decimals still substring-match ("31.05" ⊂ "31.05000000"). Excluded from search, recorded per entity in data-model.md:
- **Booleans** (`Currency.is_base_currency`, `Item.deprecated`): "true"/"false" text matching is noise, and the filter panel already handles them precisely.
- **Computed serializer fields** (`Item.status/total_price`, `Acquisition.item_count/net_cost`, `Scenario.item_count`): not queryset columns; `Item.parameters` is covered by the R4 AttributeValue leg instead.

**Rationale**: The spec's assumption ("numeric/date attributes participate through a sensible textual form … simplest literal interpretation of the stored textual representation") maps exactly to `::text`. Formatting-dependent matches (e.g. "1,000") are explicitly out of scope per spec.

## R4 — Dynamic parameters: one `Exists` subquery over `AttributeValue`, not `annotate_attribute`

**Decision**: When `search_attribute_values = True` (only `ItemViewSet` — the only view with `attribute_content_type`), add
`Exists(AttributeValue.objects.filter(content_type=<ct>, object_id=OuterRef("pk"), value__icontains=q))`
to the OR union. This matches ANY parameter of the row in one indexed subquery (`AttributeValue` has an index on `(content_type, object_id)`), giving union-across-all-definitions semantics.

**Rationale**: The existing `annotate_attribute` (`core/attributes.py:78`) surfaces ONE definition's value per row — right for per-attribute filters, wrong for "does any parameter contain q". Matching `value` (the canonical text, which for ranges holds e.g. "74~164") covers text, numeric and dimension parameters as displayed.

## R5 — Catalog multiplexing: an active search forces flat mode

**Decision**: The catalog page serves tree mode from `AcquisitionViewSet` and flat mode from `ItemViewSet`, switching on `flatMode` (`catalog/index.tsx:222-228`: any item-level sort/filter flattens). A non-empty search query joins that computation — searching always uses the flat `ItemViewSet`, whose search fields cover item text + cast fields + all dynamic parameters + `acquisition__source`/`acquisition__remark` (forward-FK joins — no row duplication, no `.distinct()` needed). `AcquisitionViewSet` and `ScenarioViewSet` still declare their own `searchable_fields` so every entity endpoint is uniformly searchable (FR-012), but the catalog page never issues a tree-mode search.

**Rationale**: "Flatten on item-level interaction" is the page's existing, user-visible rule since iteration 8 — search over item attributes is exactly such an interaction. The alternative (teach `AcquisitionViewSet` to search `items__*`) needs `.distinct()` against join duplication and produces ambiguous merged-row highlight semantics.

## R6 — Frontend state home: `useEntityTable` holds the live query; `InternalTab.search` holds the per-tab context; `ViewConfig` NEVER learns about search

**Decision**: `useEntityTable` gains `searchQuery` (immediate input value), `setSearchQuery`, and a debounced value that joins `queryParams` as `search: <trimmed> || undefined` (undefined, not `''` — the `buildEntityListQs` pass-through in both service files serializes any non-undefined value, so an empty string would emit `search=`). `snapshotConfig`/`loadConfig` are untouched. Per-tab context (FR-005): `InternalTab` (in `useViewTabsState.ts` — the hook that, per its round-13 header, persists nothing) gains `search?: string`; `useEntityViews.switchTab` snapshots the outgoing tab's query from the table and calls `table.setSearchQuery(target.search ?? '')`; every tab-creation site (`addBlankTab`, `duplicateTab`, the inbound `applyParsed`, pinned-merge) initializes it to `''`.

**Consequences, by construction**: search never enters `ViewConfig` → it is invisible to `normalizeConfig` (dirty compare), to `serialization.ts` FACETS (URL), and to `saveTab` payloads (server). FR-006/SC-006 and the 016 round-8 FR-033 invariant (dot ⟺ override params) hold without touching any of the five navigation guards in `useEntityViews` (L210-243) — which this feature must NOT modify. `resetTab` (Reset changes) intentionally leaves the search query alone: it restores *stored config*, and search is not config.

**Alternatives**: a field on `ViewConfig` — rejected outright (would poison URL/dirty/save paths, re-opening the round-6–10 defect class); page-level `useState` keyed by `activeTabId` — rejected: state would not survive the tab's own PageTable remount cycle cleanly and duplicates tab bookkeeping the views layer already owns.

## R7 — Debounce + stale-response safety: shared `useDebouncedValue`, React Query key isolation

**Decision**: New shared hook `useDebouncedValue<T>(value, delayMs = 300)` in `src/hooks/`; `useEntityTable` debounces the trimmed query at 300 ms before it reaches `queryParams`. Because every page's list query key already includes `table.queryParams`, the debounced query lands in the React Query key: responses for a superseded query resolve into a superseded cache slot and can never render as the current results (FR-009). Input keystrokes update local state immediately (responsive echo, FR-008); 10 keystrokes in one burst → 1 request (SC-003).

**Rationale**: Query-key isolation is the stale-response guard React Query already gives us — no request-cancellation bookkeeping needed. 300 ms is the conventional type-ahead debounce and satisfies SC-002's 1-second budget alongside the (sub-100 ms at ~1k rows) server time.

## R8 — Page reset on query change

**Decision**: The debounced search value joins the offset-reset effect deps in `useEntityTable` (`[filter.activeGroups, sort.activeRules]` today, L97-103) so a query edit returns the table to page 1 (FR-011). The existing `skipNextOffsetResetRef` mechanism is untouched — `loadConfig` does not set search, so a view load cannot spuriously reset via the search leg.

## R9 — Highlighting: context-provided query + a `SearchMark` leaf component; prop-threading only where `highlight` already exists

**Decision**: New `SearchHighlightContext` (provider wraps each page's `PageTable`, value = the debounced active query) and a leaf component `<SearchMark text={string} />` that reads the context and renders the existing `HighlightText` (`components/HighlightText/`, already case-insensitive `<mark>` wrapping). Column `render` functions use `<SearchMark>` for their text content — the memoized `colDefMap`s need NO new dependency, because the re-render flows through context to the leaf, not through new column objects. Where a component already accepts a `highlight` prop (`ItemDisplay`/`ItemName`), the catalog keeps prop-threading (passing the debounced query, added to that one `colDefMap` dep array) and `ParameterTag` gains the same `highlight?: string` prop it lacked. Non-textual renders (boolean `Switch`, action buttons) are not marked. Only visible columns render at all, so "highlight only in visible columns" (FR-007) is structural; rows matched solely on hidden attributes simply carry no mark.

**Per-column reach** (spec FR-007 "rendered content"): plain text cells, `Tag`-wrapped FK values (mark inside the tag), formatted prices, and the primary (absolute) row of two-row datetime cells. The relative-time secondary row is derived text, not attribute content — not marked.

**Alternatives**: threading the query through every `colDefMap` dep array (five hand-maintained arrays — the exact trap the report flags, and the catalog's iteration-48 `toggledIds` bug shows how such deps rot); post-render DOM walking — rejected as un-React and untestable.

## R10 — Toolbar layout: `searchProps` on `EntityToolbar`; PageTable's toolbar CSS relaxed to let it stretch

**Decision**: `EntityToolbar` gains optional `searchProps?: { value: string; onChange: (v: string) => void }`, rendered as an AntD `Input` (prefix `SearchOutlined`, `allowClear`, i18n placeholder `common.entityOps.searchPlaceholder`) placed AFTER the Columns dropdown inside the toolbar row, per the issue ("next to column dropdown … stretch to fill container's width"). To let it grow: the toolbar root becomes a full-width flex row (`Space` → flex container with the search wrapper `flex: 1 1 auto; min-width: 160px`), and `PageTable`'s own CSS (`index.tsx:61-72`) changes `.ant-pro-table-list-toolbar-left` from `flex: none !important` to `flex: 1 1 auto !important; min-width: 0` so `headerTitle` content can fill the row. All `headerTitle` consumers get a visual check (entity pages + sync/io previews) — buttons keep intrinsic width (`flex: 0 0 auto`), so pages without a search input are unaffected (left container growing changes nothing when its children don't stretch).

## R11 — No apply-gate for the search input (compliant, not a deviation)

**Decision**: Search is live-as-you-type (FR-002) with no Apply. Constitution XII's apply-gate governs *panels* (filter/sort/columns dropdowns with pending state); the search box is a direct-manipulation control in the same class as the permitted column-header sort click ("a direct one-tap action with immediately visible effect"). It also stays outside the panels' mutual-exclusion machinery (`EntityToolbar` L67-86): typing in search while a panel is dirty does not close or discard that panel. Constitution VII's "ProTable `search` prop MUST NOT be used" is honored — this is a custom control passed via `headerTitle`, exactly what that rule prescribes.

## R12 — OpenAPI schema + generated types

**Decision**: `EntitySearchFilter` implements `get_schema_operation_parameters()` so `search` appears on every opted-in list operation in the drf-spectacular schema. Regenerate `src/generated/api-types.ts` via the 018 precedent (`uv run python manage.py spectacular --file` → `openapi-typescript` on the file, no live server needed). Note the recon finding: `api-types.ts` is currently imported nowhere (all service types are hand-written — a pre-existing, recorded deviation); the regeneration keeps the contract artifact honest, while the runtime change is `search?: string` on the hand-written `EntityListParams` in `components/EntityToolbar/types.ts`, which both `buildEntityListQs` copies already pass through generically.

## R13 — Test strategy

**Decision (backend, TDD-first per constitution V)**: new `tests/test_entity_search.py` modeled on `test_entity_filter.py` (FakeView + APIRequestFactory unit tests, then per-viewset integration): blank/absent param no-op; case-insensitive substring; union across fields (match on field B only); AND-composition with a `filters` payload (the FR-004 core); cast matching on `ExchangeRate.rate`/`date`; AttributeValue match on items (a parameter-only match returns the row); literal `%`/`_` (FR-013 — Django escapes LIKE wildcards in `__icontains` values natively, the test locks it); view without `searchable_fields` ignores the param.

**Decision (frontend)**: vitest with fake timers for the debounce (`useDebouncedValue` unit suite; `useEntityTable` — param inclusion only when trimmed non-empty, offset reset, `snapshotConfig` never contains search); `useEntityViews` (per-tab query restore on `switchTab`, new tabs start empty, no dirty dot and no URL params from searching — asserted with the round-8 `expectIndicatorMatchesUrl` discipline of checking EMITTED PARAMS, not just the dot); `EntityToolbar` (input renders next to Columns, onChange wiring, clear button); page suites (currencies: mocked service asserts `search` in params + `<mark>` in visible cells; catalog: non-empty search forces the items endpoint). E2E `quick-search.spec.ts` (type → narrowed rows + marks, URL stays clean, tab-switch restores per-tab query, request-count probe for SC-003) — listed but, per this repo's standing rule, NOT run against the live stack without a human (real data).

## R14 — Scenario `description` becomes searchable but stays un-filterable

**Decision**: `ScenarioViewSet.searchable_fields` includes `name` and `description` ("all attributes"), although `filterable_fields` remains `name`-only. Search coverage and filter-panel coverage are independent declarations; widening the filter panel is out of scope.
