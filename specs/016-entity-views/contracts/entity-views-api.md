# API Contract: Entity Views

**Base path**: `/api/v1/core/entity-views/`
**Auth**: Session (Django) — all endpoints require an authenticated user; every queryset is owner-scoped (`owner = request.user`). Another user's view id → **404** (not 403 — existence is not leaked).
**Pagination**: none (plain JSON array on list) — collections are small by design.
**Schema**: served live by drf-spectacular at `/api/schema/`; regenerate frontend types with `pnpm generate-types` after backend changes.

## Resource shape

```json
{
  "id": "Vx3kQ9aB2cD1",
  "table_key": "inventory-catalog",
  "name": "This year electronics",
  "config": {
    "filters": [{ "logic": "and", "conditions": [{ "attr": "obtained_at", "op": "gte", "val": "2026-01-01" }] }],
    "sort": [{ "field": "acquisition__obtained_at", "direction": "desc", "nulls": "first" }],
    "columns": [{ "key": "name", "visible": true, "order": 0, "pin": "left" }],
    "pageSize": 50
  },
  "pinned": true,
  "position": 0,
  "is_default": false,
  "created_at": "2026-07-20T09:00:00Z",
  "updated_at": "2026-07-20T09:00:00Z"
}
```

`owner` is never serialized in or out.

**Round 2 (2026-07-23)**: `config` is ViewConfig **v2** (per-column `pin`, no `stickyLeft`/`stickyRight` — migration 0006 rewrites stored rows). New `is_default` field: write-once on create (the frontend materializes the virtual default tab with `is_default: true, pinned: true`); at most one per (owner, table_key) (partial unique constraint → 400 on a second); PATCH attempting to change it → 400; DELETE on an `is_default` row → 400 (guaranteed-fallback invariant, FR-003).

## Endpoints

### `GET /api/v1/core/entity-views/?table_key=<key>`

List the caller's views. `table_key` filter optional (omitted → all tables, used by nothing today but harmless). Ordered by `position`, then `created_at`.

- **200** → `[EntityView, …]`
- **403** → unauthenticated (DRF session default)

### `POST /api/v1/core/entity-views/`

Create. Body: `{table_key, name, config, pinned?, position?}`. `owner` stamped server-side. Omitted `position` → appended after the caller's current max for that `table_key`.

- **201** → created resource
- **400** → missing/blank `name` or `table_key`; `config` not a JSON object; duplicate `(owner, table_key, name)` → `{"name": ["A view with this name already exists."]}` (message key stable for frontend mapping)

### `PATCH /api/v1/core/entity-views/{id}/`

Partial update: `name`, `config`, `pinned`, `position`, `is_default`. `table_key` immutable → **400** if present with a different value.

**`is_default` (round 3 — transferable role, FR-026)**: `{"is_default": true}` promotes this view to the table's default. The server performs the swap in one `transaction.atomic()`: the incumbent default for the same `(owner, table_key)` is cleared **first**, then this row is saved with `is_default=true` **and `pinned=true`**. The demoted row keeps its `pinned`, `position`, `name`, and `config` unchanged. `{"is_default": false}` on the current holder is rejected — a table must always have exactly one default. Promoting a view that already holds the role is a no-op 200.

- **200** → updated resource (re-fetch the table's list to observe the demotion)
- **400** → validation (rename collision; `{"is_default": ["The default view cannot be unset; set another view as default instead."]}`)
- **404** → not found / not owner

### `DELETE /api/v1/core/entity-views/{id}/`

- **204** → deleted
- **400** → the view currently holding the default role (undeletable — the guard follows the role, so a demoted view becomes deletable immediately)
- **404** → not found / not owner

### `POST /api/v1/core/entity-views/reorder/`

Bulk position rewrite for one table. Two callers as of round 3: the manage-modal Save **and** a tab drag-and-drop in the view row (FR-027). Body:

```json
{ "table_key": "inventory-catalog", "ids": ["idA", "idB", "idC"] }
```

Sets `position = index` for each id, in order. All ids MUST exist, belong to the caller, and have the given `table_key`.

Callers MUST send the table's **complete** id order — for a tab drag that means the strip's saved views in their new left-to-right order followed by the table's remaining views in their current relative order. Sending a partial list leaves the omitted views at stale positions and desynchronizes the strip from the manage modal. Anonymous (unsaved) tabs contribute no id.

The view holding the default role carries no positional privilege: it may appear at any index.

- **200** → `[EntityView, …]` (the table's views, new order)
- **400** → unknown/foreign id in list, id of another table, duplicate ids, or missing fields

## data_io / git-sync contract (round 2 — FR-024, R20)

`core.entityview` is registered with the data_io registry using the new `TableDescriptor.owner_field="owner"` capability:

- **Export / publish**: the owner column appears in NO CSV, NO diff, NO headers. Exported columns: `id`, `table_key`, `name`, `config` (JSON), `pinned`, `position`, `is_default`, timestamps. All rows export (single-user deployment assumption).
- **Import / checkout**: `owner` is stamped with the **acting user**, threaded as `acting_user` through `apply_diff` / `import_from_clone` / `apply_selected` from `ImportConfirmView`, `ImportZipConfirmView`, `ImportBatchPreviewView` (confirm path), and `SyncCheckoutConfirmView` (`request.user`). Importing an `owner_field` table without an acting user is an explicit error.
- **Round trip** (SC-008): publish → checkout (or export → import) preserves id, name, table_key, config, pinned, position, is_default for every view; owner integer PKs can never produce phantom diffs because they are never serialized.

## Test contract (pytest-django, TDD — write first)

`backend/tests/test_entity_views.py`, fixtures per existing `auth_client` recipe (`force_login`):

1. `test_list_requires_auth` — anonymous → 403.
2. `test_create_and_list_scoped_by_table_key` — create 2 keys, list filters correctly.
3. `test_owner_scoping` — user B cannot list/GET/PATCH/DELETE user A's view (404 / empty list).
4. `test_create_missing_name` — 400.
5. `test_create_duplicate_name_same_table` — 400; same name on a DIFFERENT table_key → 201.
6. `test_config_must_be_object` — `config: "str"` / `[]` → 400; arbitrary nested object → 201 (forgiving deep shape).
7. `test_patch_rename_pin_position` — 200; rename collision → 400; `table_key` change attempt → 400.
8. `test_delete` — 204, then 404.
9. `test_reorder_happy_path` — positions rewritten to list order.
10. `test_reorder_rejects_foreign_or_mixed_ids` — 400.
11. `test_position_appended_on_create` — omitted position lands after max.

Round 2 additions (write first, red before green):

12. `test_create_default_view` — `is_default: true` → 201; second default same (owner, table_key) → 400; different table → 201.
13. ~~`test_patch_cannot_change_is_default`~~ — **superseded in round 3 by `TestDefaultTransfer` below**.
14. `test_delete_default_view_rejected` — 400; non-default sibling still deletes → 204.
15. `test_config_migration_sticky_to_pins` — migration 0006 rewrites `stickyLeft/Right` into per-column `pin` (first/last visible), removes the old keys.

Round 3 additions — `TestDefaultTransfer` (write first, red before green):

20. `test_promote_transfers_role` — PATCH `{is_default: true}` on view B while A holds it → 200; re-list shows exactly one default (B), A demoted.
21. `test_promote_forces_pinned` — B unpinned before promotion → pinned `true` after.
22. `test_demoted_view_keeps_pin_position_and_config` — A's `pinned`, `position`, `name`, `config` byte-identical after being demoted.
23. `test_promote_does_not_reorder` — `position` of A and B unchanged by the transfer (SC-011).
24. `test_cannot_unset_default` — PATCH `{is_default: false}` on the holder → 400, still exactly one default.
25. `test_promote_when_no_default_exists` — no materialized default (virtual page default) → PATCH `{is_default: true}` → 200, nothing demoted.
26. `test_promote_is_idempotent` — PATCH `{is_default: true}` on the current holder → 200, still exactly one default.
27. `test_delete_guard_follows_the_role` — after transfer, the demoted view DELETEs 204 and the promoted one 400s.
28. `test_transfer_is_atomic_under_constraint` — the partial unique constraint is never violated mid-swap (single request, wrapped assertion on `IntegrityError` absence).
29. `test_sync_round_trip_preserves_default_role` (in `test_entity_views_io.py`) — publish → wipe → checkout restores which view holds `is_default` (SC-008).

`backend/tests/test_entity_views_io.py` (NEW):

16. `test_export_excludes_owner_column` — CSV headers contain no owner; all fields above present.
17. `test_import_stamps_acting_user` — imported rows land with `owner == acting user`.
18. `test_import_without_acting_user_errors` — `owner_field` table + no acting user → explicit error.
19. `test_sync_round_trip_preserves_views` — publish → wipe → checkout on the `bare_repo` fixture restores views verbatim for the acting user (SC-008); second publish after checkout shows ZERO diffs (no phantom owner diffs).
