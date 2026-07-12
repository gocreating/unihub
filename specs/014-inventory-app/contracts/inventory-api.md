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
    {"type": "discount", "value": "-100", "currency": "USD", "display_order": 0},
    {"type": "shipping", "value": "30",   "currency": "EUR", "display_order": 1}
  ]
}
```
- **201** → created `Acquisition` with nested `items`, `cost_factors`, and `net_cost` = `[{"currency":"USD","total":"5400.0000"}, {"currency":"EUR","total":"30.0000"}]`.
- **400** → validation: item missing `name`, **`items` empty** (≥1), or **`cost_factors` empty** (≥1). Whole request rolls back (transactional). Blank `source` allowed.

**Cost-factor rules (iteration 5):**
- `type` is a **free-form non-empty string** (built-ins accumulated/shipping/discount/tax_refund/paid_by_other/other are UI suggestions only).
- `display_order` (integer, optional) sets row order; if omitted the server assigns by array index (accumulated rows normalised to the front). Response `cost_factors` are returned in `display_order`.
- **`accumulated` is system-managed & per-currency**: the server derives one `accumulated` factor per distinct item `sku_price_currency` (`value` = Σ `sku_price × quantity` for that currency). If `cost_factors` is omitted, only these accumulated factors are created. A client MAY send additional non-accumulated factors.
- **400** if a client-sent factor has `type="accumulated"` (system-reserved), or if it would create a **second `accumulated` for the same currency** (unique per `(acquisition, currency)`).

### `GET /acquisitions/{id}/`
- **200** → `Acquisition` incl. `items`, `cost_factors`, `net_cost`. **404**.

### `PATCH /acquisitions/{id}/`
- Edit acquisition scalars, append new items, and **replace the cost-factor set** (`cost_factors` given ⇒ the acquisition's factors are set to that list, in the given `display_order`; must remain ≥1; the same accumulated per-currency + system-reserved rules apply). Existing items are edited/removed via item endpoints. Used by the standalone **edit page**.
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
- **Iteration 5**: `test_accumulated_one_per_item_currency` (items in USD+TWD → two accumulated factors), `test_client_cannot_create_accumulated_type` (400), `test_duplicate_accumulated_currency_rejected` (400), `test_cost_factor_type_accepts_free_text` (e.g. `"customs"`), `test_cost_factors_preserve_display_order` (round-trip order), `test_reset_accumulated_recomputes_from_items`.
- `test_acquisition_requires_at_least_one_item` (still enforced).
- `test_item_edit_via_acquisition_patch_persists` (regression guard for the edit bug at the API layer).
- Migration exercised by the test DB; quickstart covers the Postgres backfill (`cost → accumulated factor`, quantity → int).

## Iteration 13 delta (2026-07-12)

- `GET /api/v1/inventory/items/` (+ detail): the nested `acquisition` summary gains read-only **`net_cost: NetCostEntry[]`** — per-currency sum of the acquisition's cost-factor values, identical shape/semantics to the top-level `Acquisition.net_cost`. No other contract change; regenerated `src/generated/api-types.ts` accordingly.

## Iteration 14 delta (2026-07-12)

- **Item** (`GET/PATCH /api/v1/inventory/items/…`): concrete `color/size/length/width/height/weight/volume` fields REMOVED; new read field **`parameters[]`** (`{definition_id, name, data_type, unit_family, value, unit, value_number}`) and write field **`parameters[]`** (`{definition_id, value, unit?}`, full-list upsert-replace). Filter/sort on parameters via **`attr:<definition_id>`** keys in `filters`/`ordering` (nulls suffixes honoured).
- **core attribute-definitions**: `data_type` gains **`dimension`**; new **`unit_family`** (length|weight|volume, required for dimension). System definitions: rename/type change now 400. `attribute-values` rows carry **`value_unit`**/**`value_number`**; `bulk-upsert` accepts `unit`.
- **Scenario**: `notes` → **`description`**; progress fields (`prepared_count`, `outstanding_count`, `complete`) removed. `GET /scenarios/{id}/checklist/` REMOVED.
- **ScenarioItem**: `prepared`/`required_quantity` removed; **`display_order`** added (read-only). New **`POST /scenarios/{sid}/items/{id}/move/`** `{container_id, index}` → re-parents + rewrites dense sibling order (400 on cycle/self).
- **Constraints**: all `/scenarios/{sid}/constraints/…` endpoints REMOVED.

## Iteration 15 delta (2026-07-12)

- **List responses** (acquisitions + items): optional **`totals`** object over the FILTERED queryset — acquisitions list `{acquisitions, items}` (count + aggregate item total); items list `{acquisitions, items}` (distinct acquisition count + item count). Served by `EntityOffsetPagination` when the view defines `get_footer_totals`.
- **`import_legacy_csv`**: new `--wipe` option (delete all acquisitions before import); blank 實際支付價錢 no longer overrides the derived accumulated (FR-029a c).

## Iteration 16 delta (2026-07-12)

- **ScenarioItem** (list/detail/nested): new read field **`organized`** (boolean).
- **`POST /scenarios/{sid}/items/{id}/move/`**: body gains optional **`organized`** (boolean). `organized=true` (or omitted, legacy behaviour) — set `container_id`/`index` with dense reorder among ORGANIZED siblings; `organized=false` — unorganize: container forced to NULL, `container_id`/`index` ignored, the line's children re-parented to the organized top level. 400 on cycle/self unchanged.
- **`POST /scenarios/{sid}/items/`** (add membership): created lines default `organized=false`.
- No other endpoint changes; OpenAPI + `api-types.ts` regenerated.

## Iteration 18 delta (2026-07-12)

- **Item** (list/detail + nested acquisition items, read/write): new optional **`alias_name`** (string, blank default). Accepted on item create (within acquisition) and PATCH; returned everywhere the item serializes.
- **Item filter/order**: `alias_name` joins `filterable_fields` (text) and `ordering_fields`.
- No endpoint changes; OpenAPI + `api-types.ts` regenerated.
