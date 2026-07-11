# Phase 1 Contract: Inventory REST API (Refinement Iteration)

**Feature**: 014-inventory-app | **Base path**: `/api/v1/inventory/` | **Auth**: session, single user | **Date**: 2026-07-11

Updated for the 2026-07-11 clarifications. Shared query params (pagination `?limit=&offset=`, `?filters=<json>`, `?ordering=`) unchanged. `http_method_names` per viewset: `get, post, patch, delete, head, options`. OpenAPI (drf-spectacular) remains the source of truth for frontend types.

Cross-domain note: the frontend currency picker reads `GET /api/v1/finance/currencies/` (finance domain). Inventory endpoints only store/return currency **code strings**.

---

## Items

Items are **not created directly** — creation happens via `POST /acquisitions/` (see below). `POST /items/` is **removed**.

### `GET /items/`
List items. Default ordering `-acquisition__obtained_at`. `archived_at` is a filterable attribute (no `?archived` toggle; no implicit exclusion).
- **200** → paginated `Item` list.

**Item shape (response)** — measurements as `{value, unit}`, money with currency:
```json
{
  "id": "ab12cd34ef56",
  "name": "Sony A7 IV",
  "item_type": "stockable",
  "model": "ILCE-7M4", "serial_number": "SN123",
  "spec": "35MP full-frame\n4K60", "remark": "gift from Dad",
  "quantity": null,
  "length": {"value": "12.9", "unit": "cm"},
  "width":  {"value": "9.6",  "unit": "cm"},
  "height": {"value": "8.0",  "unit": "cm"},
  "size": "",
  "weight": {"value": "0.658", "unit": "kg"},
  "price": "2499.0000", "price_currency": "USD",
  "cost":  "2200.0000", "cost_currency": "USD",
  "color": "#1a1a1a", "url": "https://…",
  "status": "active",
  "acquisition": {"id": "…", "source": "B&H", "method": "purchase", "obtained_at": "…"},
  "archived_at": null,
  "created_at": "…", "updated_at": "…"
}
```

### `GET /items/{id}/`
- **200** → `Item`. **404**.

### `PATCH /items/{id}/`
Edit item attributes (incl. `quantity`, unit/currency changes, archive via `archived_at`). Sending a measurement `{value, unit}` recomputes the stored canonical.
- **200** → updated `Item`. **400** (validation) / **404**.

### `DELETE /items/{id}/`
Delete a single item from its acquisition.
- **204**. (Deleting the whole acquisition — below — removes all its items.)

---

## Acquisitions (creation entry point)

### `GET /acquisitions/`
- **200** → paginated `Acquisition` list, each with `item_count`, `total_item_cost` (list of `{currency, total}`).

### `POST /acquisitions/`  — creates the acquisition AND its items atomically
- Body:
```json
{
  "source": "B&H", "method": "purchase", "obtained_at": "2026-01-04T00:00:00Z", "remark": "",
  "items": [
    {"name": "Camera", "item_type": "stockable", "cost": "2200", "cost_currency": "USD",
     "weight": {"value": "0.658", "unit": "kg"}},
    {"name": "Lens", "item_type": "stockable", "cost": "1100", "cost_currency": "USD"}
  ]
}
```
- **201** → created `Acquisition` with nested `items`. **400** → validation (e.g. an item missing `name`); the whole request is rejected (transactional). An acquisition with blank `method`/`source` is allowed (unknown/pre-existing origin).

### `GET /acquisitions/{id}/`
- **200** → `Acquisition` incl. `items: Item[]`, `item_count`, `total_item_cost` (per-currency). **404**.

### `PATCH /acquisitions/{id}/`
- Edit acquisition fields; optionally `items` operations: add new item rows, and reference existing item ids to keep/remove. Removing an item id from the set deletes that item (it cannot exist unattached).
- **200** → updated `Acquisition`.

### `DELETE /acquisitions/{id}/`
- Deletes the acquisition **and all its items** (composition). Frontend gates this with `Modal.confirm(okType:'danger')` stating the item count.
- **204**.

---

## Scenarios / Scenario items / Constraints

`GET|POST|PATCH|DELETE /scenarios/…`, `…/items/…`, `…/constraints/…`, and `GET /scenarios/{id}/checklist/` are **unchanged** from iteration 1 except:

- **Constraint** payload no longer accepts `target_category`. `required` validates on `item_ids` only (≥1).
  ```json
  { "constraint_type": "required", "item_ids": ["it1…"] }   // 201
  { "constraint_type": "required" }                          // 400 (needs ≥1 item)
  ```
- **Checklist `violations`** for `required` reference only the item set (no category message).
- **weight_limit** compares the sum of selected items' canonical weight (grams) against `limit_value`.

Checklist response shape (progress, lines, violations) is otherwise unchanged.

---

## Contract test coverage (backend, test-first for changed behavior)

New/updated `pytest-django` cases:
- `test_create_acquisition_with_multiple_items_atomic`, `test_create_acquisition_item_missing_name_rolls_back`, `test_item_requires_acquisition` (no standalone create path), `test_delete_acquisition_cascades_items`.
- `test_item_measurement_roundtrip_units` (enter cm → stored mm → read back cm), `test_sort_items_by_weight_across_units` (kg vs g compare correctly), `test_item_price_cost_currency_persisted`.
- `test_acquisition_total_cost_grouped_by_currency`.
- `test_items_default_sorted_by_acquisition_obtained_at_desc`, `test_archived_is_filterable_not_excluded_by_default`.
- `test_item_status_rejects_unknown_value` (only active/deprecated).
- `test_required_constraint_item_set_only` (no target_category), `test_required_needs_at_least_one_item`.
