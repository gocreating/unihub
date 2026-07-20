# Data Model: Entity Views

**Feature**: 016-entity-views | **Date**: 2026-07-20

## 1. `EntityView` (backend, `core/models.py`)

Persisted saved view. One row per (owner, table, name).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | CharField(12), PK | nanoid via `core.nanoid.generate_id` | Same PK convention as `AttributeDefinition` |
| `owner` | FK → `auth.User` | `on_delete=CASCADE`, indexed | Views are personal (spec assumption) |
| `table_key` | CharField(100) | indexed, non-empty | Frontend table namespace, e.g. `inventory-catalog` |
| `name` | CharField(100) | non-empty | Display name; user-provided or duplicate-generated `X (1)` |
| `config` | JSONField | must be a JSON object | `ViewConfig` payload (below); deep shape owned by frontend |
| `pinned` | BooleanField | default `False` | Pinned views appear as tabs every session |
| `position` | IntegerField | default `0` | Display order among the owner's views for this table |
| `created_at` | DateTimeField | `auto_now_add` | |
| `updated_at` | DateTimeField | `auto_now` | |

**Constraints & meta**

- `UniqueConstraint(owner, table_key, name)` — duplicate name on save → DRF 400 (FR-016).
- Default ordering: `("position", "created_at")`.
- **data_io**: registered in `core/apps.py ready()` as `core.entityview` with `fk_content_type_label` override `owner → auth.user`; `import_order` after users/core basics. (If the registry cannot represent the `auth.user` FK, the gap MUST be recorded explicitly as deferred per Principle I — never silently omitted.)

**Validation rules (serializer)**

- `name`: required, 1–100 chars after strip.
- `table_key`: required, 1–100 chars; immutable after create (PATCH may not change it).
- `config`: required, must deserialize to a JSON **object** (dict). Deep validation is client-side by design (forgiving contract, mirrors `EntityFilterBackend`'s silent-skip of unknown attrs).
- `owner`: never client-writable; stamped from `request.user` on create; queryset always owner-filtered (cross-account access → 404).

## 2. `ViewConfig` (shared JSON payload — DB `config` column, frontend type)

```ts
interface ViewConfig {
  filters: FilterGroupPayload[];   // FilterPayload['groups'] — [{logic: 'and'|'or', conditions: [{attr, op, val}]}]
  sort: SortRule[];                // [{field: string, direction: 'asc'|'desc', nulls?: 'first'|'last'}]
  columns: ViewColumn[];           // full column list, hidden included
  stickyLeft: boolean;             // first visible column pinned left
  stickyRight: boolean;            // last visible column pinned right
  pageSize: number;                // one of ENTITY_PAGE_SIZE_OPTIONS (25|50|100)
}

interface ViewColumn {
  key: string;                     // column key, incl. dynamic `attr:<definitionId>`
  visible: boolean;
  order: number;                   // ascending display order
}
```

- **Never stored**: column labels/dataTypes (runtime, localized, async-patched), page position (transport-only), `flatMode` (derived from filters/sort on catalog).
- **Drift rule (FR-021)**: on hydration, unknown column keys are dropped, new runtime columns appended with default visibility; filters/sorts on unknown fields dropped client-side (backend already skips unknown attrs).

## 3. URL serialization (transport form of a view state)

Query param per table: `view[<tableKey>]=<inner>`; `<inner>` is an encoded `key=value&…` string.

| Inner key | Applies to | Value |
|-----------|-----------|-------|
| `type` | both | `inline` \| `saved` (required) |
| `id` | saved | EntityView id (required for `saved`) |
| `filters` | both* | JSON of `ViewConfig.filters` |
| `ordering` | both* | DRF-style string from `rulesToOrdering` (e.g. `-obtained_at__nullsfirst,name`) |
| `columns` | both* | comma-separated **visible** column keys in display order |
| `pin` | both* | `left` \| `right` \| `left,right` |
| `page_size` | both* | integer |
| `page` | both | 1-based page number (transport only, never persisted) |

\* For `type=saved` these are optional **overrides** layered onto the stored config; for `type=inline` absent keys mean "table default".

Note: `columns` transports visible keys only (compact URLs); hidden-column ordering is preserved only in stored `ViewConfig.columns`. Inline round-trip therefore reconstructs hidden columns from page defaults — acceptable per spec (URLs capture what the user sees).

## 4. `ViewTab` (frontend-only, sessionStorage `unihub.views.<tableKey>`)

```ts
interface ViewTab {
  tabId: string;                   // client nanoid
  kind: 'default' | 'saved' | 'anonymous';
  viewId?: string;                 // kind === 'saved'
  name: string;                    // display label ('Tabular' key for default; snapshot for saved incl. renames)
  config: ViewConfig;              // current effective config of this tab
  page: number;                    // transient page position
}

interface ViewTabsState {
  tabs: ViewTab[];                 // open order; pinned saved views merge in at load
  activeTabId: string;
}
```

**Derived, never stored**: `dirty` (normalized compare of `config` vs baseline — stored config for `saved`, page defaults for `default`; `anonymous` always renders unsaved marker).

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
  default (Tabular) ── never renamed/deleted; edits make it dirty-vs-defaults; Save-as creates a new saved view
  session end ── anonymous & unpinned tabs discarded; pinned views reappear next session
```

## 6. Relationships

- `EntityView.owner` → `auth.User` (N:1). No other DB relationships — `table_key` is a string namespace by design (frontend page identity, not a DB entity; tables are code, not data).
- `ViewTab.viewId` → `EntityView.id` (client-side reference; dangling reference after delete resolves to anonymous per FR-019, or Tabular fallback on URL load per FR-008).
