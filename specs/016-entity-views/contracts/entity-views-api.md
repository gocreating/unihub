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
    "columns": [{ "key": "name", "visible": true, "order": 0 }],
    "stickyLeft": true,
    "stickyRight": false,
    "pageSize": 50
  },
  "pinned": true,
  "position": 0,
  "created_at": "2026-07-20T09:00:00Z",
  "updated_at": "2026-07-20T09:00:00Z"
}
```

`owner` is never serialized in or out.

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

Partial update: `name`, `config`, `pinned`, `position`. `table_key` immutable → **400** if present with a different value.

- **200** → updated resource
- **400** → validation (incl. rename collision)
- **404** → not found / not owner

### `DELETE /api/v1/core/entity-views/{id}/`

- **204** → deleted
- **404** → not found / not owner

### `POST /api/v1/core/entity-views/reorder/`

Bulk position rewrite for one table (manage-modal Save). Body:

```json
{ "table_key": "inventory-catalog", "ids": ["idA", "idB", "idC"] }
```

Sets `position = index` for each id, in order. All ids MUST exist, belong to the caller, and have the given `table_key`.

- **200** → `[EntityView, …]` (the table's views, new order)
- **400** → unknown/foreign id in list, id of another table, duplicate ids, or missing fields

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
