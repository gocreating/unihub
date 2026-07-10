# Phase 1 Contract: Inventory REST API

**Feature**: 014-inventory-app | **Base path**: `/api/v1/inventory/` | **Auth**: session (DRF `SessionAuthentication`), single user

All list endpoints support the shared query params from `core/`:
- Pagination: `EntityOffsetPagination` (`?limit=&offset=`), response `{ count, next, previous, results }`.
- Filtering: `?filters=<json>` parsed by `EntityFilterBackend` against each viewset's `filterable_fields` (unknown keys silently skipped; malformed JSON → 400).
- Ordering: `?ordering=<field>` / `-<field>` with optional `__nullsfirst` / `__nullslast` suffix (`NullsOrderingFilter`).

`http_method_names` per viewset: `get, post, patch, delete, head, options` (no `put` on collections). The generated OpenAPI schema (drf-spectacular) is the source of truth for frontend types (Principle IV); the tables below define the contract those schemas must satisfy.

---

## Items

### `GET /items/`
List active items (excludes `archived_at != null`). Add `?archived=true` to list archived instead.
- **200** → paginated `Item` list.

### `POST /items/`
Create an item.
- Body: `Item` (writable fields; `name` required, `item_type` defaults `stockable`).
- **201** → created `Item`. **400** → validation error (e.g. blank `name`, negative dimension).

### `GET /items/{id}/`
- **200** → `Item` (includes derived `acquisition` summary and `origin_known`). **404**.

### `PATCH /items/{id}/`
Partial update, incl. `quantity` change (FR-004) and archive via `archived_at`.
- **200** → updated `Item`. **400** / **404**.

### `DELETE /items/{id}/`
Guarded hard delete (R7).
- Without `?confirm=true`, when the item is referenced by an acquisition, a scenario, or used as a container: **400** → `{ reference_summary: { acquisitions, scenarios, containers }, message }`.
- With `?confirm=true` (or no references): **204**. Never deletes linked acquisitions/scenarios; detaches references.

**Item shape (response)**:
```json
{
  "id": "ab12cd34ef56",
  "name": "Sony A7 IV",
  "item_type": "stockable",
  "model": "ILCE-7M4", "serial_number": "SN123",
  "quantity": null,
  "length": 12.9, "width": 9.6, "height": 8.0, "size": "",
  "weight": 0.658, "price": 2499.0, "cost": 2200.0,
  "purchase_time": "2026-01-04T00:00:00Z",
  "storage_location": "Shelf B2", "status": "available",
  "acquisition": { "id": "...", "source": "B&H", "method": "purchase" },
  "origin_known": true,
  "archived_at": null,
  "created_at": "...", "updated_at": "..."
}
```
When `acquisition` is null, `origin_known` is `false` (FR-008 — unknown origin, not an error).

---

## Acquisitions

### `GET /acquisitions/`
- **200** → paginated `Acquisition` list, each with derived `item_count`, `total_item_cost`, `has_arrived`.

### `POST /acquisitions/`
- Body: `source?`, `method?`, `obtained_at?`, `arrived_at?`, `cost?`, `notes?`, `item_ids?: string[]` (links items — sets each `Item.acquisition`).
- **201** → created `Acquisition`. **400**.

### `GET /acquisitions/{id}/`
- **200** → `Acquisition` incl. `items: Item[]` and `total_item_cost`. **404**.

### `PATCH /acquisitions/{id}/`
- Body may include `item_ids` to replace the linked set; removing a link sets `Item.acquisition = null` (item preserved — FR-009).
- **200** → updated `Acquisition`.

### `DELETE /acquisitions/{id}/`
- **204** → acquisition removed; linked items' `acquisition` set to null (items preserved).

---

## Scenarios

### `GET /scenarios/`
- **200** → paginated `Scenario` list with derived counts (`item_count`, `prepared_count`, `outstanding_count`, `complete`, `violation_count`).

### `POST /scenarios/`  ·  `GET /scenarios/{id}/`  ·  `PATCH /scenarios/{id}/`  ·  `DELETE /scenarios/{id}/`
Standard CRUD (name required). Delete cascades `ScenarioItem`/`Constraint` rows only — never the underlying `Item`s (FR-009). Delete is confirmation-gated on the frontend (`Modal.confirm`, `okType: danger`).

### `GET /scenarios/{id}/checklist/`
**The composite planning endpoint** (R6). Returns everything the Scenario detail view needs in one call.
- **200**:
```json
{
  "scenario_id": "sc01...",
  "progress": { "prepared_count": 3, "outstanding_count": 2, "total": 5, "complete": false },
  "lines": [
    {
      "id": "si01...", "item": { "id": "...", "name": "Head torch", "item_type": "consumable" },
      "required_quantity": 2, "prepared": false,
      "container": { "id": "si09...", "item_name": "Backpack" },
      "shortfall": 1
    }
  ],
  "violations": [
    { "constraint_id": "cn01...", "type": "mutual_exclusive",
      "message": "More than one mutually-exclusive item selected",
      "offending_item_ids": ["it1...", "it2..."] },
    { "constraint_id": "cn02...", "type": "weight_limit",
      "message": "Total weight exceeds limit by 1.2",
      "overage": 1.2 }
  ]
}
```
- Empty scenario → `lines: []`, `progress.total: 0`, `violations: []` (edge case).

---

## Scenario items (checklist lines & containment)

### `GET /scenarios/{scenario_id}/items/`
- **200** → list of `ScenarioItem` for the scenario.

### `POST /scenarios/{scenario_id}/items/`
Add an item to the scenario.
- Body: `item_id` (required), `required_quantity?` (default 1), `container_id?`.
- **201** → `ScenarioItem`. **400** → duplicate (item already in scenario) / container in a different scenario.

### `PATCH /scenarios/{scenario_id}/items/{id}/`
Update a checklist line: toggle `prepared`, change `required_quantity`, or assign `container_id` (packing).
- **200** → updated `ScenarioItem`.
- **400** → cycle/self-reference on `container_id` (FR-016): `{ detail: "Container assignment would create a cycle." }`.

### `DELETE /scenarios/{scenario_id}/items/{id}/`
Remove the line from the scenario (item preserved in catalog).
- **204**. Any lines whose `container` pointed at this line are reset to top-level (`container = null`).

---

## Constraints

### `GET /scenarios/{scenario_id}/constraints/`
- **200** → list of `Constraint`.

### `POST /scenarios/{scenario_id}/constraints/`
- Body: `constraint_type` (required), `name?`, `item_ids?: string[]`, `target_category?`, `limit_value?`.
- **201** → `Constraint`. **400** → type-specific validation (e.g. `weight_limit` without `limit_value`; `mutual_exclusive` with < 2 items).

### `PATCH /scenarios/{scenario_id}/constraints/{id}/`  ·  `DELETE /scenarios/{scenario_id}/constraints/{id}/`
- Update / remove a constraint. **200** / **204**. Delete is confirmation-gated on the frontend.

---

## Error conventions

- Validation errors: **400** with DRF field-error shape `{ field: ["message"] }` or `{ detail: "..." }`. Messages are kept locale-neutral / generic so the frontend can translate (Principle VIII backend rule).
- Not found: **404** `{ detail: "Not found." }`.
- Delete reference gate: **400** with `reference_summary` payload (see Items DELETE).

## Contract test coverage (backend, test-first — Principle V)

Minimum `pytest-django` cases (happy + error path per endpoint):
- `test_create_item_missing_name_returns_400`, `test_create_item_negative_weight_returns_400`, `test_list_items_excludes_archived`, `test_archive_item_sets_archived_at`, `test_delete_item_with_references_requires_confirm`.
- `test_create_acquisition_links_items`, `test_delete_acquisition_preserves_items`, `test_acquisition_total_item_cost`.
- `test_add_scenario_item_duplicate_returns_400`, `test_toggle_prepared_updates_progress`, `test_checklist_reports_consumable_shortfall`.
- `test_set_container_rejects_cycle`, `test_set_container_cross_scenario_returns_400`.
- `test_mutual_exclusive_violation_flagged`, `test_required_constraint_unsatisfied_flagged`, `test_weight_limit_overage_reports_amount`, `test_all_constraints_satisfied_no_violations`.
