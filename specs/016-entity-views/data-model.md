# Data Model: Entity Views

**Feature**: 016-entity-views | **Date**: 2026-07-20 | **Updated**: 2026-07-23 (round 2)

## 1. `EntityView` (backend, `core/models.py`)

Persisted saved view. One row per (owner, table, name).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | CharField(12), PK | nanoid via `core.nanoid.generate_id` | Same PK convention as `AttributeDefinition` |
| `owner` | FK → `auth.User` | `on_delete=CASCADE`, indexed | Views are personal (spec assumption); NEVER serialized (API or CSV) |
| `table_key` | CharField(100) | indexed, non-empty | Frontend table namespace, e.g. `inventory-catalog` |
| `name` | CharField(100) | non-empty | Display name; user-provided or duplicate-generated `X (1)` |
| `config` | JSONField | must be a JSON object | `ViewConfig` payload (below); deep shape owned by frontend |
| `pinned` | BooleanField | default `False` | Pinned views appear as tabs every session |
| `position` | IntegerField | default `0` | Display order among the owner's views for this table |
| `is_default` | BooleanField | default `False` — **round 2 (migration 0006)** | The materialized default view; ≤ 1 per (owner, table_key); create-only; undeletable |
| `created_at` | DateTimeField | `auto_now_add` | |
| `updated_at` | DateTimeField | `auto_now` | |

**Constraints & meta**

- `UniqueConstraint(owner, table_key, name)` — duplicate name on save → DRF 400 (FR-016).
- **Round 2**: partial `UniqueConstraint(owner, table_key, condition=Q(is_default=True))` — at most one materialized default per table per account (FR-003).
- Default ordering: `("position", "created_at")`.
- **data_io (round 2 — deferral RESOLVED)**: registered in `core/apps.py ready()` as `core.entityview` with the new `TableDescriptor.owner_field="owner"` capability (R20): the owner column is EXCLUDED from CSV export/diff and stamped from the acting user (`request.user`) on import/checkout — FR-024. `config` exports as an `is_json` column. `import_order` beside `core.attributedefinition`.
- **Migration 0006** also data-migrates every stored `config`: `stickyLeft`/`stickyRight` → per-column `pin` entries (R19).

**Validation rules (serializer)**

- `name`: required, 1–100 chars after strip.
- `table_key`: required, 1–100 chars; immutable after create (PATCH may not change it).
- `config`: required, must deserialize to a JSON **object** (dict). Deep validation is client-side by design (forgiving contract, mirrors `EntityFilterBackend`'s silent-skip of unknown attrs).
- `owner`: never client-writable; stamped from `request.user` on create; queryset always owner-filtered (cross-account access → 404).
- `is_default` (round 2): writable on create only; PATCH attempting to change it → 400. DELETE on an `is_default` row → 400 (guaranteed-fallback invariant).

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

- **Never stored**: column labels/dataTypes (runtime, localized, async-patched), page position (transport-only), `flatMode` (derived from filters/sort on catalog).
- **Drift rule (FR-021)**: on hydration, unknown column keys are dropped, new runtime columns appended with default visibility; filters/sorts on unknown fields dropped client-side (backend already skips unknown attrs).

## 3. URL serialization (transport form of a view state) — **v2 (round 2, readable grammar)**

The packed `view[<tableKey>]` mini-format is REPLACED by discrete namespaced params `<tableKey>.<facet>` (FR-022; full grammar + examples in [contracts/view-url-serialization.md](contracts/view-url-serialization.md)):

| Param | Applies to | Value |
|-------|-----------|-------|
| `<tableKey>.view` | saved ref | Saved-view **name** (readable; unique per table per account; matches the page default name while the default is virtual) |
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
  kind: 'default' | 'saved' | 'anonymous';
  viewId?: string;                 // kind === 'saved' | materialized 'default'
  name: string;                    // display label (page defaultViewName or "Table" key for virtual default; stored name once materialized)
  config: ViewConfig;              // current effective config of this tab
  page: number;                    // transient page position
}

interface ViewTabsState {
  tabs: ViewTab[];                 // open order; default tab ALWAYS first; pinned saved views merge in at load
  activeTabId: string;
  revealed: boolean;               // round 2 — manual view-row reveal (FR-025), session-scoped
}
```

**Derived, never stored**: `dirty` (normalized compare of `config` vs baseline — stored config for `saved`/materialized `default`, page defaults for virtual `default`; `anonymous` always renders unsaved marker); `collapsed` (view-row auto-hide: no non-default saved views AND 1 open tab AND no non-default URL state AND not `revealed`).

## 5. State transitions

```
                          [+] button                Save (name prompt)
  (none) ────────────────────────────► anonymous ────────────────────► saved (clean)
                                          ▲   duplicate                  │ config edit / URL override
  saved (clean) ──────────────────────────┘                              ▼
       ▲                                                            saved (dirty)
       │  Save (persist config)                                          │
       └─────────────────────────────────────────────────────────────────┘

  saved (open in tab) ── view deleted in manage modal ──► anonymous (same config, FR-019)
  default (virtual) ── edits make it dirty-vs-page-defaults; Save or rename ──► default (materialized,
       is_default=True row: renamable, savable, pinnable — NEVER deletable; baseline = stored config)
  session end ── anonymous & unpinned tabs discarded; pinned views reappear next session; revealed flag resets
```

## 6. Relationships

- `EntityView.owner` → `auth.User` (N:1). No other DB relationships — `table_key` is a string namespace by design (frontend page identity, not a DB entity; tables are code, not data).
- `ViewTab.viewId` → `EntityView.id` (client-side reference; dangling reference after delete resolves to anonymous per FR-019, or Tabular fallback on URL load per FR-008).
