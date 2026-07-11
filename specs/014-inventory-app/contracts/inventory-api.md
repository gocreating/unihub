# Phase 1 Contract: Inventory REST API — Iteration 4

**Feature**: 014-inventory-app | **Base path**: `/api/v1/inventory/` | **Auth**: session | **Date**: 2026-07-11

Updated for the post-`a7a0ea2` clarifications. Shared query params unchanged. Currency pickers read `GET /api/v1/finance/currencies/`.

---

## Items

Created only via `POST /acquisitions/`. `POST /items/` remains removed (405). No `item_type` field; `quantity` is an integer.

**Item shape (response)** — no item_type; integer quantity; derived total_price/status:
```json
{
  "id": "…", "name": "Camera",
  "quantity": 2,
  "spec": "", "remark": "", "size": "",
  "length": null, "width": null, "height": null,
  "weight": {"value": "0.66", "unit": "kg"}, "volume": {"value": "1.2", "unit": "L"},
  "sku_price": "2200.0000", "sku_price_currency": "USD",
  "total_price": "4400.0000",
  "color": "", "url": "",
  "status": "active", "deprecate_time": null,
  "acquisition": {"id": "…", "source": "B&H", "obtained_at": "…"},
  "created_at": "…", "updated_at": "…"
}
```

### `GET /items/`
Default ordering `-acquisition__obtained_at`. (The frontend Catalog page consumes acquisitions-with-nested-items; this flat item list remains available.)

### `PATCH /items/{id}/`
Edit item; Deprecate = `{"deprecate_time": "<ts>"}`, Restore = `{"deprecate_time": null}`. `status`/`total_price` read-only. **200**.

### `DELETE /items/{id}/` → **204**.

---

## Acquisitions (creation + cost factors)

### `GET /acquisitions/`
- **200** → paginated `Acquisition` list, each with nested `items`, `cost_factors`, `item_count`, and derived `net_cost` (per-currency list).

### `GET /acquisitions/sources/?q=` → distinct sources (unchanged).

### `POST /acquisitions/` — creates the acquisition, its items, AND its cost factors atomically
- Body:
```json
{
  "source": "B&H", "request_time": "2026-01-02T00:00:00Z", "obtained_at": "2026-01-04T00:00:00Z",
  "remark": "",
  "items": [
    {"name": "Camera", "quantity": 2, "sku_price": "2200", "sku_price_currency": "USD"},
    {"name": "Lens", "quantity": 1, "sku_price": "1100", "sku_price_currency": "USD"}
  ],
  "cost_factors": [
    {"type": "accumulated", "value": "5500", "currency": "USD"},
    {"type": "discount",    "value": "-100", "currency": "USD"},
    {"type": "shipping",    "value": "30",   "currency": "EUR"}
  ]
}
```
- **201** → created `Acquisition` with nested `items`, `cost_factors`, and `net_cost` = `[{"currency":"USD","total":"5400.0000"}, {"currency":"EUR","total":"30.0000"}]`.
- **400** → validation: item missing `name`, **`items` empty** (≥1), or **`cost_factors` empty** (≥1). Whole request rolls back (transactional). Blank `source` allowed.
- If `cost_factors` is omitted, the server auto-creates one `accumulated` factor with `value` = Σ item `total_price` (currency = items' common currency).

### `GET /acquisitions/{id}/`
- **200** → `Acquisition` incl. `items`, `cost_factors`, `net_cost`. **404**.

### `PATCH /acquisitions/{id}/`
- Edit acquisition scalars, append new items, and **replace the cost-factor set** (`cost_factors` given ⇒ the acquisition's factors are set to that list; must remain ≥1). Existing items are edited/removed via item endpoints. Used by the standalone **edit page**.
- **200**. **400** if it would leave 0 items or 0 cost factors.

### `DELETE /acquisitions/{id}/` → deletes the acquisition, its items, and its cost factors (**204**).

---

## Scenarios / Scenario items / Constraints

Unchanged **except** the checklist response **drops `shortfall`** — each line still carries `required_quantity`, `prepared`, `container`. `GET /scenarios/{id}/checklist/` returns `progress`, `lines` (no shortfall), `violations`.

---

## Contract test coverage (backend, test-first)

- `test_acquisition_cost_factors_net_cost_per_currency` (USD 5400 + EUR 30), `test_acquisition_requires_at_least_one_cost_factor`, `test_cost_factor_value_carries_sign` (negative reduces), `test_accumulated_defaults_to_item_total_sum`.
- `test_item_quantity_is_integer`, `test_item_has_no_item_type_field`.
- `test_checklist_has_no_shortfall` (line payload omits shortfall).
- `test_acquisition_requires_at_least_one_item` (still enforced).
- `test_item_edit_via_acquisition_patch_persists` (regression guard for the edit bug at the API layer).
- Migration exercised by the test DB; quickstart covers the Postgres backfill (`cost → accumulated factor`, quantity → int).
