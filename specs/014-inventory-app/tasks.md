---
description: "Task list for Inventory App — Iteration 3 (2026-07-11)"
---

# Tasks: Inventory App — Iteration 3 (UI + cost model refinements)

**Input**: Design documents from `/specs/014-inventory-app/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/inventory-api.md](contracts/inventory-api.md)

**Baseline**: Iterations 1–2 shipped at commit `2fc0106` (all tests passing/live on Postgres). This iteration is a **delta**; tasks modify existing files unless marked "NEW". Backend behavior changes are **test-first** (Principle V). Constitution is **v1.14.0** (new page/modal button rules).

**Organization**: Grouped by the affected user stories. US2 (acquisition form: cost, cards, edit) and US1 (item fields + list) are co-critical P1.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: different files, no dependency on an incomplete task
- Backend: `apps/unihub/backend/inventory/` & `.../tests/`; Frontend: `apps/unihub/frontend/src/`

---

## Phase 1: Setup

- [ ] T001 [P] Add volume units to `apps/unihub/backend/inventory/units.py`: `VOLUME_UNITS = {"mL": 1, "L": 1000}` (canonical mL) + `volume_to_canonical` / `volume_from_canonical` helpers
- [ ] T002 [P] Add volume conversion tests (L↔mL round-trip, unknown unit) to `apps/unihub/backend/tests/test_inventory_units.py`

---

## Phase 2: Foundational (Blocking Schema Change)

**⚠️ CRITICAL**: reshapes the DB; blocks every story below.

- [ ] T003 Update `apps/unihub/backend/inventory/models.py` (per data-model.md): **Item** — rename `price`→`sku_price`, `price_currency`→`sku_price_currency`, `archived_at`→`deprecate_time`; add `volume_canonical`/`volume_unit`; make `quantity` `null=False, default=1`; remove `status`, `model`, `serial_number`, `cost`, `cost_currency`. **Acquisition** — remove `method`; add `request_time`, `cost`, `cost_currency`, `discount`, `tax_refund`.
- [ ] T004 Generate the base migration then hand-edit → `apps/unihub/backend/inventory/migrations/0005_iter3_fields.py` (mark `atomic = False`). Operation order: RenameFields (price/price_currency/archived_at) → AddFields (volume, acquisition cost/discount/tax_refund/request_time) → **RunPython backfill** (set `quantity=1` where null; set each `Acquisition.cost = Σ item.cost` and `cost_currency` = first non-blank item `cost_currency`, **before** item.cost is dropped) → AlterField `quantity` NOT NULL → RemoveFields (item cost/cost_currency/status/model/serial_number; acquisition method)
- [ ] T005 Add `apps/unihub/backend/inventory/migrations/0006_reseed_system_attrs.py` refreshing `is_system` AttributeDefinitions (Item: +sku_price/sku_price_currency/volume/volume_unit/deprecate_time, −cost/cost_currency/status/model/serial_number; Acquisition: +request_time/cost/cost_currency/discount/tax_refund, −method), reversible
- [ ] T006 Run `uv run python manage.py migrate` on the local stack; confirm `0005`/`0006` apply cleanly on a **fresh DB** AND on the iteration-2 DB (exercise the `item.cost → acquisition.cost` backfill and `quantity` null→1)

**Checkpoint**: schema on the new shape; stories can proceed.

---

## Phase 3: User Story 2 - Acquisition form: cost, cards, edit (Priority: P1) 🎯

**Goal**: Acquisition holds the order payment (cost/discount/tax_refund → net_cost) and request_time; items show as an editable **card view** (≥1 required, default card on create); source is auto-complete; acquisition is editable on a standalone page. No method. Constitution v1.14.0 page rules.

**Independent Test**: Create an acquisition (cost 3300 / discount 100 → net_cost 3200) with a default card + one added card; confirm ≥1-item enforced, source auto-completes, no Cancel button; then edit it on its standalone page and change the discount.

### Tests for User Story 2 (write/adjust first) ⚠️

- [ ] T007 [P] [US2] Update `apps/unihub/backend/tests/test_inventory_acquisitions.py`: `test_acquisition_cost_discount_tax_refund_net_cost`, `test_acquisition_requires_at_least_one_item`, `test_acquisition_no_method_field`, `test_acquisition_request_time_persisted`, `test_sources_endpoint_returns_distinct_used_sources`, `test_sources_endpoint_filters_by_q`

### Implementation for User Story 2

- [ ] T008 [US2] Rework `AcquisitionSerializer` in `apps/unihub/backend/inventory/serializers.py`: fields `request_time`, `cost`, `cost_currency`, `discount`, `tax_refund` + derived read-only `net_cost`; nested writable `items` with **≥1 validation** on create; drop `method` and `total_item_cost`
- [ ] T009 [US2] In `apps/unihub/backend/inventory/views.py`+`urls.py`: add `GET /acquisitions/sources/?q=` action returning distinct non-blank sources (capped, `q`-filtered); update `AcquisitionViewSet` filter/ordering (drop `method`; add `request_time`, `cost`)
- [ ] T010 [US2] Run T007 to green (`uv run pytest tests/test_inventory_acquisitions.py`)
- [ ] T011 [US2] Regenerate OpenAPI schema + frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [ ] T012 [P] [US2] Update `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`: `Acquisition` types (request_time, cost/cost_currency/discount/tax_refund, derived net_cost; no method/total_item_cost), `updateAcquisition`, and `listSources(q)`
- [ ] T013 [US2] Rework `apps/unihub/frontend/src/pages/inventory/acquisitions/new.tsx`: **card view** for "Items in this acquisition" (preview filled fields only, editable/removable); **pre-insert one empty item card**; **≥1-item submit guard**; `source` via AntD **AutoComplete** (options from `listSources`); add request_time + cost/cost_currency/discount/tax_refund fields with a live **net_cost** preview; remove method; **remove the Cancel button** (breadcrumb only); source/obtained_at row **stacks on narrow screens**
- [ ] T014 [US2] Build the NEW standalone edit page `apps/unihub/frontend/src/pages/inventory/acquisitions/edit.tsx` (same form pre-filled from `getAcquisition`, `PATCH` on save, breadcrumb, no Cancel); register route `/inventory/acquisitions/:id/edit` in `apps/unihub/frontend/src/App.tsx`
- [ ] T015 [US2] Update `apps/unihub/frontend/src/pages/inventory/acquisitions/index.tsx`: **add explicit `title` to every column** (fix blank headers on `item_count`/net_cost), drop the method column, show `net_cost`, and route the Edit action to the standalone edit page
- [ ] T016 [P] [US2] Update `pages.inventory.acquisitions.*` keys in BOTH `en-US` and `zh-TW`: add request_time, cost/discount/tax_refund/net_cost, card-view + source-autocomplete copy; remove method/pending keys

**Checkpoint**: acquisition payment + card flow + standalone edit work; no method.

---

## Phase 4: User Story 1 - Item fields, deprecation, list fixes (Priority: P1)

**Goal**: Items use sku_price (+derived total_price), volume, required quantity; lifecycle is `deprecate_time` with derived status (Deprecate/Restore); the list fixes blank headers, uses a single "—", adds an obtained-date column, drops model/serial. Constitution v1.14.0 modal rules.

**Independent Test**: Edit an item (sku_price + currency, volume, quantity) and confirm total_price = sku_price × quantity; Deprecate (timestamp defaults today 00:00) → status "deprecated"; Restore → "active"; confirm every list column has a header and one "—" placeholder.

### Tests for User Story 1 (write/adjust first) ⚠️

- [ ] T017 [P] [US1] Update `apps/unihub/backend/tests/test_inventory_items.py`: `test_item_sku_price_and_total_price`, `test_item_quantity_defaults_to_one`, `test_item_volume_roundtrip_units`, `test_deprecate_sets_status_deprecated`, `test_restore_clears_deprecate_time`, `test_status_is_read_only`, `test_item_has_no_model_serial_cost_fields`; update the shared `create_item` helper in `tests/conftest.py` (sku_price, no cost/model/serial)

### Implementation for User Story 1

- [ ] T018 [US1] Update `ItemSerializer` in `apps/unihub/backend/inventory/serializers.py`: `sku_price`/`sku_price_currency`; `volume` as `{value,unit}`; derived read-only `total_price` and `status`; `quantity` default 1; drop `cost`/`cost_currency`/`model`/`serial_number`; `status` is read-only (reject/ignore writes)
- [ ] T019 [US1] Update `ItemViewSet` in `apps/unihub/backend/inventory/views.py`: filter/ordering fields drop `cost`/`model`/`serial_number`/`status`, add `sku_price`/`volume_canonical` and an optional `deprecated` filter over `deprecate_time`; run T017 to green
- [ ] T020 [US1] Regenerate frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [ ] T021 [P] [US1] Update `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`: `Item` types (sku_price/sku_price_currency, volume, deprecate_time, derived total_price/status; no cost/model/serial), keep `updateItem`/`deleteItem`
- [ ] T022 [US1] Rework `apps/unihub/frontend/src/pages/inventory/items/ItemFormModal.tsx`: rename price→sku_price; add a **volume** field (value+unit); remove model/serial inputs; **remove the status select** (derived); make `quantity` required + default 1; **disable a currency selector when its amount is 0/empty**; **stack fields on narrow screens**; **Cancel button left-most**; **do not close on outside-click/Esc while dirty**
- [ ] T023 [US1] Update `apps/unihub/frontend/src/pages/inventory/items/index.tsx`: **add explicit `title` to every column** (fix blank headers on spec/weight/length/width/height/volume); add an **obtained-date column**; remove model/serial columns; default column order name, spec, size, weight, length, width, height (+ obtained-date); replace **Archive → Deprecate** (a custom confirm modal with a `deprecate_time` DatePicker defaulting today 00:00) and add a **Restore** action (clears deprecate_time) for deprecated items; render the **derived status** tag; use the single **"—"** placeholder everywhere; **remove the "Add items via New Acquisition" hint**
- [ ] T024 [P] [US1] Update `pages.inventory.items.*` keys in BOTH locales: add sku_price, volume, deprecate/restore, deprecated-status, obtained-date; remove model/serial/price/editable-status/archive keys
- [ ] T025 [P] [US1] Update `apps/unihub/frontend/src/pages/inventory/items/ItemsPage.test.tsx` to the new shape (sku_price, volume, no New/model/serial; deprecate/restore)

**Checkpoint**: item model + list + modal reflect iteration 3; blank-header bug fixed.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T026 Run the backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` — full suite green
- [ ] T027 Run the frontend quality loop from `apps/unihub/frontend/`: `pnpm lint` (0 warnings) `&& pnpm typecheck` `&& pnpm test`
- [ ] T028 [P] Verify locale parity: every `menu.inventory.*` / `pages.inventory.*` key exists in BOTH locales with removed keys pruned from both (Principle VIII)
- [ ] T029 [P] Constitution v1.14.0 spot-check: acquisition create/edit pages render **no Cancel button** (breadcrumb present); `ItemFormModal` Cancel is left-most and the modal does not close on outside-click while dirty; both stack on narrow widths. Also grep confirms no `finance` model import in `inventory/` (Principle II)
- [ ] T030 Rebuild the Docker stack and run the [quickstart.md](quickstart.md) walkthrough end-to-end on Postgres (acquisition card flow + net_cost, ≥1-item guard, source autocomplete, deprecate/restore, standalone edit, cascade delete), including the `item.cost → acquisition.cost` backfill on the pre-existing DB
- [ ] T031 [P] Mark tasks complete and add an Implementation Notes section (deviations, migration `atomic=False` rationale) to this file

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: volume helpers — no deps.
- **Foundational (P2)**: models + migrations — depends on the volume helpers (T001) for the serializer; **blocks all stories**.
- **US2 (P3)** and **US1 (P4)**: both depend on Foundational. They share the regenerated types (T011/T020) — run US2 backend before US1 frontend, or regenerate once after both serializers land. Independent otherwise; can be staffed in parallel.
- **Polish (P5)**: after both stories.

### Parallel Opportunities

- T001/T002 (volume helpers + tests) in parallel.
- After Foundational, US2 (T007–T016) and US1 (T017–T025) can proceed in parallel; `[P]` service/i18n/test tasks touch different files.
- Locale tasks (T016, T024) and test tasks are parallelizable within a phase.

---

## Implementation Strategy

### Critical path
1. Setup + Foundational (volume helpers → models → migrations → migrate) — schema lands first, with the data-preserving backfill.
2. US2 + US1 backend (serializers, sources endpoint, deprecate/restore) → regen types → US2 + US1 frontend (card view, edit page, ItemFormModal, list fixes).
3. Polish: both quality loops + Docker quickstart.

### Notes
- Backend behavior changes are test-first: adjust the test to the new contract and see it fail before changing code.
- Migration `0005` MUST be `atomic = False` (Postgres rejects ALTER after a RunPython row backfill in one transaction — learned in iteration 2).
- The backfill MUST read `item.cost` before the RemoveField drops it, and set `quantity` before the NOT-NULL alter.
- Regenerate frontend types after every serializer change (Principle IV).
- Add/prune i18n keys in both locales in the same commit (Principle VIII).
- Apply Constitution v1.14.0: standalone pages have no Cancel (breadcrumb); modals keep Cancel left-most, guard outside-click while dirty, and stack on narrow screens.
