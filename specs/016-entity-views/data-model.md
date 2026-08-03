# Data Model: Entity Views

**Feature**: 016-entity-views | **Date**: 2026-07-20 | **Updated**: 2026-08-04 (round 4)

## 1. `EntityView` (backend, `core/models.py`)

Persisted saved view. One row per view; identity is the id alone (round 4 — names repeat freely).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | CharField(12), PK | nanoid via `core.nanoid.generate_id` | Same PK convention as `AttributeDefinition` |
| `owner` | FK → `auth.User` | `on_delete=CASCADE`, indexed | Views are personal (spec assumption); NEVER serialized (API or CSV) |
| `table_key` | CharField(100) | indexed, non-empty | Frontend table namespace, e.g. `inventory-catalog` |
| `name` | CharField(100) | non-empty after trim | Display LABEL — **round 4: not unique**, any number of views may share one; nothing keys off it |
| `config` | JSONField | must be a JSON object | `ViewConfig` payload (below); deep shape owned by frontend |
| `pinned` | BooleanField | default `False` | Pinned views appear as tabs every session |
| `position` | IntegerField | default `0` | Display order among the owner's views for this table |
| `is_default` | BooleanField | default `False` — **round 2 (migration 0006)** | The materialized default view; exactly ≤ 1 per (owner, table_key); undeletable. **Round 3**: no longer create-only — the role is transferable (see validation rules) |
| `created_at` | DateTimeField | `auto_now_add` | |
| `updated_at` | DateTimeField | `auto_now` | |

**Constraints & meta**

- ~~`UniqueConstraint(owner, table_key, name)`~~ — **REMOVED in round 4 (migration core/0007)**: names are labels, so duplicates are legal (FR-016). No field changes, so the data_io descriptor and export shape are untouched.
- **Round 2**: partial `UniqueConstraint(owner, table_key, condition=Q(is_default=True))` — at most one materialized default per table per account (FR-003).
- Default ordering: `("position", "created_at")`.
- **data_io (round 2 — deferral RESOLVED)**: registered in `core/apps.py ready()` as `core.entityview` with the new `TableDescriptor.owner_field="owner"` capability (R20): the owner column is EXCLUDED from CSV export/diff and stamped from the acting user (`request.user`) on import/checkout — FR-024. `config` exports as an `is_json` column. `import_order` beside `core.attributedefinition`.
- **Migration 0006** also data-migrates every stored `config`: `stickyLeft`/`stickyRight` → per-column `pin` entries (R19).

**Validation rules (serializer)**

- `name`: required, 1–100 chars after strip; leading/trailing whitespace is trimmed before storing; blank-after-trim → 400. Collisions are NOT checked (round 4).
- `table_key`: required, 1–100 chars; immutable after create (PATCH may not change it).
- `config`: required, must deserialize to a JSON **object** (dict). Deep validation is client-side by design (forgiving contract, mirrors `EntityFilterBackend`'s silent-skip of unknown attrs).
- `owner`: never client-writable; stamped from `request.user` on create; queryset always owner-filtered (cross-account access → 404).
- `is_default` (round 3 — **transferable role**, FR-026): writable on create **and** update. `PATCH {is_default: true}` promotes: inside one `transaction.atomic()` the incumbent default for the same (owner, table_key) is cleared **first** (`.exclude(pk=instance.pk).update(is_default=False)`), then the row is saved with `is_default=True` **and `pinned=True`** — clear-before-set is required because the partial unique constraint is checked per statement. The demoted row keeps its `pinned`, `position`, `name`, and `config` untouched (it becomes *unpinnable*, not unpinned). `PATCH {is_default: false}` on the current holder → 400 (would leave zero defaults). DELETE on the current holder → 400 (guaranteed-fallback invariant, unchanged — the guard follows the role, not a fixed row).
- `position` (round 3): written by the tab strip's drag-reorder through the bulk `reorder/` action. The client always sends the table's **complete** id order (visible tabs first in strip order, then the remaining views in their current relative order) so no view is stranded at a stale position. The default holder has no positional privilege — it is ordered by `position` like every other view, and promotion never rewrites positions (round 4, SC-011).

## 2. `ViewConfig` (shared JSON payload — DB `config` column, frontend type) — **v2 (round 2)**

```ts
interface ViewConfig {
  filters: FilterGroupPayload[];   // FilterPayload['groups'] — [{logic: 'and'|'or', conditions: [{attr, op, val}]}]
  sort: SortRule[];                // [{field: string, direction: 'asc'|'desc', nulls?: 'first'|'last'}]
  columns: ViewColumn[];           // full column list, hidden included
  pageSize: number;                // one of ENTITY_PAGE_SIZE_OPTIONS (25|50|100)
}

interface ViewColumn {
  key: string;                     // column key, incl. dynamic `attr:<definitionId>`
  visible: boolean;
  order: number;                   // ascending display order
  pin?: 'left' | 'right';          // v2 — per-column pin, mirrors ColumnDef.pin (any number per side)
}
```

**v1 → v2**: `stickyLeft`/`stickyRight` booleans are REMOVED. Migration 0006 rewrites stored rows (stickyLeft → `pin:'left'` on first visible by order; stickyRight → `pin:'right'` on last visible); `normalizeConfig` upgrades any v1 shape read at runtime (stale sessionStorage tabs).

- **Blank configuration (round 4, FR-011)** — what "Add empty view" produces, distinct from the page's default view config:

```ts
blankConfig(defaults) = {
  filters: [],                       // no conditions
  sort: [],                          // no rules
  columns: defaults.columns          // every column, declared (natural) order
    .slice().sort(byOrder)
    .map((c, i) => ({ key: c.key, visible: true, order: i })),  // no `pin`
  pageSize: defaults.pageSize,       // page default — "empty" has no meaning for page size
}
```

**Never stored**: column labels/dataTypes (runtime, localized, async-patched), page position (transport-only), `flatMode` (derived from filters/sort on catalog).
- **Drift rule (FR-021)**: on hydration, unknown column keys are dropped, new runtime columns appended with default visibility; filters/sorts on unknown fields dropped client-side (backend already skips unknown attrs).

## 3. URL serialization (transport form of a view state) — **v2 (round 2, readable grammar)**

The packed `view[<tableKey>]` mini-format is REPLACED by discrete namespaced params `<tableKey>.<facet>` (FR-022; full grammar + examples in [contracts/view-url-serialization.md](contracts/view-url-serialization.md)):

| Param | Applies to | Value |
|-------|-----------|-------|
| `<tableKey>.view` | saved ref | Saved-view **id** (round 4 — names are no longer unique, so only the id identifies a view; a tab with no stored view emits no `.view` and serializes inline) |
| `<tableKey>.f` | both* | ONE filter group per param, repeatable in group order: `and(attr op val; …)` / `or(…)` |
| `<tableKey>.sort` | both* | DRF-style string from `rulesToOrdering` (e.g. `-obtained_at__nullsfirst,name`) |
| `<tableKey>.cols` | both* | comma-separated **visible** column keys in display order, `~left`/`~right` pin suffix per key |
| `<tableKey>.size` | both* | page size integer |
| `<tableKey>.page` | both | 1-based page number (transport only, never persisted) |

\* With `.view` present these are optional **overrides** layered onto the stored config; without `.view` (inline) absent params mean "table default". A clean active default tab emits NO params.

Note: `cols` transports visible keys only (compact URLs); hidden-column ordering/pins are preserved only in stored `ViewConfig.columns`. Inline round-trip therefore reconstructs hidden columns from page defaults — acceptable per spec (URLs capture what the user sees).

## 4. `ViewTab` (frontend-only, sessionStorage `unihub.views.<tableKey>`)

```ts
interface ViewTab {
  tabId: string;                   // client nanoid
  kind: 'default' | 'saved' | 'anonymous'; // 'anonymous' = unsaved scratch tab
  viewId?: string;                 // kind === 'saved' | materialized 'default'
  name: string;                    // display LABEL — page defaultViewName / "Table" for the virtual
                                   // default, "New view" for a fresh scratch tab, the stored name
                                   // once saved. Never an identifier (round 4).
  config: ViewConfig;              // current effective config of this tab
  page: number;                    // transient page position
}

interface ViewTabsState {
  tabs: ViewTab[];                 // strip order (round 3: NO always-first default); pinned saved views merge in by `position`
  activeTabId: string;
  revealed: boolean;               // round 2 — manual view-row reveal (FR-025), session-scoped
}
```

**Derived, never stored**: `dirty` (normalized compare of `config` vs baseline — stored config for `saved`/materialized `default`, page defaults for virtual `default`; `anonymous` always renders unsaved marker); `collapsed` (view-row auto-hide: no non-default saved views AND 1 open tab AND no non-default URL state AND not `revealed` — unaffected by ordering).

**Round 3 ordering**: the strip order is the source of truth for a drag; on drop it is projected onto `position` for saved views (R26) and left as session state for anonymous tabs. The tab holding the default role sits wherever its `position` puts it and is freely draggable — in the strip and in the manage modal.

## 5. State transitions

```
                    kebab "Add empty view"        Save (NO prompt — stores
                    (blank config, "New view")     under the tab's label)
  (none) ────────────────────────────► unsaved ────────────────────────► saved (clean)
                                          ▲   duplicate (same name)      │ config edit / URL override
  saved (clean) ──────────────────────────┘                              ▼
       ▲                                                            saved (dirty)
       │  Save (persist config)                                          │
       └─────────────────────────────────────────────────────────────────┘

  saved (open in tab) ── view deleted (tab menu) ──► unsaved (same config, FR-019)
  default (virtual) ── edits make it dirty-vs-page-defaults; Save or rename ──► default (materialized,
       is_default=True row: renamable, savable — NEVER deletable; baseline = stored config)
  default (virtual) ── another saved view promoted ──► unsaved (same config; nothing to demote, R25)
  default (materialized) ── another saved view promoted ──► saved (ordinary: closable, deletable,
       unpinnable; keeps its pinned flag, position, name, and config)
  saved ── "Set as default" ──► default (materialized; forced pinned=True; position UNCHANGED)
  session end ── unsaved & unpinned tabs discarded; pinned views reappear next session; revealed flag resets
```

## 7. Tab menu enablement matrix (round 3, FR-023 — disabled, never hidden)

Rows are tab kinds; ✅ = enabled, ⛔ = rendered disabled.

| Action | anonymous | saved (clean) | saved (dirty) | default holder (virtual) | default holder (materialized) |
|--------|-----------|---------------|---------------|--------------------------|-------------------------------|
| Save | ✅ (stores under the tab label, no prompt) | ⛔ | ✅ | ✅ (materializes) | ✅ only when dirty |
| Close | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| Duplicate | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pin / Unpin | ⛔ | ✅ | ✅ | ⛔ | ⛔ (pinned while it holds the role) |
| Set as default | ⛔ (save first) | ✅ | ✅ | ⛔ (already default) | ⛔ (already default) |
| Rename | ✅ (relabels locally until Save) | ✅ | ✅ | ✅ (materializes) | ✅ |
| Delete | ⛔ | ✅ (danger confirm) | ✅ (danger confirm) | ⛔ | ⛔ |

Kebab menu (row right edge, FR-011/FR-012) — round 4 drops *Manage views…*: *Add empty view* (always ✅, creates a **blank**-config tab labelled "New view") · *Open ▸* listing saved views **not currently open as tabs** (⛔ single empty-state entry when none).

All menus close on outside click and on Esc (round 4, FR-023).

## 6. Relationships

- `EntityView.owner` → `auth.User` (N:1). No other DB relationships — `table_key` is a string namespace by design (frontend page identity, not a DB entity; tables are code, not data).
- `ViewTab.viewId` → `EntityView.id` (client-side reference; dangling reference after delete resolves to anonymous per FR-019, or Tabular fallback on URL load per FR-008).
