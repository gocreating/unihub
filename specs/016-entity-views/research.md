# Research: Entity Views

**Feature**: 016-entity-views | **Date**: 2026-07-20

No NEEDS CLARIFICATION markers remained in the Technical Context; research below records the concrete design decisions and the alternatives considered. Codebase facts come from a full exploration of the existing entity-operations infrastructure (008-entity-operations et al.).

## R1. Where saved views persist — backend `core/` app

**Decision**: New `EntityView` model in `apps/unihub/backend/core/` (alongside `AttributeDefinition`/`AttributeValue`), exposed via an owner-scoped DRF ViewSet at `/api/v1/core/entity-views/`.

**Rationale**: Issue #19 explicitly calls for database persistence ("inline in the URL or save in the database") and per-account pinning. `core/` is the established home for cross-domain entity infrastructure with concrete models and migrations (precedent: `AttributeDefinition`, migrations 0001–0004, nanoid PKs). Saved views must work identically for every domain's tables (uni-infra label), so no domain app may own them (Principle II).

**Alternatives considered**:
- *localStorage only* — rejected: no cross-device continuity, contradicts the issue's "save in the database", cannot back up via data_io.
- *`system/` app* — rejected: system app has no models today and is oriented at app metadata (version); core already owns cross-domain entity infrastructure.
- *New dedicated Django app* — rejected: overhead (INSTALLED_APPS, urls, data_io wiring) with no isolation benefit over `core/`, which this conceptually belongs to.

## R2. URL wire format — namespaced param with mini query-string value

**Decision**: One query param per table: `view[<tableKey>]=<inner>`, where `<inner>` is itself a URL-encoded `key=value&…` string. Keys: `type` (`inline`|`saved`), `id` (saved only), `filters` (JSON `FilterPayload.groups`), `ordering` (existing DRF-style string via `rulesToOrdering`, incl. `__nullsfirst/__nullslast`), `columns` (comma-separated visible column keys in display order), `pin` (`left`|`right`|`left,right`), `page_size` (int), `page` (1-based int, inline-transport only). For `type=saved`, any additional key overrides the stored config.

**Rationale**: Matches the exact sample formats in issue #19 (`view[namespace1]="type=inline&page=…"`, `view[namespace1]="type=saved&id=…&x=y"`). Hand-readable and hand-editable; namespacing supports multiple tables per page (FR-007). `ordering` and `filters` reuse serializers that already exist and round-trip (`rulesToOrdering`/`orderingToRules`, `groupsToPayload`/`payloadToGroups`) — zero new grammar for the two hardest sub-formats.

**Alternatives considered**:
- *Base64/LZ-compressed JSON blob* — rejected: opaque, not hand-editable, longer for typical configs, diverges from the issue's sample format.
- *Flat top-level params (`filters=…&ordering=…`)* — rejected: collides when a page hosts two tables; issue explicitly namespaces.
- *Path segments* — rejected: views are orthogonal to routes; query string is the natural carrier and works on every existing page without route changes.

## R3. Canonical `ViewConfig` shape (stored JSON and in-memory)

**Decision**:

```ts
interface ViewConfig {
  filters: FilterPayload['groups'];                    // flat condition groups (backend shape)
  sort: SortRule[];                                    // [{field, direction, nulls?}]
  columns: { key: string; visible: boolean; order: number }[];
  stickyLeft: boolean;
  stickyRight: boolean;
  pageSize: number;
}
```

Stored verbatim as `EntityView.config` (JSONField). Column labels/dataTypes are NOT stored (they are runtime concerns; labels can be async-patched and localized).

**Rationale**: Mirrors exactly the active state of the three hooks + page size, so `snapshot()` and `load()` are trivial. Storing the full column list (not just visible keys) preserves hidden-column ordering, matching `ColumnState` minus runtime fields. `sort` stores structured rules (not the DRF string) because JSON is the storage medium; the string form is only for URL/API transport.

**Alternatives considered**: storing the ordering string in DB (rejected: two sources of truth for one concept; structured JSON is queryable and validated); storing only visible column keys (rejected: loses hidden-column order and pin context on round-trip).

## R4. Session tabs & active-tab state — URL is truth for active view; sessionStorage for the open-tab set

**Decision**: The active tab's effective config is always serialized into `view[<tableKey>]` (replace-style URL updates on config change; push on tab switch so back/forward crosses tabs). The list of open tabs (ids of opened saved views + anonymous tab configs + active tab id) lives in `sessionStorage` under `unihub.views.<tableKey>` so tabs survive in-app navigation and reloads within the browser session but die with it (spec assumption). Pinned tabs derive from the fetched saved-view list (`pinned=true`, ordered by `position`).

**Rationale**: Spec US3 requires copy-URL-anytime fidelity and query-string-driven navigation — only continuous URL sync provides both. sessionStorage matches the "opened views in current session" lifetime exactly; localStorage would immortalize scratch tabs (contradicts spec edge case "session ends → anonymous tabs discarded").

**Alternatives considered**: React state only (rejected: tabs vanish on any route change); localStorage (rejected: wrong lifetime); backend persistence of open tabs (rejected: session concept is client-local; adds chatty writes).

## R5. The "Tabular" default view — virtual, client-side

**Decision**: The standard primary "Tabular" view is a virtual tab (id `__default__`), not a DB row. Its config is the page's existing defaults (`defaultFilterGroups`, `defaultSortRules`, `defaultSticky`, initial columns, `defaultPageSize`). It is always present as the first tab, cannot be renamed/deleted, and is treated as pinned.

**Rationale**: FR-003 requires it to always exist and be immutable — a construction guarantee beats a protected DB row (no seed migration per user per table, no delete-protection logic). The page-default seeding mechanism from iteration 17 already models exactly this config.

**Alternatives considered**: seeded per-user DB row (rejected: needs creation-on-first-visit logic per table, protection rules, and data_io noise for derivable data).

## R6. Hook integration — additive `load*()` setters + `useEntityViews` orchestrator

**Decision**: Each of `useEntityFilter`/`useEntitySort`/`useColumnConfig` gains a `load*(state)` function that sets BOTH `active` and `pending` (and, for sort, bumps `panelApplyCount` so the ProTable remount-key pattern fires). `useEntityTable` gains `snapshotConfig(): ViewConfig` and `loadConfig(config)` plus exposes `pageSize` state; the currently-unused `key` param becomes the `tableKey` namespace. A new `useEntityViews({ tableKey, table, defaultConfig })` hook owns: saved-view fetching (React Query), tab list (R4), active-tab resolution from URL, dirty computation, and all mutations.

**Rationale**: Keeps the apply-gate (Principle XII) intact — panels still gate on Apply; a view load is a distinct, whole-config operation semantically identical to the existing `reset()` (which also sets active directly). Layering means zero behavior change for pages that don't adopt views.

**Alternatives considered**: driving loads through pending+`apply()` (rejected: transiently flashes dirty panel state and double-renders); rewriting `useEntityTable` around a single config atom (rejected: high-risk refactor of five shipped pages for no user-visible gain).

## R7. Dirty detection — normalized deep-compare against the tab's baseline

**Decision**: A tab is dirty when `normalize(currentConfig) !== normalize(baselineConfig)`, where baseline = stored config (saved tabs) or the Tabular default (the `__default__` tab), and `normalize` sorts object keys, drops empty condition groups, and compares JSON strings. Anonymous tabs are inherently unsaved and always render the unsaved marker. URL overrides on `type=saved` produce dirty ≠ stored, satisfying spec US3-AC2.

**Rationale**: Same philosophy as the hooks' existing `isDirty` (JSON compare of pending vs active), lifted one level. Normalization prevents false-dirty from key ordering or empty groups.

## R8. Staged mutations in the manage modal

**Decision**: The Edit ("Manage views") modal stages rename/pin/unpin/reorder/delete locally; NOTHING hits the API until the modal's Save. On Save: deletions confirmed first via `Modal.confirm` (`okType: 'danger'`, ICU-plural count), then a `reorder` bulk action (ordered ids + pin flags + names diff) or per-item PATCH/DELETE calls execute; React Query cache invalidates once.

**Rationale**: Hard user rule (memory: "form edits never hit APIs before Save" — a real item was once lost to eager mutation). Constitution's delete-confirmation gate applies at the moment deletion is actually committed.

**Alternatives considered**: immediate per-toggle PATCH (rejected: violates the staged-mutation rule and spams the API), optimistic updates with rollback (rejected: complexity without need at this scale).

## R9. Page position handling

**Decision**: `page` participates only in inline URL transport (deep links land on the exact page). Saving a view never persists page position; loading a saved view resets to page 1 (offset 0). `page_size` IS part of the saved config.

**Rationale**: Spec assumption (documented); a saved "page 7" is meaningless once data changes; existing `useEntityTable` already resets offset on filter/sort changes.

## R10. Column drift resilience (FR-021)

**Decision**: On hydration (URL or saved config), the stored column list reconciles against the page's current `initialColumns` exactly like `useColumnConfig`'s existing `initialColumns` effect: unknown keys are dropped, missing keys are appended with their default visibility at the end, labels/dataTypes always come from runtime. Filters/sorts referencing unknown fields (incl. stale `attr:<id>`) are dropped client-side; the backend already silently skips unknown attrs (EntityFilterBackend) — same forgiving contract end-to-end.

## R11. Rollout surface

**Decision**: Infrastructure is generic; adoption lands on all five existing entity list pages (finance currencies/accounts/exchange-rates, inventory catalog/scenarios) with `tableKey`s: `finance-currencies`, `finance-accounts`, `finance-exchange-rates`, `inventory-catalog`, `inventory-scenarios`. The inventory catalog is the reference integration (richest config: dynamic `attr:` columns, default filter/sort/sticky/page-size, flat-mode switch).

**Rationale**: Wiring per page is small once `useEntityTable` carries the integration; shipping all five avoids a half-consistent UI across the hub. Catalog-specific note: `flatMode` derives from active filter/sort (item-level fields) and therefore needs no view-config field of its own.

## R12. Tab row placement — `PageTable` `viewBar` slot

**Decision**: `PageTable` gains an optional `viewBar?: ReactNode` prop rendered inside the white container between the title row and the toolbar row. Pages pass `<ViewTabs …/>`. The row layout is `[+]` (fixed left) · scrollable tab strip (`overflow-x: auto`, no wrap) · `[View]` (fixed right), per the issue mockup.

**Rationale**: Principle VII requires the white container/title/toolbar/table structure be rendered by `PageTable` only — a new sanctioned slot keeps that guarantee. AntD `Tabs` is NOT used for the strip (its ink-bar/overflow model fights the fixed-edge buttons and per-tab dirty dots); a light custom strip of AntD `Button`/`Tag`-styled tabs with `OverflowTooltip` on labels is simpler and fully controllable. Tab activation via real interactions remains keyboard/e2e-testable.

**Alternatives considered**: AntD `Tabs` with `tabBarExtraContent` (rejected: left extra content scrolls poorly, dirty-dot + editable labels awkward, overflow behavior replaces scrollbar with dropdown — spec demands horizontal scroll); rendering inside `headerTitle` (rejected: headerTitle is a horizontal slot in the toolbar row — stacking there distorts the toolbar layout PageTable owns).

## R13. Backend API shape

**Decision**: `EntityViewViewSet` (ModelViewSet, `http_method_names = get/post/patch/delete`), owner-scoped queryset (`filter(owner=request.user)`), `?table_key=` list filter, `pagination_class = None` (small collections), unique-name validation surfaced as DRF 400, and a `POST /entity-views/reorder/` action accepting `{table_key, ids: […]}` that rewrites `position` in bulk. `perform_create` stamps `owner=request.user`. Config is validated as a JSON object server-side (shape enforcement stays client-side — mirrors the forgiving `EntityFilterBackend` contract and keeps the schema evolvable).

**Rationale**: Matches the canonical `AccountViewSet` shape; owner scoping matches "views are personal" spec assumption; bulk reorder avoids N PATCHes from the staged modal.
