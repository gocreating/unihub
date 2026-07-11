# Phase 1 Contract: Inventory REST API — Iteration 3

**Feature**: 014-inventory-app | **Base path**: `/api/v1/inventory/` | **Auth**: session | **Date**: 2026-07-11

Updated for the 2026-07-11 clarifications. Shared query params (pagination, `?filters=`, `?ordering=`) unchanged. `http_method_names` per viewset: `get, post, patch, delete, head, options` (Items has no `post`). Currency pickers still read `GET /api/v1/finance/currencies/` (finance domain).

---

## Items

Items are created only via `POST /acquisitions/`. `POST /items/` remains **removed** (405).

### `GET /items/`
Default ordering `-acquisition__obtained_at`. `deprecate_time` is filterable (no auto-exclusion).

**Item shape (response)** — sku_price + derived total_price, derived status, measurements `{value,unit}` incl. volume:
```json
{
  "id": "ab12cd34ef56",
  "name": "Sony A7 IV",
  "item_type": "stockable",
  "quantity": "1",
  "spec": "35MP full-frame\nSN: 12345",
  "remark": "",
  "length": {"value": "12.9", "unit": "cm"},
  "width":  {"value": "9.6",  "unit": "cm"},
  "height": {"value": "8.0",  "unit": "cm"},
  "weight": {"value": "0.658", "unit": "kg"},
  "volume": {"value": "1.2", "unit": "L"},
  "size": "",
  "sku_price": "2499.0000", "sku_price_currency": "USD",
  "total_price": "2499.0000",
  "color": "#1a1a1a", "url": "https://…",
  "status": "active",
  "deprecate_time": null,
  "acquisition": {"id": "…", "source": "B&H", "obtained_at": "…"},
  "created_at": "…", "updated_at": "…"
}
```
No `cost`, `cost_currency`, `model`, `serial_number`, or editable `status`.

### `PATCH /items/{id}/`
Edit item attributes. **Deprecate** = `PATCH {"deprecate_time": "<ts>"}`; **Restore** = `PATCH {"deprecate_time": null}`. `status` is read-only (derived). Sending a measurement `{value,unit}` recomputes the canonical.
- **200** → updated `Item`. **400** / **404**.

### `DELETE /items/{id}/`
- **204**.

---

## Acquisitions (creation entry point + payment)

### `GET /acquisitions/`
- **200** → paginated `Acquisition` list, each with `item_count` and derived `net_cost`.

### `GET /acquisitions/sources/?q=<substr>`  **(new)**
Distinct previously-used `source` values for the auto-complete.
- **200** → `["B&H", "Amazon", "Grandma", …]` (non-blank, deduped, capped ~20, filtered by `q` case-insensitively).

### `POST /acquisitions/`  — creates the acquisition AND its items atomically
- Body:
```json
{
  "source": "B&H",
  "request_time": "2026-01-02T00:00:00Z",
  "obtained_at": "2026-01-04T00:00:00Z",
  "remark": "",
  "cost": "3300", "cost_currency": "USD", "discount": "100", "tax_refund": "0",
  "items": [
    {"name": "Camera", "quantity": "1", "sku_price": "2200", "sku_price_currency": "USD",
     "weight": {"value": "0.66", "unit": "kg"}, "volume": {"value":"1.2","unit":"L"}},
    {"name": "Lens", "quantity": "1", "sku_price": "1100", "sku_price_currency": "USD"}
  ]
}
```
- **201** → created `Acquisition` with nested `items`, `item_count`, `net_cost` (= 3300 − 100 − 0 = `3200.0000`). **400** → validation: an item missing `name`, **or `items` empty** (≥1 required), rejects the whole request (transactional). A blank `source` is allowed (unknown origin). No `method` field.

### `GET /acquisitions/{id}/`
- **200** → `Acquisition` incl. `items: Item[]`, `item_count`, `net_cost`. **404**.

### `PATCH /acquisitions/{id}/`
- Edit acquisition fields (source, request_time, obtained_at, remark, cost, cost_currency, discount, tax_refund) and optionally append new `items` rows. Existing items are edited/removed via the item endpoints. Used by the standalone **edit page**.
- **200**. **400** if a change would leave 0 items.

### `DELETE /acquisitions/{id}/`
- Deletes the acquisition **and all its items** (composition). **204**.

---

## Scenarios / Scenario items / Constraints

**Unchanged** from iteration 2 (`GET|POST|PATCH|DELETE /scenarios/…`, `…/items/…`, `…/constraints/…`, `GET /scenarios/{id}/checklist/`). `required` constraint is item-set-only; `weight_limit` compares canonical grams.

---

## Contract test coverage (backend, test-first for changed behavior)

- `test_acquisition_cost_discount_tax_refund_net_cost` (net = cost − discount − tax_refund), `test_acquisition_requires_at_least_one_item` (empty items → 400), `test_acquisition_no_method_field`, `test_acquisition_request_time_persisted`.
- `test_sources_endpoint_returns_distinct_used_sources`, `test_sources_endpoint_filters_by_q`.
- `test_item_sku_price_and_total_price` (total = sku_price × quantity), `test_item_quantity_defaults_to_one`, `test_item_volume_roundtrip_units`.
- `test_deprecate_sets_status_deprecated` (PATCH deprecate_time → status "deprecated"), `test_restore_clears_deprecate_time` (→ "active"), `test_status_is_read_only` (PATCH status ignored/rejected).
- `test_item_has_no_model_serial_cost_fields`.
- Migration exercised by the test DB; a manual Postgres backfill check is in quickstart (item.cost → acquisition.cost).
