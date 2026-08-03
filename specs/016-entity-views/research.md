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

---

# Round 2 Research (2026-07-23)

Round 2 decisions per the spec's Clarifications Session 2026-07-23. Backend registry facts below come from a fresh code exploration of `data_io/registry.py`, `csv_exporter.py`, `csv_importer.py`, `change_preview.py`, `sync/views.py`, `apply_helper.py`, `publish_helper.py`.

## R14. "Tabular" → "Table" + page-provided default-view names

**Decision**: The generic default-tab label key (`common.entityViews.*` default-tab entry) changes to "Table" (zh-TW 「表格」). `useEntityTable`/`useEntityViews` accept a new optional `defaultViewName?: string`; the catalog page passes the literal `'YTD'` (same string both locales — it names the seeded year-to-date filter and is view data, not UI chrome). While the default view is virtual, the displayed name is the page-provided literal or the localized generic label; whatever is displayed at materialization time is stored verbatim and is thereafter user data.

**Alternatives considered**: localizing "YTD" per locale (rejected — view names are user data; the user explicitly named it "YTD"); keeping "Tabular" as a stored legacy alias (rejected — nothing stored referenced the old label; it was purely an i18n value).

## R15. Default view as a plain view — `is_default` materialization

**Decision**: `EntityView` gains `is_default = BooleanField(default=False)` with a partial unique constraint (`owner`, `table_key`, `WHERE is_default`). The default tab binds to the stored `is_default` view when one exists (name + config from the row); otherwise it renders virtually from page defaults (round-1 behavior). First save OR rename of the virtual default POSTs with `is_default: true, pinned: true`. Rules: `is_default` is create-only (PATCH rejects changes, like `table_key`); DELETE on an `is_default` row → 400 (frontend never offers it; backend guards the invariant); the default tab is ALWAYS the first tab and is excluded from manage-modal reordering (rename/pin stay enabled; drag handle and delete hidden on its row). Unpinning the default is allowed — the fallback guarantee comes from `is_default`, not from pin state.

**Rationale**: A flag beats name conventions (renamable) and beats keeping it virtual (rename/save must persist). Always-first + no-reorder keeps "guaranteed fallback" trivially true and avoids a position-backfill problem on materialization (append-position would jump the default to the end of the strip).

**Alternatives considered**: seeded per-user default rows for every table (rejected round 1, still rejected: creation-on-visit noise); a separate `DefaultViewOverride` model (rejected: two models for one concept); allowing reorder of the default (rejected: position materialization ambiguity, weak user value).

## R16. "+" button placement — after the last tab, always visible

**Decision**: `ViewTabs` reorders to `[scrollable tab strip][+][spacer][View]`. The "+" button is a flex sibling OUTSIDE the scrollable strip (`flex: 0 0 auto`), so when tabs overflow, the strip scrolls and "+" stays docked at its right edge; when tabs fit, the strip shrink-wraps (`flex: 0 1 auto`) and "+" sits flush after the last tab. The View control keeps `margin-left: auto` (fixed right edge).

**Alternatives considered**: "+" as the last element INSIDE the scrollable strip with `position: sticky; right: 0` (rejected: sticky-in-scroll paints over tab edges and needs background/shadow hacks); keeping "+" left (rejected: explicit user directive).

## R17. Double-click rename — inline input in the tab

**Decision**: Double-clicking a saved or default tab swaps its label for an inline AntD `Input` (autofocused, value preselected). Enter or blur commits; Esc cancels. Commit renames immediately (PATCH; or the materializing POST for a virtual default) — rename IS the save action, so the staged-mutations rule does not apply. On a 400 name collision the input stays open with error state + translated `message.error`. Double-clicking an ANONYMOUS tab opens the existing `SaveViewModal` (name-and-save, FR-014). During inline editing the tab's click/switch handlers suspend.

**Alternatives considered**: reusing `SaveViewModal` for all renames (rejected: heavier than needed for an in-place rename; the modal remains for name-and-save); commit-on-blur = cancel (rejected: blur-commit matches AntD editable-text conventions; Esc is the explicit cancel).

## R18. Readable URL grammar (replaces the packed `view[<tableKey>]` mini-format)

**Decision**: Discrete namespaced params `<tableKey>.<facet>`; full grammar in the rewritten [contracts/view-url-serialization.md](contracts/view-url-serialization.md). Facets: `view` (saved-view reference **by name** — readable, unique per table per account; also matches the page's default name while the default is virtual), repeatable `f` (one filter group per param: `and(...)`/`or(...)` with `attr op val` conditions, `;`-separated), `sort` (existing DRF ordering string), `cols` (visible keys in display order with `~left`/`~right` pin suffixes), `size`, `page`. No `view` param → inline state; with `view` → facets are overrides. A clean default tab emits NO params (clean URLs). Serialization writes minimal percent-encoding (custom emitter; only `& = % # +` and control chars escaped — browsers render `%20` as spaces in the address bar); parsing accepts any encoding via `URLSearchParams`. The round-1 `view[<tableKey>]` format is DROPPED (not parsed): it shipped 2026-07-22 on a personal hub — stale deep-links hit the FR-008 fallback with a notice, which is acceptable; carrying two grammars is not.

**Rationale**: Every facet is legible and hand-editable (`?inventory-catalog.view=YTD&inventory-catalog.size=100` reads itself), satisfying FR-022/SC-007. Name-based references are the single biggest readability win over nanoid ids; rename breaking an old bookmark degrades per FR-008. `sort` and `cols` reuse existing serializers/keys verbatim.

**Alternatives considered**: keeping ids alongside names (`view=YTD~Vx3kQ9aB` — rejected: defeats readability, two sources of truth); flat unnamespaced params for single-table pages (rejected: FR-007 requires namespacing; two grammars again); JSON filters param (rejected: URL-encoded JSON is exactly the unreadable blob the user rejected).

## R19. Per-column pins in ViewConfig v2 (+ stored-config migration)

**Decision**: `ViewConfig.columns[]` entries gain `pin?: 'left' | 'right'`; `stickyLeft`/`stickyRight` are REMOVED. Snapshot/load map 1:1 to `useColumnConfig`'s `ColumnDef.pin` — no projection, multi-pin layouts round-trip (closes the round-1 open decision recorded in memory/CLAUDE.md). Migration `core/0006` data-migrates every stored `EntityView.config`: `stickyLeft` → `pin: 'left'` on the first visible column (by `order`), `stickyRight` → `pin: 'right'` on the last visible, keys dropped. `normalizeConfig` additionally upgrades v1 shapes in memory (sessionStorage tabs from a pre-upgrade session).

## R20. data_io registration — `owner_field` stamping (deferral resolved)

**Decision**: `TableDescriptor` gains `owner_field: str | None = None`. Contract: the named model field is (a) NEVER exported — `auto_system_fields` excludes it, so it appears in no CSV, no diff, no headers; (b) on import/materialize, stamped with the **acting user**, threaded as a new `acting_user` parameter through `apply_diff`, `import_from_clone`, `apply_selected` from the endpoints that own a request (`ImportConfirmView`, `ImportZipConfirmView`, `SyncCheckoutConfirmView` → `request.user`). Registering a table with `owner_field` set makes importing it without an acting user an explicit error. `core/apps.py` replaces the deferral comment with the `core.entityview` registration (`owner_field="owner"`, `is_json` config column, `import_order` beside `core.attributedefinition`).

**Rationale**: Exploration confirmed the registry has NO per-field hooks and NO user context in the import chain; `use_natural_key` is contenttypes-hardwired in three sites (`csv_exporter.py:17`, `change_preview.py:17,178`). FR-024 says imported views attach to the importing account — so a username natural key is not just harder (generalizing three sites + cross-deployment username mismatches), it is WRONG per spec. Excluding owner from CSV also structurally eliminates phantom diffs (integer PKs differing across deployments — the exact class of bug from the 015 sync incident). Single-user assumption documented in spec: export writes all rows; multi-owner collisions on `(owner, table_key, name)` cannot occur in practice.

**Alternatives considered**: generalized FK natural keys (`auth.user` by username — rejected: contradicts FR-024, breaks when usernames differ, triples the touched surface); static `default_value` injection (rejected: registration-time constant cannot be "the requesting user"); a post-import signal fixing owners (rejected: hides the invariant, rows would transiently violate NOT NULL).

## R21. Auto-hidden view row — collapsed affordance in the same `viewBar` slot

**Decision**: `ViewTabs` renders one of two modes in the SAME PageTable `viewBar` slot. Collapsed mode — a single compact icon button, right-aligned (no full row), with a tooltip and the dirty dot when the hidden default tab is dirty; clicking sets `revealed: true` (persisted in the existing `unihub.views.<tableKey>` sessionStorage state). Expanded mode — the full tab row. Expanded is forced (affordance hidden) whenever: any non-default saved view exists, OR >1 tab is open, OR the URL addresses a non-default view state. Collapsed is the initial state otherwise; `revealed` keeps a manual reveal for the session. Closing the last extra tab while `revealed` is false returns to collapsed.

**Rationale**: Keeping both modes inside `viewBar` preserves Principle VII (PageTable owns structure; zero per-page markup). sessionStorage matches the spec's "manual reveal persists for the rest of the session" exactly. The dirty dot on the affordance preserves SC-005 while hidden.

**Alternatives considered**: a toolbar button next to Filter/Sort (rejected: toolbar content is page-owned — five pages would each wire it; the slot already exists); localStorage persistence (rejected: spec says session lifetime); auto-expanding on dirty (rejected: config edits are constant during normal browsing — noisy; the dot on the affordance covers visibility).

---

# Round 3 (Clarifications Session 2026-08-03)

## R22. Drag-to-reorder tabs — horizontal `SortableList` vs a second drag mechanism

**Decision**: Extend the shared `components/EntityToolbar/SortableList.tsx` with an additive `orientation?: 'vertical' | 'horizontal'` prop (default `'vertical'`, so every existing caller is untouched) that swaps `verticalListSortingStrategy` → `horizontalListSortingStrategy`, and render the tab strip through it. The whole tab is its own drag handle (`handleProps` spread on the tab element), with `PointerSensor` configured `activationConstraint: { distance: 5 }` so a plain click never starts a drag.

**Rationale**: dnd-kit is already the project's single drag mechanism (filter/sort/column panels, manage modal, inventory organize tree); a bespoke tab-drag would be a second one to maintain and would drift. `horizontalListSortingStrategy` is the library's supported answer for a row. The 5px activation distance is what makes directive 2 (drag) and directive 3 (click opens a menu) coexist: below the threshold dnd-kit never activates, so `onClick` fires normally; above it, dnd-kit suppresses the click that terminates a drag (behaviour already relied on in the inventory organize e2e).

**Alternatives considered**: HTML5 drag events (rejected: the inventory organize page migrated *away* from them in iteration 18 — no keyboard support, jumpy previews); a dedicated `<Tabs>` from AntD with `items` + drag wrapper (rejected: AntD Tabs owns its own overflow/more-menu behaviour, which fights FR-020's hidden-scrollbar-with-shadows requirement and the docked kebab); duplicating dnd-kit setup inside `ViewTabs` (rejected: the shared component already encapsulates sensors, keyboard coordinates, and no-op-drop suppression).

**Right-click safety**: dnd-kit's pointer sensor ignores non-primary buttons, so a right-click (menu trigger) can never begin a drag.

## R23. Tab menu — controlled AntD `Dropdown` with asymmetric triggers

**Decision**: One `ViewTabMenu` component per tab, rendering a **controlled** AntD `Dropdown` (`open` + `onOpenChange` held in `ViewTabs`, one open menu at a time keyed by `tabId`). The tab element's own handlers decide when to open: `onClick` opens the menu **only when the tab is already active** (otherwise it calls `switchTab`), and `onContextMenu` (with `preventDefault()`) opens it for **any** tab, active or not. Menu body carries `maxHeight: '60vh', overflowY: 'auto'` (Principle VI) and `placement="bottomLeft"`.

**Rationale**: A controlled dropdown keeps the decision logic in one readable place and is directly testable in RTL (no reliance on rc-trigger's handler-merging when a sortable listener, an onClick, and a trigger all live on the same node). Asymmetric triggers are exactly the clarified grammar: a first left-click on an inactive tab must *switch* — opening its menu instead would make switching a two-step action.

**Enablement (disabled, never hidden — 015 kebab precedent)**: see the matrix in [data-model.md](data-model.md) §7. Rules: `Save` disabled while the tab is clean; `Close`/`Delete` disabled for the tab holding the default role; `Pin`/`Set as default`/`Delete` disabled for anonymous tabs (nothing stored yet); `Set as default` disabled for the tab that already holds the role; `Pin` disabled for the default holder (it is pinned as long as it holds the role, FR-003). `Delete` keeps its `Modal.confirm` danger gate.

**Alternatives considered**: uncontrolled `trigger={active ? ['click','contextMenu'] : ['contextMenu']}` (rejected: works, but re-mounting the trigger array on activation churns rc-trigger state and made "switch then immediately open" flaky in practice — the controlled form is deterministic); hiding inapplicable items (rejected: menu height would jump per tab kind, and the 015 review established that a disabled item communicates *why an action exists but is unavailable* better than an absent one).

## R24. Hidden scrollbar + edge shadows on the tab strip

**Decision**: The strip keeps `overflow-x: auto` but hides the bar cross-browser (`scrollbarWidth: 'none'`, `msOverflowStyle: 'none'`, `&::-webkit-scrollbar { display: none }`). Shadow state is derived from the strip's own metrics — `scrollLeft > 0` → left shadow, `scrollLeft + clientWidth < scrollWidth - 1` → right shadow — recomputed on `scroll`, on `ResizeObserver` of the strip, and whenever the tab list changes. The shadows are absolutely-positioned overlay elements (`data-testid="view-tabs-shadow-left|right"`, `pointer-events: none`, ~16px wide `linear-gradient` from `token.colorSplit`-derived rgba to transparent) inside a `position: relative` wrapper — **not** `background-attachment: local` gradients on the strip itself.

**Rationale**: Overlay elements are inspectable and assertable (a Playwright pixel probe can read their box + opacity; an RTL test can assert presence), whereas the `background-attachment: local` trick is invisible to both and cannot express AntD token colors cleanly. Deriving from `scrollLeft/clientWidth/scrollWidth` means the "both edges mid-scroll, one edge at each end" acceptance in SC-009 falls out of the arithmetic. Per the visual-geometry rule (memory), the shipped behaviour is locked with a real-browser probe, not a JSDOM style assertion.

**Alternatives considered**: `mask-image` fade on the strip (rejected: fades the tab text itself, not just a hint); AntD `Tabs` built-in overflow arrows (rejected with R22); keeping a thin styled scrollbar (rejected: the user explicitly asked for it hidden).

## R25. Transferable default role — atomic swap in the serializer

**Decision**: `is_default` becomes writable on update. `validate_is_default` now rejects only an explicit **`false`** on the current holder (that would leave the table with zero defaults — FR-026); promotion (`false → true`) is allowed. `EntityViewSerializer.update()` wraps the write in `transaction.atomic()` and, **before** saving, clears the incumbent: `EntityView.objects.filter(owner, table_key, is_default=True).exclude(pk=instance.pk).update(is_default=False)`. Promotion also forces `pinned=True` on the receiving row; the demoted row keeps its `pinned`/`position`/`config` verbatim.

**Rationale**: Clear-then-set is required because the partial `UniqueConstraint(owner, table_key, WHERE is_default)` is checked per statement (it is not `DEFERRABLE`); the transaction makes the two-statement window invisible to any reader. Doing it in `update()` rather than a bespoke `@action` keeps the contract to endpoints that already exist and are already in the generated schema (Principle IV) — the frontend just PATCHes `{is_default: true}`. Forcing `pinned=True` on promotion is what makes FR-003's "pinned as long as it holds the role" true without a second request; leaving the demoted row's pin alone matches the clarified answer (it *becomes* unpinnable, it is not auto-unpinned).

**Virtual-default edge**: when no materialized `is_default` row exists yet (the page default is still virtual) and the user promotes some other saved view, there is nothing to demote — the PATCH simply sets the flag. The open virtual-default tab then converts to an **anonymous** tab holding the same config, mirroring FR-019's convert-on-delete behaviour, because the page-default configuration no longer has a stored identity. Recorded as a spec edge case.

**Alternatives considered**: a dedicated `POST {id}/set-default/` action (rejected: a new endpoint for a single boolean the resource already exposes; PATCH keeps one write path); making the constraint `DEFERRABLE INITIALLY DEFERRED` and swapping in either order (rejected: needs a migration and hides ordering bugs behind commit-time checks); enforcing the swap in `Model.save()` (rejected: the ORM layer would silently mutate sibling rows on any import/data-migration write — including `data_io` restores, which must stay verbatim).

## R26. Persisting the dragged tab order

**Decision**: On drop, the frontend composes the table's **complete** id order — the saved views visible in the strip, in their new left-to-right order, followed by every other saved view of that table in its current relative order — and POSTs it to the existing `reorder/` action (`{table_key, ids}`). Anonymous tabs hold no id and are simply skipped when composing (their strip position is session state). No new endpoint, no schema change.

**Rationale**: `reorder/` rewrites `position` only for the ids it is given, so sending a partial list would leave non-open views interleaved at stale positions and break FR-017's "manage modal shows the same order". Sending the full list makes the persisted order a total order and keeps modal and strip in lockstep. The action already validates ownership, table membership, and duplicates.

**Alternatives considered**: sending only the visible ids (rejected: the interleaving bug above); a `position` PATCH per moved view (rejected: N requests and a non-atomic intermediate order); persisting the whole tab order including anonymous placeholders (rejected: anonymous tabs are explicitly session-scoped by spec).

## R27. Per-tab actions — generalizing the hook from "active" to "by tabId"

**Decision**: `useEntityViews` exposes tab-addressed actions: `saveTab(tabId)`, `duplicateTab(tabId, baseName)`, `pinTab(tabId, pinned)`, `setDefaultTab(tabId)`, `deleteTab(tabId)`, `renameTab(tabId, name)` (already tab-addressed), `closeTab(tabId)` (already), and `reorderTabs(orderedTabIds)`. The former `saveActiveTab`/`saveActiveTabAs`/`duplicateActiveTab` become thin wrappers over the active id where the modals still need them (`SaveViewModal` saves whichever tab requested a name).

**Rationale**: A right-click menu can target a tab that is not active, so every action must accept an explicit target; keeping "active" variants only would silently apply an action to the wrong tab — the worst possible failure for Delete. Each tab already carries its own `config`/baseline in state, so the generalization is mechanical.

**Deletion semantics**: `deleteTab` on a saved view runs the FR-019 path (tab stays open, converts to anonymous) whether it is invoked from the tab menu or the manage modal, so the two surfaces cannot diverge.

## R28. Default view is no longer first — ordering and manage-modal consequences

**Decision**: Drop the round-2 "default tab is ALWAYS first" invariant. Tab order for saved views comes purely from `position` (pinned merge in position order, session-opened views appended); the default holder sits wherever its `position` puts it. `ManageViewsModal` enables dragging the default row (delete stays blocked, rename/pin stay enabled), and the modal's staged reorder and the strip's drag both write through the same `reorder/` composition (R26). Setting a view as default changes no position (SC-011).

**Rationale**: The clarified answers make the default role orthogonal to ordering: "the default is draggable" and "set as default doesn't move the view". Keeping any always-first special case would contradict both and would make the strip and the modal disagree the moment a user dragged the default row.

**Consequence checked**: the FR-025 auto-hide heuristic is unaffected — it counts views/tabs and URL state, never positions.
