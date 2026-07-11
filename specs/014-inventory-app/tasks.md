---
description: "Task list for Inventory App — Refinement Iteration (2026-07-11)"
---

# Tasks: Inventory App — Refinement Iteration

**Input**: Design documents from `/specs/014-inventory-app/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/inventory-api.md](contracts/inventory-api.md)

**Baseline**: The feature shipped at commit `49159dd` (models, viewsets, tests, frontend pages all passing/live). This iteration applies the 2026-07-11 clarifications as a **delta**; tasks modify existing files unless marked "NEW". Backend behavior changes are test-first (Principle V) — adjust/author the failing test before changing the code.

**Organization**: Grouped by the affected user stories. US2 (acquisition-first creation) and US1 (item fields + list) are co-critical P1 for this iteration.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: different files, no dependency on an incomplete task
- Backend: `apps/unihub/backend/inventory/` & `.../tests/`; Frontend: `apps/unihub/frontend/src/`

---

## Phase 1: Setup

- [x] T001 [P] Add measurement unit-conversion helpers (length→mm {mm:1,cm:10,m:1000,in:25.4}; weight→g {g:1,kg:1000,lb:453.592}; `to_canonical(value, unit)` / `from_canonical(canonical, unit)`) in a new `apps/unihub/backend/inventory/units.py`
- [x] T002 [P] Add unit tests for the conversion helpers (round-trip, each unit, precision) in `apps/unihub/backend/tests/test_inventory_units.py`

---

## Phase 2: Foundational (Blocking Schema Change)

**⚠️ CRITICAL**: The migration reshapes the DB and blocks every story below.

- [x] T003 Update `apps/unihub/backend/inventory/models.py` to the refined field set (per data-model.md): **Item** — add `spec`,`remark` (TextField), `color`,`url`, `length_canonical`/`length_unit`/`width_*`/`height_*`/`weight_*`, `price_currency`,`cost_currency`; change `status` to enum {active,deprecated} default active; make `acquisition` FK `null=False, on_delete=CASCADE`; remove `category`,`storage_location`,`purchase_time`. **Acquisition** — rename `notes`→`remark`, remove `arrived_at`,`cost`. **Constraint** — remove `target_category`. Update model `Meta.ordering` for Item to `["-acquisition__obtained_at"]`.
- [x] T004 Generate the base migration (`uv run python manage.py makemigrations inventory` → `0003_refine_fields.py`), then hand-edit it to add data operations: (a) create one synthetic blank-method/source "unknown origin" `Acquisition` and reassign every `acquisition IS NULL` item to it **before** the NOT-NULL alter; (b) backfill `*_canonical` from any existing raw measurement values (assume prior implicit unit mm/g) and set default units; (c) data-migrate legacy `status` values → active/deprecated. Ensure the operation order is add-columns → data-migrate → drop-columns → alter-FK-not-null.
- [x] T005 Add `apps/unihub/backend/inventory/migrations/0004_reseed_system_attrs.py` updating `is_system` AttributeDefinitions for Item/Acquisition to the new field set (add spec/remark/color/url/units/price_currency/cost_currency/status; remove category/storage_location/purchase_time/arrived_at), reversible — mirror `0002_seed_system_attrs`.
- [x] T006 Run `uv run python manage.py migrate` on the local stack and confirm both migrations apply cleanly (fresh DB and, if available, a DB seeded with iteration-1 data to exercise the backfill).

**Checkpoint**: schema is on the new shape; stories can proceed.

---

## Phase 3: User Story 2 - Acquire items (acquisition-first) (Priority: P1) 🎯

**Goal**: Items are created only inside an acquisition (standalone page adds one or more items at once); deleting an acquisition cascades to its items.

**Independent Test**: Create a purchase acquisition adding two items at once and a blank acquisition adding one pre-existing item; confirm all appear in the catalog linked to their acquisition, and deleting an acquisition removes its items.

### Tests for User Story 2 (write/adjust first) ⚠️

- [x] T007 [P] [US2] Update `apps/unihub/backend/tests/test_inventory_acquisitions.py`: replace the old link-existing-items tests with `test_create_acquisition_with_multiple_items_atomic`, `test_create_acquisition_item_missing_name_rolls_back`, `test_item_requires_acquisition` (no standalone `POST /items/`), `test_delete_acquisition_cascades_items`, `test_acquisition_total_cost_grouped_by_currency`, `test_blank_method_acquisition_reads_unknown_origin`

### Implementation for User Story 2

- [x] T008 [US2] Rework `AcquisitionSerializer` in `apps/unihub/backend/inventory/serializers.py`: nested writable `items: [ItemWrite]` creating items atomically on `create`; `PATCH` supports add/edit/remove of item rows; `remark` field; `total_item_cost` returns a list of `{currency, total}` grouped by `cost_currency`; drop `cost`/`arrived_at`/`has_arrived`
- [x] T009 [US2] Update `AcquisitionViewSet` and `ItemViewSet` in `apps/unihub/backend/inventory/views.py`: remove the standalone item `create` (disallow `POST /items/`); ensure acquisition `destroy` cascades (model CASCADE) — keep a plain delete (frontend gates with confirm)
- [x] T010 [US2] Run T007 to green (`uv run pytest tests/test_inventory_acquisitions.py`)
- [x] T011 [US2] Regenerate OpenAPI schema + frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [x] T012 [P] [US2] Update `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`: new `Acquisition`/`Item` types (nested items, per-currency total, `remark`, no arrived/cost), `createAcquisition(withItems)`, remove `createItem` standalone export
- [x] T013 [US2] Build the NEW standalone Acquisition create page `apps/unihub/frontend/src/pages/inventory/acquisitions/new.tsx` — acquisition fields + an inline editable item-rows table (add/remove rows), each row with the full item form; submit creates all atomically; register route `/inventory/acquisitions/new` in `App.tsx`
- [x] T014 [US2] Update `apps/unihub/frontend/src/pages/inventory/acquisitions/index.tsx`: "New Acquisition" navigates to the create page; show `total_item_cost` per-currency; drop arrival column; delete uses `Modal.confirm(okType:'danger')` stating the item count (cascades to items)
- [x] T015 [P] [US2] Update `pages.inventory.acquisitions.*` keys (remove arrived/pending; add create-page, item-rows, per-currency total, cascade-delete copy) in BOTH `en-US` and `zh-TW` `pages.ts`

**Checkpoint**: creation flows only through acquisitions; composition delete works.

---

## Phase 4: User Story 1 - Item fields & catalog defaults (Priority: P1)

**Goal**: Items carry the refined attribute set (units, per-field currency, spec/remark/color/url, status active/deprecated); the catalog uses the new default sort/columns and archived-as-filter.

**Independent Test**: Edit an item changing weight kg→g (sort stays correct), pick a finance currency for price, set status deprecated, archive it and find it via the archived filter; confirm default sort ↓acquisition.obtained_at and the default column order; confirm there is no standalone New Item button.

### Tests for User Story 1 (write/adjust first) ⚠️

- [x] T016 [P] [US1] Update `apps/unihub/backend/tests/test_inventory_items.py`: `test_item_measurement_roundtrip_units`, `test_sort_items_by_weight_across_units`, `test_item_price_cost_currency_persisted`, `test_item_status_rejects_unknown_value`, `test_items_default_sorted_by_acquisition_obtained_at_desc`, `test_archived_is_filterable_not_excluded_by_default`; remove the old `?archived` toggle test and the standalone-create test (creation now via acquisition helper)

### Implementation for User Story 1

- [x] T017 [US1] Update `ItemSerializer` in `apps/unihub/backend/inventory/serializers.py`: expose measurements as `{value, unit}` (write→canonical via `units.py`, read→display value); `price_currency`/`cost_currency`; `spec`,`remark`,`color`,`url`; `status` validation {active,deprecated}; drop `category`/`storage_location`/`purchase_time`/`origin_known`-null path (acquisition always present)
- [x] T018 [US1] Update `ItemViewSet` in `apps/unihub/backend/inventory/views.py`: default `ordering = ["-acquisition__obtained_at"]`; `ordering_fields`/`filterable_fields` on canonical measure columns + `acquisition__obtained_at` + `archived_at` + `status`; remove the `?archived` default-exclusion `get_queryset` (archived is now a normal filter); run T016 to green
- [x] T019 [US1] Regenerate frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [x] T020 [US1] Update the Items list page `apps/unihub/frontend/src/pages/inventory/items/index.tsx`: remove the active/archived Segmented toggle and the New Item button; default column order (name, spec, model, serial, size, weight, length, width, height); render measurements as value+unit and money as amount+currency `<Tag>`; `status` tag (active/deprecated); expose `archived` + `status` as filter attributes; seed `useEntityTable` default sort to `-acquisition__obtained_at`
- [x] T021 [US1] Update the item edit modal (in `items/index.tsx` or a new `ItemFields.tsx` shared with the acquisition create rows) to include unit selects (length/width/height/weight), currency selects for price/cost (options from `listCurrencies()` — finance API, Principle II), `spec`/`remark` textareas, `color`, `url`, `status` select; remove category/storage_location/purchase_time inputs
- [x] T022 [P] [US1] Update `pages.inventory.items.*` keys in BOTH locales: add spec/remark/color/url/status(active,deprecated)/unit labels/currency; remove category/storage_location/purchaseTime/type-of-archived-toggle keys
- [x] T023 [P] [US1] Update `apps/unihub/frontend/src/pages/inventory/items/ItemsPage.test.tsx` to the new shape (measurement value+unit, no New Item button)

**Checkpoint**: US1 + US2 fully reflect the refined item model.

---

## Phase 5: User Story 4 - Constraints (item-set-only required) (Priority: P3)

**Goal**: `required` constraints use an explicit item set only; category matching removed.

**Independent Test**: Add a `required` constraint over an item set, omit all → violation; select one → clears. Confirm no category field appears.

### Tests for User Story 4 (write/adjust first) ⚠️

- [x] T024 [P] [US4] Update `apps/unihub/backend/tests/test_inventory_constraints.py`: replace `test_required_by_category_satisfied` with `test_required_constraint_item_set_only` and `test_required_needs_at_least_one_item`; keep mutual_exclusive and weight_limit tests

### Implementation for User Story 4

- [x] T025 [US4] Update `ConstraintSerializer` validation in `apps/unihub/backend/inventory/serializers.py`: `required` needs `item_ids` ≥1 (drop the target_category branch); remove `target_category` from fields
- [x] T026 [US4] Update `evaluate_constraints` in `apps/unihub/backend/inventory/services.py`: drop the category-matching branch in the `required` case; weight_limit sums `weight_canonical` (grams); run T024 to green
- [x] T027 [US4] Update the constraints panel in `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: remove the target_category form field for `required`; remove category-related copy
- [x] T028 [P] [US4] Prune `pages.inventory.constraints.col.category` from BOTH locales

**Checkpoint**: constraints match the item-set-only model.

---

## Phase 6: User Story 5 - Positions & scenario nav (Priority: P3)

**Goal**: Position review no longer references storage location; the Scenario detail page uses a breadcrumb.

**Independent Test**: Review a packed item's position (container or top-level) — no storage-location shown; the Scenario detail header is a breadcrumb (Scenarios → name), not a back button.

- [x] T029 [US5] Update `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: replace the back `Button` with an AntD `Breadcrumb` (Scenarios → «name»); remove any storage-location display in position review (container/top-level only)
- [x] T030 [P] [US5] Update `pages.inventory.scenarios.detail.*` keys in BOTH locales (breadcrumb label; drop back-button copy)

**Checkpoint**: all five stories reflect the refinements.

---

## Phase 7: Polish & Cross-Cutting

- [x] T031 Run the backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` — full suite green (inventory + no regressions)
- [x] T032 Run the frontend quality loop from `apps/unihub/frontend/`: `pnpm lint` (0 warnings) `&& pnpm typecheck` `&& pnpm test`
- [x] T033 [P] Verify locale parity: every `menu.inventory.*` / `pages.inventory.*` key exists in BOTH `en-US` and `zh-TW`, with removed keys pruned from both (Principle VIII)
- [x] T034 [P] Confirm the currency picker reads finance currencies via API only — no import of `finance.models` and no DB FK in `inventory/` (Principle II grep check)
- [x] T035 Rebuild the Docker stack and run the [quickstart.md](quickstart.md) walkthrough (acquisition-first create, unit round-trip, currency pick, archived filter, cascade delete, breadcrumb) end-to-end on Postgres
- [x] T036 [P] Update [tasks.md] progress and note any intentional deviations in an Implementation Notes section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: unit helpers — no deps.
- **Foundational (P2)**: model + migrations — depends on unit helpers (T001) for canonicalization backfill; **blocks all stories**.
- **US2 (P3 phase)** and **US1 (P4 phase)**: both depend on Foundational. They share the item field shape — do **US2 serializer nested item write (T008) after US1 ItemSerializer (T017)**, or develop the shared item-fields serializer once and consume it in both. US1 list defaults are independent of US2 UI.
- **US4 (P5)** and **US5 (P6)**: depend on Foundational; independent of US1/US2 UI.
- **Polish (P7)**: after all desired stories.

### Cross-story note
The item attribute serializer is shared by the Acquisition nested-create (US2) and the Item edit (US1). Implement it once (T017) and reference it in T008 to avoid divergence.

### Parallel Opportunities

- T001/T002 (unit helpers + tests) in parallel.
- After Foundational: US4 (T024–T028) and US5 (T029–T030) can proceed in parallel with the US1/US2 UI work.
- Locale tasks (T015, T022, T028, T030) and test tasks touch different files — parallelizable within a phase.

---

## Implementation Strategy

### Critical path (this iteration)
1. Setup + Foundational (unit helpers → models → migrations → migrate) — the schema must land first.
2. US2 + US1 backend (shared item serializer, nested acquisition create, list defaults) → regen types → US2 + US1 frontend.
3. US4 + US5 (small deltas) in parallel.
4. Polish: both quality loops + quickstart on the Docker stack.

### Notes
- Backend behavior changes are test-first: update the test to the new contract and see it fail before changing the code.
- Regenerate frontend types after every serializer shape change (Principle IV).
- Currency options come from the finance API (`listCurrencies`) — never import finance models (Principle II).
- Add/prune i18n keys in both locales in the same commit (Principle VIII).
- The migration backfill must run before the `Item.acquisition` NOT-NULL alter, or existing rows will fail the constraint.

## Implementation Notes (2026-07-11, iteration 2)

**All 36 tasks complete.** Verified end-to-end on the Postgres Docker stack.

- **Backend**: 244 tests pass (8 new unit-conversion tests + rewritten inventory suites), ruff clean. Migrations `0003_refine_fields` + `0004_reseed_system_attrs` applied cleanly on a fresh DB *and* on the iteration-1 DB with orphan data (the synthetic "unknown origin" acquisition backfill worked).
- **Frontend**: ESLint 0 warnings, strict typecheck clean, 359 tests pass. New standalone Acquisition create page (`acquisitions/new.tsx`) with a reusable `ItemFormModal` (units + finance-currency pickers); Items list is edit-only with the new default columns/sort; Scenario detail uses a breadcrumb.
- **Live smoke**: acquisition-first create (2 items, 201), per-currency totals (USD 2200 / EUR 30), weight round-trip 0.66 kg↔660 g, `POST /items/` → 405, acquisition delete cascades item → 404.
- **Deviation**: migration `0003` is marked **`atomic = False`**. Postgres rejects `ALTER TABLE` in the same transaction as the RunPython row backfill ("pending trigger events"); non-atomic lets the backfill commit first. SQLite (tests) doesn't hit this, so it surfaced only on the Docker Postgres run.
- **Principle II** verified: `grep` confirms no `finance` import / FK in `inventory/` — currency stays a code string, picker fed by the finance API.
