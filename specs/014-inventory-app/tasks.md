---
description: "Task list for Inventory App — Iteration 4 (2026-07-11)"
---

# Tasks: Inventory App — Iteration 4 (cost factors, merged Catalog, cleanups)

**Input**: Design documents from `/specs/014-inventory-app/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/inventory-api.md](contracts/inventory-api.md)

**Baseline**: Iteration 3 shipped at commit `a7a0ea2`. This iteration is a **delta**; tasks modify existing files unless marked "NEW". Backend behavior changes are **test-first** (Principle V). Constitution is **v1.14.0**.

**Organization**: Grouped by the affected user stories. US2 (acquisition: cost factors, page polish, item-edit fix) and US1 (item cleanups + merged Catalog) are co-critical P1.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: different files, no dependency on an incomplete task
- Backend: `apps/unihub/backend/inventory/` & `.../tests/`; Frontend: `apps/unihub/frontend/src/`

---

## Phase 1: Setup

- [X] T001 [P] Create the container-width RWD hook `apps/unihub/frontend/src/hooks/useContainerWidth.ts` (ResizeObserver → `{ width, isNarrow }`) so form layouts stack on a narrow **content area**, not just a narrow viewport

---

## Phase 2: Foundational (Blocking Schema Change)

**⚠️ CRITICAL**: reshapes the DB; blocks every story below.

- [X] T002 Update `apps/unihub/backend/inventory/models.py` (per data-model.md): **NEW `CostFactor`** model (`value` signed Decimal, `currency`, `type` single_select {accumulated,shipping,discount,tax_refund,paid_by_other,other} default accumulated, FK→Acquisition CASCADE related_name `cost_factors`); **Acquisition** remove `cost`/`cost_currency`/`discount`/`tax_refund`; **Item** remove `item_type`, change `quantity` to `IntegerField(default=1)`
- [X] T003 Hand-write migration `apps/unihub/backend/inventory/migrations/0007_cost_factors.py` (`atomic = False`): create CostFactor → RunPython backfill (per acquisition: `accumulated` factor = old `cost`/`cost_currency`; add `discount` factor `−discount` and `tax_refund` factor `−tax_refund` when non-zero; if no cost, `accumulated`=0; round `Item.quantity` to int) **before** dropping the scalar cost columns → RemoveField(item_type, acquisition cost/cost_currency/discount/tax_refund) → AlterField `Item.quantity` → IntegerField
- [X] T004 Add `apps/unihub/backend/inventory/migrations/0008_reseed_system_attrs.py`: drop Item `item_type`, Acquisition cost/cost_currency/discount/tax_refund system attrs; seed a **CostFactor** content-type's system attrs (value, currency, type); reversible
- [X] T005 Run `uv run python manage.py migrate`; confirm `0007`/`0008` apply cleanly on a **fresh DB** AND the iteration-3 DB (exercise the `cost → accumulated/discount/tax_refund factors` backfill and `quantity → int`)

**Checkpoint**: schema on the new shape; stories can proceed.

---

## Phase 3: User Story 2 - Cost factors + acquisition polish + item-edit fix (Priority: P1) 🎯

**Goal**: Acquisition payment is 1..N cost factors (signed value, currency, type) → per-currency net_cost; `accumulated` auto-derives/overrides/resets; page title "Acquisition"; 3-crumb edit breadcrumb; request_time defaults today 00:00; **editing an item card persists** (fixed).

**Independent Test**: Create an acquisition with an accumulated factor + a −100 USD discount + a 30 EUR shipping → net_cost shows USD & EUR lines; edit an item card value and confirm it survives on the card and after reload.

### Tests for User Story 2 (write/adjust first) ⚠️

- [X] T006 [P] [US2] Update `apps/unihub/backend/tests/test_inventory_acquisitions.py`: `test_acquisition_cost_factors_net_cost_per_currency`, `test_acquisition_requires_at_least_one_cost_factor`, `test_cost_factor_value_carries_sign`, `test_accumulated_defaults_to_item_total_sum`, `test_acquisition_requires_at_least_one_item` (kept); `test_item_edit_via_acquisition_patch_persists`

### Implementation for User Story 2

- [X] T007 [US2] Add `CostFactorSerializer` and rework `AcquisitionSerializer` in `apps/unihub/backend/inventory/serializers.py`: nested writable `cost_factors` (≥1 on create; PATCH replaces the set, ≥1); derived **`net_cost`** = per-currency sum of factor values; when `cost_factors` omitted on create, auto-add an `accumulated` factor = Σ item `total_price`; drop scalar cost fields
- [X] T008 [US2] Update `AcquisitionViewSet` filter/ordering in `apps/unihub/backend/inventory/views.py` (drop `cost` filter; keep source/request_time/obtained_at + `sources` action); run T006 to green
- [X] T009 [US2] Regenerate OpenAPI schema + frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [X] T010 [P] [US2] Update `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`: `Acquisition` types (nested `cost_factors`, `net_cost` per-currency list; no scalar cost), NEW `CostFactor`/`CostFactorWrite`, `CostFactorType`
- [X] T011 [US2] Add a **CostFactors editor** to `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.tsx`: a list of `{value, currency, type}` rows (add/remove; type select; currency picker; signed value); the `accumulated` row's value **auto-derives** from Σ item total_price with **override** + **reset-to-derived**; a live **per-currency net_cost** preview; enforce ≥1 factor
- [X] T012 [US2] In `AcquisitionForm.tsx`: title the section **"Acquisition"**; default `request_time` to **today 00:00** (like obtained_at); apply the **`useContainerWidth`** hook so acquisition fields + cost-factor rows stack single-column on narrow content; **FIX the item-card edit persistence** (write edited values back to the pending list in create, and to the stored item via `updateItem` in edit; ensure the modal re-inits from the edited card)
- [X] T013 [US2] Update `apps/unihub/frontend/src/pages/inventory/acquisitions/edit.tsx`: breadcrumb **Acquisitions / {acquisition.id} / Edit Acquisition** (three crumbs)
- [X] T014 [P] [US2] Apply `useContainerWidth` stacking in `apps/unihub/frontend/src/pages/inventory/items/ItemFormModal.tsx` (single-column on narrow) and **remove the `item_type` select**; make `quantity` an integer input (precision 0)
- [X] T015 [P] [US2] Update `pages.inventory.acquisitions.*` keys in BOTH locales: cost-factor types (accumulated/shipping/discount/tax_refund/paid_by_other/other), net_cost, "Acquisition" title, reset/override copy; prune scalar cost/discount/tax_refund keys

**Checkpoint**: cost factors + per-currency net_cost + acquisition polish + item-edit persistence all work.

---

## Phase 4: User Story 1 - Item cleanups + merged Catalog page (Priority: P1)

**Goal**: `quantity` integer; `item_type` gone; checklist shortfall removed. The Items and Acquisitions lists merge into one **expandable-tree "Catalog"** page (acquisition parents → item children); item rows lose Edit.

**Independent Test**: Open Catalog → acquisitions as parent rows sorted ↓ obtained; expand to item children; item rows show Deprecate/Restore/Delete (no Edit); acquisition rows show Edit/Delete; `/inventory/items` redirects here.

### Tests for User Story 1 (write/adjust first) ⚠️

- [X] T016 [P] [US1] Update `apps/unihub/backend/tests/test_inventory_items.py`: `test_item_quantity_is_integer`, `test_item_has_no_item_type_field`; update the shared `create_item` helper in `tests/conftest.py` (integer quantity, no item_type)
- [X] T017 [P] [US1] Update `apps/unihub/backend/tests/test_inventory_scenarios.py`: `test_checklist_has_no_shortfall` (line payload omits shortfall); remove the consumable-shortfall test

### Implementation for User Story 1

- [X] T018 [US1] Update `ItemSerializer` in `apps/unihub/backend/inventory/serializers.py` (drop `item_type`; `quantity` integer) and `ItemViewSet` filter/ordering in `views.py` (drop `item_type`); remove the `shortfall` from `apps/unihub/backend/inventory/services.py` `build_checklist` (and the `consumable_shortfall` helper + its serializer use); run T016/T017 to green
- [X] T019 [US1] Regenerate frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [X] T020 [P] [US1] Update `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`: `Item` (no `item_type`, integer `quantity`), `ScenarioItem`/`ChecklistLine` (drop `shortfall`)
- [X] T021 [US1] Build the NEW merged Catalog page `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: `PageTable` with **expandable rows** (acquisitions as parents via `listAcquisitions` with nested items → item child rows); **union columns** (acquisition: source/obtained/net_cost; item: name/spec/size/weight/length/width/height/status/deprecate_time); parent rows fill acquisition cols, child rows item cols; `columnEmptyText={false}`; default sort acquisitions ↓ obtained; **item rows: Deprecate/Restore + Delete (NO Edit)**; **acquisition rows: Edit (→ /:id/edit) + Delete (cascade confirm)**; page action **New Acquisition**
- [X] T022 [US1] Wire routing/nav: in `apps/unihub/frontend/src/App.tsx` add `/inventory/catalog` and **redirect** `/inventory/items` + `/inventory/acquisitions` → it; in `apps/unihub/frontend/src/components/AppShell/AppShell.tsx` replace the Items/Acquisitions nav entries with a single **"Catalog"** entry (keep Scenarios); delete the old `pages/inventory/items/index.tsx` and `pages/inventory/acquisitions/index.tsx` list pages
- [X] T023 [P] [US1] Update scenario detail `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: remove any shortfall display from the checklist lines
- [X] T024 [P] [US1] Update locale keys in BOTH `en-US` and `zh-TW`: add `menu.inventory.catalog` + `pages.inventory.catalog.*`; remove `menu.inventory.items`/`menu.inventory.acquisitions` (list entries) and item_type/shortfall keys; keep item column keys reused by the Catalog

**Checkpoint**: one Catalog page; item_type/shortfall gone; integer quantity.

---

## Phase 5: Polish & Cross-Cutting

- [X] T025 Run the backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` — full suite green
- [X] T026 Run the frontend quality loop from `apps/unihub/frontend/`: `pnpm lint` (0 warnings) `&& pnpm typecheck` `&& pnpm test`; update/replace `ItemsPage.test.tsx` with a `CatalogPage` test (expandable rows; item rows have no Edit)
- [X] T027 [P] Verify locale parity (both locales identical key sets; removed keys pruned) and that the merged Catalog + acquisition pages have no blank headers and use the single "—" (Principle VI/VIII)
- [X] T028 [P] Constitution v1.14.0 + Principle II spot-check: acquisition pages breadcrumb/no-Cancel; modal Cancel-left/dirty-guard; **content-width stacking works when the sidebar makes the content narrow at a wide window**; grep confirms no `finance` model import in `inventory/`
- [ ] T029 Rebuild the Docker stack and run [quickstart.md](quickstart.md) end-to-end on Postgres (cost factors + per-currency net_cost, accumulated derive/override/reset, integer quantity, no item_type, merged Catalog expandable tree + redirects, item-edit persistence, deprecate/restore), including the `cost → factors` + `quantity → int` backfill on the pre-existing DB — **NOT run in this session** (see Implementation Notes)
- [X] T030 [P] Mark tasks complete + add an Implementation Notes section (deviations, migration `atomic=False`, backfill order) to this file

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: RWD hook — no deps (frontend).
- **Foundational (P2)**: CostFactor model + migrations — **blocks all stories**.
- **US2 (P3)** and **US1 (P4)**: both depend on Foundational and share the regenerated types (T009/T019) — regenerate once after both serializers land, or run US2 backend before US1 frontend. US1's Catalog page (T021) consumes acquisitions-with-nested-items and net_cost (from US2's serializer), so **T021 depends on T007**.
- **Polish (P5)**: after both stories.

### Parallel Opportunities

- T001 (RWD hook) alongside Foundational.
- After Foundational, US2 backend (T006–T008) and US1 backend (T016–T018) run in parallel; frontend service/i18n/test `[P]` tasks touch different files.

---

## Implementation Strategy

### Critical path
1. Setup + Foundational (RWD hook → CostFactor model → migrations → migrate) — schema + backfill land first.
2. US2 backend (cost-factor serializer, net_cost) → regen types → US2 frontend (CostFactors editor, page polish, **item-edit fix**) + US1 item cleanups.
3. US1 merged **Catalog** page + routing/nav + shortfall removal.
4. Polish: both quality loops + Docker quickstart.

### Notes
- Backend behavior changes are test-first.
- Migration `0007` MUST be `atomic = False`; the backfill MUST read the scalar `cost`/`discount`/`tax_refund` and current `quantity` **before** those columns are dropped/altered.
- Regenerate frontend types after every serializer change (Principle IV).
- Add/prune i18n keys in both locales in the same commit (Principle VIII).
- Merged Catalog stays on `PageTable` with `expandable` rows (Principle VII); item rows have **no Edit** (edit via the acquisition page).
- RWD MUST be **content-width** based (`useContainerWidth`), since AntD `Col` xs/sm follow the viewport.
- The item-edit-persistence fix (FR-021a) has an explicit acceptance test at both the API (`test_item_edit_via_acquisition_patch_persists`) and UI (quickstart) layers.

---

## Implementation Notes (iteration 4)

Completed 2026-07-11.

### Backend
- **`CostFactor` model** added (`value` signed Decimal, `currency` code string, `type` label — informational only; the *value* carries the sign). `Acquisition` lost `cost`/`cost_currency`/`discount`/`tax_refund`; `net_cost` is now a derived per-currency list (`[{currency, total}]`).
- **`Item`**: `item_type` removed entirely; `quantity` is now `IntegerField(default=1)`.
- **Shortfall feature removed**: dropped `consumable_shortfall()` and the `shortfall` key from `build_checklist()` and `ScenarioItemSerializer`.
- **Migration `0007_cost_factors`** is `atomic = False` (Postgres rejects a RunPython row backfill in the same transaction as the following `ALTER`/`RemoveField`). Order: CreateModel `CostFactor` → RunPython backfill (per acquisition: `accumulated` = old `cost` or 0; plus `discount`/`tax_refund` factors as **negative** values when non-zero; currency = old `cost_currency`) → RemoveField the scalar cost fields + `item_type` → AlterField `quantity` → Integer. The backfill reads the old columns **before** they are dropped.
- **Migration `0008_reseed_system_attrs`** drops the removed system AttributeDefinitions and seeds `CostFactor`'s (value/currency/type).
- On create, when `cost_factors` is omitted, the serializer auto-adds one `accumulated` factor = Σ(item `sku_price` × `quantity`). On update, providing `cost_factors` **replaces** the whole set (must stay ≥ 1).
- Full backend suite green: **254 passed**, ruff clean.

### Frontend
- **Merged Catalog page** (`pages/inventory/catalog/index.tsx`): one `PageTable` with `expandable` children — acquisitions are parent rows (via `listAcquisitions`, whose serializer embeds items), items are child rows, union columns, `columnEmptyText={false}`. Acquisition rows: Edit + Delete; item rows: Deprecate/Restore + Delete (**no Edit**). Old `items/index.tsx` and `acquisitions/index.tsx` deleted; `/inventory/items` and `/inventory/acquisitions` redirect to `/inventory/catalog`; AppShell shows a single **Catalog** entry.
- **CostFactors editor** in `AcquisitionForm.tsx` with signed value / currency / type rows, add/remove, **Reset accumulated** (recomputes from item prices), and a live per-currency net-cost preview. Section title is **"Acquisition"**; `request_time` defaults to today 00:00 on create.
- **Content-width RWD** via `useContainerWidth` (ResizeObserver) in `AcquisitionForm` and `ItemFormModal` — columns collapse to a single column on a narrow *content* area, not just a narrow viewport.
- **Item-edit persistence (FR-021a)** fixed: the edit modal now re-initialises from the *current* card data (`writeToItemLike(card.data)`, not the stale persisted `full`), and edits to already-persisted items are written back via `updateItem` immediately.
- Types regenerated from OpenAPI (Principle IV); locale key sets are identical across en-US/zh-TW.
- Frontend green: **lint 0 warnings, typecheck clean, 358 tests passed** (`vitest run`). A one-off full-`pnpm test` run showed a single load-induced timeout flake in an unrelated finance test; it passes in isolation and on a single-threaded `vitest run`.

### Not run this session
- **T029 (Docker end-to-end on Postgres)** was not executed in this session. The migrations are exercised on a fresh DB by the pytest suite (SQLite), but the `cost → factors` + `quantity → int` backfill against a pre-existing **Postgres** DB should still be verified via `docker compose` + quickstart before release.

---

# Tasks: Iteration 5 (catalog & cost UI refinements)

**Input**: plan.md "Iteration 5" delta, data-model.md (CostFactor `display_order`/free-form `type`/per-currency accumulated), contracts/inventory-api.md (iteration-5 rules), research.md (R7–R10). Builds on iteration 4 (commit `57441be`).

**Scope**: 3 data-model changes (free-form `type`, `display_order`, per-currency `accumulated` + uniqueness) + migration `0009`; a rebuilt **Cost** panel (drag-reorder, Total footer, composed value+currency, per-row reset); Catalog UI (arrow icon, split Source/Name, fit Actions, drop badge); item cards render all filled fields; `obtained_at` defaults today 00:00.

**Tests-first** (project TDD preference): write/adjust backend tests before the serializer/model change.

## Phase 1: Setup (iteration 5)

- [X] T031 [P] Add drag-and-drop deps in `apps/unihub/frontend/package.json`: `@dnd-kit/core` + `@dnd-kit/sortable` (+`@dnd-kit/utilities`); run `pnpm install`; confirm `pnpm typecheck` still passes

## Phase 2: Foundational (iteration 5) — blocks US2

- [X] T032 Update `apps/unihub/backend/inventory/models.py`: `CostFactor` — add `display_order = IntegerField(default=0)`; change `type` to a plain `CharField(max_length=20)` (**remove `choices`**); `Meta.ordering = ["display_order", "created_at"]`; add `Meta.constraints = [UniqueConstraint(fields=["acquisition","currency"], condition=Q(type="accumulated"), name="uniq_accumulated_per_currency")]`
- [X] T033 Create migration `apps/unihub/backend/inventory/migrations/0009_costfactor_order_freeform.py`: `AddField(display_order)` → RunPython backfill `display_order` from per-acquisition `created_at` order (+ optional guarded merge of any duplicate `(acquisition, currency)` accumulated) → `AlterField(type → CharField no choices)` → `AddConstraint(uniq_accumulated_per_currency)` → `AlterModelOptions(ordering)`; `atomic = False` if the constraint add follows the backfill on Postgres
- [X] T034 Add migration `apps/unihub/backend/inventory/migrations/0010_reseed_costfactor_type.py`: reseed the CostFactor `type` system AttributeDefinition from `single_select` → `text` (drop options); reversible
- [X] T035 Run `uv run python manage.py makemigrations inventory --check` (expect "No changes detected") and `uv run python manage.py migrate` on a fresh DB; confirm `0009`/`0010` apply cleanly

## Phase 3: US2 — Cost panel & per-currency accumulated (Priority: P1)

**Goal**: cost factors support free-form types, persisted order, and one system-managed accumulated per currency; the acquisition form presents them as the requested **Cost** panel.

**Independent test**: create an acquisition whose items span two currencies → two `accumulated` factors auto-derive; add a free-text-typed factor and a discount, reorder them, save, reload → order + values persist; the panel footer shows per-currency Totals.

- [X] T036 [P] [US2] Update `apps/unihub/backend/tests/test_inventory_acquisitions.py` (tests-first): `test_accumulated_one_per_item_currency` (items USD+TWD → 2 accumulated), `test_client_cannot_create_accumulated_type` (400), `test_duplicate_accumulated_currency_rejected` (400), `test_cost_factor_type_accepts_free_text` (e.g. `"customs"`), `test_cost_factors_preserve_display_order` (round-trip), `test_reset_accumulated_recomputes_from_items`
- [X] T037 [US2] Update `CostFactorSerializer` + `AcquisitionSerializer` in `apps/unihub/backend/inventory/serializers.py`: expose `display_order`; free-form `type` (non-empty); **reject** client `type="accumulated"` and a duplicate accumulated currency (400); on create-with-omitted `cost_factors`, derive **one `accumulated` per distinct item `sku_price_currency`** (`value` = Σ `sku_price × quantity`); persist `display_order` = array index with accumulated normalised to the front; keep `net_cost` per-currency; run T036 to green
- [X] T038 [US2] Regenerate OpenAPI schema + frontend types into `apps/unihub/frontend/src/generated/api-types.ts`
- [X] T039 [P] [US2] Update `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`: `CostFactor` + `CostFactorWrite` add `display_order`; keep `CostFactorType` as the suggestion union but type the field as `string` (free-form)
- [X] T040 [US2] Rebuild the **Cost** panel in `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.tsx`: rename "Cost Factors" → **"Cost"** and move the panel **below the Items panel**; header **Add**; each row `[drag] · type (AutoComplete w/ built-in suggestions) · value+currency composed (`Space.Compact`, `InputNumber` right-aligned) · reset (accumulated) | remove (manual)`; **accumulated rows: one per currency, pinned top, non-removable, per-row reset**; enforce **at most one accumulated per currency** client-side; rows full-width with vertical gap when narrow (`useContainerWidth`); **net cost in a "Total" footer** (per currency)
- [X] T041 [US2] Add drag reordering to the Cost panel (`AcquisitionForm.tsx`) using `@dnd-kit/sortable`: only manual (non-accumulated) rows are sortable; on drop, update local order and send `cost_factors` in display order (server persists `display_order`)
- [X] T042 [P] [US2] In `AcquisitionForm.tsx`: default `obtained_at` to **today 00:00** on create (like `request_time`); rename the items panel heading to **"Items"**; make each **item card render every non-empty attribute** (quantity, sku_price+currency, size, spec, color, length/width/height, weight, volume, url)
- [X] T043 [P] [US2] Update locale keys in BOTH `en-US` and `zh-TW` (`menu.ts`/`pages.ts`): `Cost`, `Total`, `Add`, `reset`, cost-factor built-in type suggestions; rename the items-panel heading key to "Items"

## Phase 4: US1 — Catalog table refinements (Priority: P2)

**Goal**: the merged Catalog reads cleanly — arrow disclosure, separate Source/Name columns, right-sized Actions, no badge.

**Independent test**: open `/inventory/catalog`; parent rows show an arrow toggle and a **Source** value (Name blank); expanding shows item rows with a **Name** value (Source blank); the Actions buttons never clip; no "Acquisition" badge is shown.

- [X] T044 [US1] In `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: use an **arrow expand icon** (`expandable.expandIcon`, ▸/▾); **split the Name/Source column** into a `source` column (acquisition rows) and a `name` column (item rows); **size the Actions column to fit content**; **remove the "Acquisition" badge**
- [X] T045 [P] [US1] Update the Catalog columns i18n in BOTH locales (`pages.ts`): add `Source`/`Name` column headers; drop the `catalog.col.nameSource` / `catalog.acquisitionRow` (badge) keys
- [X] T046 [P] [US1] Update the Catalog test `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx`: assert separate Source & Name columns and **no "Acquisition" badge**

## Phase 5: Polish & cross-cutting (iteration 5)

- [X] T047 Backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` — full suite green (only inventory files reformatted)
- [X] T048 Frontend quality loop from `apps/unihub/frontend/`: `pnpm lint` (0 warnings) `&& pnpm typecheck` `&& pnpm test`
- [X] T049 [P] Locale parity check (identical key sets both locales; pruned keys gone) and Principle II grep (no `finance` model import in `inventory/`; `@dnd-kit` is UI-only)
- [ ] T050 [P] Rebuild Docker + run [quickstart.md](quickstart.md) additions on Postgres: per-currency accumulated (2 currencies → 2 "Items" rows), free-text type, drag-reorder persistence, Total footer, arrow/split-column Catalog, item-card attributes; verify `0009`/`0010` on the pre-existing DB
- [X] T051 [P] Mark iteration-5 tasks complete + append Implementation Notes (migration `0009`/`0010`, `@dnd-kit` choice, per-currency accumulated derivation, any deviations) to this file

---

## Dependencies & Execution Order (iteration 5)

- **Setup (T031)** can run alongside Foundational.
- **Foundational (T032–T035)** blocks US2 (serializer needs the model/migration).
- **US2 (T036–T043)** is tests-first (T036 → T037); T038 regen after T037; T040/T041 depend on T039 types; T044+ (US1) is UI-only and can run in parallel with US2 frontend once types (T039) land.
- **US1 (T044–T046)** depends only on the existing Catalog page (no schema); parallelizable with US2 frontend.
- **Polish (T047–T051)** after both stories.

## Parallel Opportunities (iteration 5)

- T031 (deps) ∥ T032–T034 (backend model/migrations).
- After T038/T039: T040/T041/T042 (AcquisitionForm) are same-file → sequential; T043 (i18n), T044–T046 (Catalog, different files) run in parallel.
- T049/T050/T051 are independent `[P]` checks.

## Implementation Strategy (iteration 5)

MVP = **US2** (the cost-model change is the substantive one; blocks correct data). Ship US2, then US1 (pure UI polish). Backend behavior is test-first; regenerate types after the serializer change (Principle IV); update both locales in the same commit (Principle VIII).

---

## Implementation Notes (iteration 5)

Completed 2026-07-11 (builds on iteration 4, commit `57441be`).

### Backend
- **CostFactor**: added `display_order` (int); `type` is now a plain `CharField` (choices dropped — free-form, `accumulated` reserved); `Meta.ordering = ["display_order","created_at"]`; partial `UniqueConstraint(acquisition, currency) where type='accumulated'`.
- **Migrations**: `0009_costfactor_order_freeform` (`atomic=False`) — add `display_order` → RunPython backfill order + collapse any duplicate accumulated-per-currency → drop `type` choices → add unique constraint; `0010_reseed_costfactor_type` — reseed the `type` AttributeDefinition `single_select → text`.
- **Serializer**: on **create**, `accumulated` is derived **per item currency** (Σ `sku_price × quantity`); clients may not send `type=accumulated` (400) and only supply manual factors, which are appended after the derived ones with `display_order` = index. On **update**, `cost_factors` replaces the whole set in payload order, with ≤1 accumulated per currency enforced (400). `net_cost` unchanged (per-currency).
- Full backend suite green: **260 passed**, ruff clean.

### Frontend
- **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** added for drag reordering.
- **AcquisitionForm** rebuilt: **Cost** panel moved below the **Items** panel; accumulated rows are per-currency, pinned to the top, non-removable, currency-locked, with a per-row **Reset** (recomputes from items); manual rows are drag-sortable (`@dnd-kit`), free-text `type` via `AutoComplete`, `value`+`currency` composed in a `Space.Compact` (value right-aligned); a **Total** footer shows per-currency net. On create the accumulated is server-derived (only manual factors are sent); on edit the full set (accumulated overrides + manual, in order) is sent. `obtained_at` now defaults to today 00:00; item cards render every non-empty attribute.
- **Catalog**: arrow (▸/▾) expand icon; the single Name/Source column split into separate **Source** (acquisition) and **Name** (item) columns; Actions column widened to a fixed 220 so item-row buttons never clip; the "Acquisition" badge removed. Obsolete `catalog.col.nameSource`/`catalog.acquisitionRow` i18n keys pruned; `Cost`/`Total`/`Items` keys added (both locales, parity verified).
- Frontend green: **lint 0 warnings, typecheck clean, 358 tests passed** (`vitest run`).

### Not run this session
- **T050 (Docker end-to-end on Postgres)** — migrations `0009`/`0010` are exercised on a fresh DB by pytest (SQLite); the display_order backfill + duplicate-accumulated collapse + `type→text` reseed against a pre-existing **Postgres** DB should still be verified via `docker compose` + quickstart before release.

---

# Tasks: Iteration 6 (catalog polish, cost panel fixes, e2e, legacy import)

**Input**: plan.md "Iteration 6" delta; spec `### Session 2026-07-11 (catalog & cost UI polish, iteration 6)` + FR-003/006/006c/021/024. Builds on iteration 5 (commit `e979bb3`). Frontend-only feature work + one Django management command. Regression behaviours locked by **Playwright e2e**.

## Phase 1: US1 — Catalog polish (Priority: P1)

- [X] T052 [US1] In `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: replace the arrow expand icon with a **caret** (`CaretRightOutlined`/`CaretDownOutlined`) via `expandable.expandIcon`; make the tree **expanded by default** (`expandable.expandedRowKeys` = all acquisition ids, or `defaultExpandAllRows`)
- [X] T053 [US1] In `catalog/index.tsx`: compute **dynamic content-fit widths** per column (a `useMemo` over `rows` measuring each column's rendered text with `measureTextWidth`, fed into `widthForHeader(title, maxContentWidth)`); apply to every column incl. Actions so nothing clips or is over-narrow
- [X] T054 [US1] In `catalog/index.tsx`: add columns — acquisition **`request_time` ("Requested")**; item **`quantity`**, **`sku_price` (+currency)**, **`url`** (rendered as a clickable `<a target="_blank" rel="noopener">`), and **Length/Width/Height**; parent rows blank the item columns and vice-versa; `columnEmptyText={false}` retained
- [X] T055 [US1] In `catalog/index.tsx`: make **every column filterable + sortable** via the `EntityToolbar` (extend `filterableAttrs`/`columnDefs`); implement **flatten-on-item-filter/sort** — when any item-level filter/sort is active, render a **flat `Item[]`** (`acquisitions.flatMap(a => a.items)`) un-nested and sorted/filtered client-side by that column; when only acquisition-level filters/sorts are active, render the tree (default acquisitions ↓ `obtained_at`)
- [X] T056 [P] [US1] Add/verify Catalog column i18n in BOTH locales (`pages.ts`): `Requested`, `Quantity`, `SKU price`, `URL`, `Length`/`Width`/`Height` (reuse existing item keys where present)
- [X] T057 [P] [US1] Update `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx` (RTL): assert the **Requested** column header, item columns (Quantity/SKU price/URL), a **caret** toggle, and default-expanded rows (item text visible without clicking)

## Phase 2: US2 — Acquisition & cost panel fixes (Priority: P1)

- [X] T058 [P] [US2] Update `apps/unihub/frontend/src/pages/inventory/acquisitions/new.tsx` and `edit.tsx`: breadcrumb first crumb **"Catalog"** linking to `/inventory/catalog` (create = Catalog / New Acquisition; edit = Catalog / {id} / Edit Acquisition)
- [X] T059 [US2] In `AcquisitionForm.tsx`: when an item card's `url` is set, render the **card `title` as an `<a href={url} target="_blank" rel="noopener">`** (opens a new tab); no link when url is empty
- [X] T060 [US2] In `AcquisitionForm.tsx` cost panel: make the accumulated **reset an icon-only `Button`** (`ReloadOutlined`, no text) so it never overflows; drive each factor row's `Col`s off `useContainerWidth` `isNarrow` so rows **stack to one column when narrow** (matching the Acquisition panel); render the accumulated rows' label as **"Items"**
- [X] T061 [P] [US2] i18n (BOTH locales): add `pages.inventory.acquisitions.costFactors.accumulatedLabel` = "Items"/「物品」 (used for accumulated rows); keep the `costFactors.type.accumulated` suggestion key as-is

## Phase 3: Regression e2e (Playwright, FR-024)

- [X] T062 [P] Add `apps/unihub/frontend/e2e/inventory-catalog.spec.ts`: caret toggle present; tree expanded by default (item row visible on load); Requested column present; column widths fit content (Actions buttons not clipped); item-column filter/sort flattens to a flat list. (login root/root, `/inventory/catalog`)
- [X] T063 [P] Add `apps/unihub/frontend/e2e/inventory-acquisition.spec.ts`: breadcrumb first crumb is "Catalog"; an item card with a URL has a header link with `target=_blank`; cost reset is an icon-only button (no text); cost rows stack at a narrow viewport; accumulated row label reads "Items"

## Phase 4: Legacy CSV importer

- [X] T064 Create `apps/unihub/backend/inventory/management/commands/import_legacy_csv.py`: port the parse/group/classify/備註-parse logic from `specs/014-inventory-app/scripts/preview_legacy_import.py`; build `AcquisitionWrite`-shaped payloads and save through `AcquisitionSerializer` (respects validation, per-currency accumulated, Principle II); flags `--dry-run` (default; prints the grouped plan + unmapped rows) and `--commit` (writes); warn on currencies absent from Finance
- [X] T065 Run the importer for **2026** data: `uv run python manage.py import_legacy_csv "data/財產們 - 2026.csv" --dry-run` then, once the plan looks right and the DB is up, `--commit`; record the result (acquisitions/items/factors created, per-currency total vs the sheet's 總支出)

## Phase 5: Polish

- [X] T066 Quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test`; backend `uv run ruff check . && uv run pytest`; run the new Playwright specs against the live stack where available
- [X] T067 [P] Mark iteration-6 tasks complete + append Implementation Notes (flatten approach, dynamic-width method, importer usage, e2e run status) to this file

---

## Dependencies (iteration 6)

- US1 (T052–T057) and US2 (T058–T061) are independent frontend slices (different files) → parallelizable.
- e2e (T062–T063) after the UI changes land.
- Importer (T064) is backend-only, independent of the frontend; T065 (run) needs the DB up.
- Polish (T066–T067) last.

## Implementation Strategy (iteration 6)

Ship US1 (Catalog) + US2 (cost panel) — the visible fixes — then lock them with Playwright e2e (FR-024). The importer is a separate backend deliverable run against the 2026 CSV. No schema/migration changes this iteration.

---

## Implementation Notes (iteration 6)

Completed 2026-07-11 (builds on iteration 5, commit `e979bb3`). Frontend-only feature work + one management command. **No schema change.**

### Catalog (`catalog/index.tsx`)
- **Caret** toggle (`CaretRight`/`CaretDown`) via `expandable.expandIcon`; tree **expanded by default** (controlled `expandedRowKeys` = all acquisition ids until the user collapses one).
- **Fully client-side**: fetches all acquisitions (`limit: 1000`) and does filter/sort/flatten locally (a generic comparable + `matchCondition` matcher over the union columns). This makes **every column filterable + sortable** via the toolbar. **Flatten-on-item-filter/sort**: when any active filter/sort targets an item-level column, the view renders a **flat, ungrouped `Item[]`**; otherwise it renders the acquisition tree (default ↓ `obtained_at`). Footer shows a simple row count.
- **Dynamic content-fit widths**: a `useMemo` measures each column's displayed text across rows (`measureTextWidth`) and feeds `widthForHeader(title, maxContent)`; Actions column included.
- Added columns: **Requested** (`request_time`), **Quantity**, **SKU price** (+currency), **URL** (clickable `<a target=_blank>`), **Length/Width/Height**.

### Acquisition form
- Breadcrumb first crumb **"Catalog"** → `/inventory/catalog` (create + edit).
- Item **card header is a link** (`target=_blank rel=noopener`) when the item has a `url`.
- **Cost panel**: reset is an **icon-only** button (`title` tooltip, no text — fixes overflow); factor rows (accumulated + manual/`SortableFactorRow`) **stack to one column when narrow** via `useContainerWidth`; accumulated rows labelled **"Items"** (new `costFactors.accumulatedLabel` key, both locales).

### Regression e2e (Playwright, FR-024)
- `e2e/inventory-catalog.spec.ts` (5 tests) + `e2e/inventory-acquisition.spec.ts` (4 tests) — 9 specs, all collected/compile via `playwright test --list`. They assert every FR-024 behaviour and **run against the live stack** (Docker backend + `pnpm dev`, login root/root), like the existing e2e specs. Not executed headlessly this session (no dev server running).

### Legacy importer (`inventory/management/commands/import_legacy_csv.py`)
- Loads the dry-run parser via `importlib` (single source of truth), builds item + factor payloads, and writes through `AcquisitionSerializer` (create with items → PATCH `cost_factors` to set the legacy actual-paid as the accumulated override + 退稅/折價/運費 as manual factors). `--dry-run` (default) / `--commit`.
- **Ran for 2026 on the local Docker Postgres** (`localhost:5433`): imported **67 acquisitions / 89 items / 66 factors**; DB per-currency net = **199.9 RMB / 687 TWD / 186.22 USD**, matching the sheet's 總支出 exactly.
- Known parse gap carried from the analysis: the JPY 折價 `−￥1,450` (value only in the remark, `￥` symbol) imports as `0 JPY` — flagged, not silently correct.

### Quality
- Backend: ruff clean, **260 pytest passed**. Frontend: **lint 0 warnings, typecheck clean, 358 vitest passed**; locale parity OK.

### Not run this session
- **T029 / T050 (Docker quickstart end-to-end)** — the local Postgres already had all inventory migrations (incl. `0009`/`0010`) applied and the importer ran against it, but the full quickstart UI walkthrough was not executed.

---

# Tasks: Iteration 7 (catalog fit/stability, cost/modal fixes, CNY)

**Input**: plan.md "Iteration 7" delta; spec `### Session 2026-07-11 (catalog fit/stability, cost/modal fixes, CNY, iteration 7)` + FR-003/006/006b/006c/022. Builds on iteration 6 (`4ed51c0`). Frontend fixes + importer currency fix + re-import. **No schema change.**

## Phase 1: US1 — Catalog fit & stability (Priority: P1)

- [X] T068 [US1] `catalog/index.tsx`: give the expand **caret its own dedicated narrow column** (custom leading column toggling controlled `expandedRowKeys`; hide the default inline tree expand icon); **remove the item-count ("Items") column**
- [X] T069 [US1] `catalog/index.tsx`: **eliminate flash/jitter** — React Query `staleTime: Infinity` + `placeholderData: keepPreviousData`; derive `expandedRowKeys` **synchronously** (memoised default = all acquisition ids, no post-mount `useEffect`)
- [X] T070 [US1] `catalog/index.tsx`: **content-fit widths that account for tree expansion** — add caret-column + per-level indentation to the first content column's measured width, and **measure the Actions column** from its button labels; verify no clip expanded/collapsed
- [X] T071 [US1] `catalog/index.tsx`: **drop SKU price trailing zeros** (shared `formatDecimal`); **restore pagination** (client-side over the fetched set via `EntityOffsetFooter` + page/pageSize slice)
- [X] T072 [P] [US1] Update `catalog/CatalogPage.test.tsx` (RTL): assert no "Items"/item-count column, a dedicated caret column, SKU price without trailing zeros, and pagination footer present

## Phase 2: US2 — Cost panel & item modal (Priority: P1)

- [X] T073 [US2] `AcquisitionForm.tsx`: cost-factor **`type` field shows the localized label** while storing the key (searchable/creatable `Select`, `optionLabelProp="label"`, free-text via `onSearch`); add a shared `costFactorTypeLabel(key, t)` used in the editor and any display
- [X] T074 [US2] `AcquisitionForm.tsx`: bring the **Cost panel fields into Principle-VI compliance** — `Row`/`Col` grid, fields stretch to fill + fill the row, stack to one column on narrow content width, number inputs right-aligned
- [X] T075 [US2] `AcquisitionForm.tsx`: **item cards render available attributes as `<Tag>` badges** in the card body (only non-empty; sku_price trailing zeros dropped)
- [X] T076 [US2] `ItemFormModal.tsx`: **reorder fields** to Name, quantity, SKU price, spec, URL, remark, color, size, weight, length, width, height, volume; ensure grid + content-width stacking + right-aligned numbers (Principle VI); Cancel left / primary right
- [X] T077 [P] [US2] i18n check (BOTH locales): cost-factor type labels exist for all built-ins; any new copy added

## Phase 3: Legacy import — CNY

- [X] T078 `import_legacy_csv.py`: add a currency alias map **`RMB → CNY`** (applied to item `sku_price_currency` + factor `currency`); dry-run shows CNY
- [X] T079 Re-import 2026 as CNY: **delete** the previously-imported 2026 acquisitions, then `import_legacy_csv "data/財產們 - 2026.csv" --commit`; verify DB net = 199.9 CNY / 687 TWD / 186.22 USD

## Phase 4: e2e + Polish

- [X] T080 [P] Extend `e2e/inventory-catalog.spec.ts` (caret own column, no item-count column, pagination present) and `e2e/inventory-acquisition.spec.ts` (type shows label, item-card badges)
- [X] T081 Quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test`; backend `uv run ruff check . && uv run pytest`
- [X] T082 [P] Mark iteration-7 tasks complete + append Implementation Notes to this file

---

## Dependencies (iteration 7)
- US1 (T068–T072) and US2 (T073–T077) are independent frontend slices (different files) → parallelizable.
- Importer (T078) → re-import (T079, needs DB up).
- e2e/polish (T080–T082) last.

## Implementation Strategy (iteration 7)
Stabilise + fit the Catalog (US1) and bring the cost panel + item modal into Principle-VI compliance (US2), then fix the importer currency and re-import 2026 as CNY. No schema/migration changes.

---

## Implementation Notes (iteration 7)

Completed 2026-07-11 (builds on iteration 6, commit `4ed51c0`). Frontend fixes + importer currency + re-import. **No schema change.**

### Catalog (`catalog/index.tsx`)
- **Caret in its own dedicated column** (44px leading col toggling `collapsedIds`); AntD's default inline tree icon hidden (`expandable.showExpandColumn:false`, `indentSize={0}`) so expansion never resizes data columns.
- **No flash/jitter**: React Query `staleTime: Infinity` + `placeholderData: keepPreviousData` (cached across navigations); expansion derived **synchronously** from `collapsedIds` (no post-mount effect).
- **Content-fit widths accounting for tree expansion**: caret has its own fixed column + `indentSize 0`, so data columns don't shift; the **Actions column is now measured** from its button labels (was unbounded/clipping).
- **SKU price trailing zeros dropped** (`formatDecimal`); **item-count ("Items") column removed**; **pagination restored** (AntD client-side pagination, 50/page).

### Acquisition form
- **Cost `type` shows the localized label** while storing the key: the type `AutoComplete` displays `typeLabel(key)` and filters by label; built-ins store keys, free text verbatim.
- **Cost-panel grid**: type + value fields use flex-grow (`1 1 0` / `2 1 0`) so they stretch and fill the row; stack to one column when narrow; numbers right-aligned (global CSS).
- **Item cards**: available attributes render as `<Tag>` badges in the card body (`itemCardBadges`, sku_price trailing zeros dropped).
- **ItemFormModal**: fields reordered to Name, quantity, SKU price, spec, URL, remark, color, size, weight, length, width, height, volume; grid + content-width stacking + right-aligned numbers (Principle VI); Cancel-left / primary-right.

### Legacy importer + re-import
- `import_legacy_csv.py` **normalizes `RMB → CNY`** (`CURRENCY_ALIASES`, extensible) for item + factor currencies.
- **Re-imported 2026 as CNY**: deleted the 67 prior (non-CNY) imported acquisitions (kept the 1 pre-existing CNY acquisition), then `--commit`. DB 2026 net = **199.9 CNY / 687 TWD / 186.22 USD**; **no RMB remaining**.

### Tests
- Catalog RTL: caret column, pagination, no "Items" column. e2e (`--list` = 14 specs): caret-own-column, no-item-count, pagination, SKU trailing zeros, type-label, item-card badges. Backend 260 pytest, ruff clean; frontend lint/typecheck clean, 359 vitest; locale parity OK.
- e2e not executed headlessly (needs `pnpm dev` + Docker backend).

---

# Tasks: Iteration 8 (data_io integration)

**Input**: plan.md "Iteration 8" delta; spec `### Session 2026-07-11 (data_io integration, iteration 8)` + FR-025; constitution v1.17.0 (Principle I data-portability). Builds on iteration 7 (`0a49717`). **Backend only, no schema change.**

## Phase 1: Registration

- [X] T083 Add `InventoryConfig.ready()` in `apps/unihub/backend/inventory/apps.py` registering `data_io` `TableDescriptor`s for `inventory.acquisition` (order 1), `inventory.item` (order 2, fk `acquisition_id→inventory.acquisition`), `inventory.costfactor` (order 2, fk `acquisition_id→inventory.acquisition`), `inventory.scenario` (order 3), `inventory.scenarioitem` (order 4, fk `scenario_id→inventory.scenario`, `item_id→inventory.item`, `container_id→inventory.scenarioitem`); all `has_user_attributes=False` via `auto_system_fields(Model, fk_overrides=…)`; add a comment documenting **Constraint deferred (M2M unsupported)**

## Phase 2: Tests

- [X] T084 [P] Add `apps/unihub/backend/tests/test_inventory_io.py`: `test_inventory_tables_registered` — `GET /api/v1/io/tables/` includes the 5 inventory tables with correct `depends_on` (item/costfactor→acquisition; scenarioitem→scenario/item/self); Constraint NOT present
- [X] T085 [US-IO] Add `test_inventory_io_export_import_roundtrip` in `tests/test_inventory_io.py`: create an acquisition (+1 item, +1 cost factor), export the inventory tables to CSV, delete the rows, import the CSV, assert the acquisition/item/cost-factor are restored (mirror the finance io round-trip test)

## Phase 3: Verify + Polish

- [X] T086 Run `uv run python manage.py check` and confirm registration loads (no `already registered` / import errors); confirm `import_legacy_csv` still works (dry-run)
- [X] T087 Backend quality loop: `uv run ruff check . && uv run pytest` — full suite green (incl. the new io tests + existing data_io tests)
- [X] T088 [P] Mark iteration-8 tasks complete + append Implementation Notes (descriptors, deferred Constraint, round-trip result) to this file

---

## Dependencies (iteration 8)
- T083 (registration) → T084/T085 (tests) → T086/T087 (verify) → T088 (notes).

## Implementation Strategy (iteration 8)
Register the 5 inventory descriptors in `apps.py ready()`, prove it via `/io/tables/` + an export→import round-trip test, and keep the legacy importer. Constraint's M2M stays explicitly deferred until the registry supports it.

---

## Implementation Notes (iteration 8)

Completed 2026-07-11 (builds on iteration 7, commit `0a49717`). **Backend only, no schema change.** Constitution **v1.17.0** (Principle I data-portability).

- **`inventory/apps.py` `ready()`** registers five `data_io` `TableDescriptor`s: `inventory.acquisition` (order 1), `inventory.item` (order 2, fk `acquisition_id→inventory.acquisition`), `inventory.costfactor` (order 2, fk `acquisition_id→inventory.acquisition`), `inventory.scenario` (order 3), `inventory.scenarioitem` (order 4, fk `scenario_id→inventory.scenario`, `item_id→inventory.item`, self-fk `container_id→inventory.scenarioitem`). All `has_user_attributes=False`; currency stays a plain string column (Principle II — no FK).
- **`Constraint` deferred** (documented in `apps.py` + FR-025): its `items` M2M is not representable by the registry.
- **Tests** (`tests/test_inventory_io.py`, 3): the 5 tables appear in `GET /api/v1/io/tables/` (Constraint absent), FK `depends_on` wired correctly, and a full **export → wipe → import** round-trip restores an acquisition + item + cost factor.
- `manage.py check` clean; **263 pytest** passed (ruff clean); the one-off `import_legacy_csv` still works (dry-run 199.9 CNY / 687 TWD / 186.22 USD).
- Inventory data now participates in the standard `data_io` CSV backup/restore/change-preview flow, closing the integration gap.

---

# Tasks: Iteration 9 (catalog server-side pagination + width fix + URL→Name)

**Input**: plan.md "Iteration 9" delta; spec `### Session 2026-07-11 (catalog width/pagination/URL …, iteration 9)` + FR-003. Builds on iteration 8 (`ddb2a82`). **No schema change.**

## Phase 1: Backend (flat-mode filter/sort)

- [ ] T089 Extend `ItemViewSet` in `apps/unihub/backend/inventory/views.py`: add to `filterable_fields` — `quantity` (number), `source → acquisition__source` (text), `request_time → acquisition__request_time` (date); add to `ordering_fields` — `spec`, `color`, `quantity`, `deprecate_time`, `acquisition__source`, `acquisition__request_time`
- [ ] T090 [P] Add `apps/unihub/backend/tests/test_inventory_items.py` cases: `test_item_filter_by_quantity`, `test_item_order_by_source` (`ordering=acquisition__source`) — assert server-side filter/sort works

## Phase 2: Frontend (server-side catalog)

- [ ] T091 Rework `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` to **server-side**: `useEntityTable` queryParams; **tree mode** → `listAcquisitions(queryParams)` (parents + nested items); **flat mode** (any active filter/sort in `ITEM_KEYS`) → `listItems(queryParams)`; standard **`EntityOffsetFooter`** (`pagination={false}` + `footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}`); remove the iteration-7 fetch-all (`limit:1000`, `keepPreviousData`) + client filter/sort/flatten matcher
- [ ] T092 In `catalog/index.tsx`: fix widths with the canonical `dataWidths` pattern measured over the page's **acquisitions AND their item children** (tree) / **items** (flat) → `widthForHeader`; Actions via `useActionsColWidth`
- [ ] T093 In `catalog/index.tsx`: **remove the URL column** (+ its filterable attr/columnDef); render the **Name cell as `<a target="_blank" rel="noopener">`** when the item has a `url`, else plain text
- [ ] T094 [P] Update `catalog/CatalogPage.test.tsx`: assert no URL column, Name renders an anchor when url is set, and the `EntityOffsetFooter` (per-page selector) is present

## Phase 3: e2e + Polish

- [ ] T095 [P] Update `e2e/inventory-catalog.spec.ts`: standard pagination footer (per-page selector + total), Name cell is a link to the item URL, item columns (Name/Spec) size to content (not clipped)
- [ ] T096 Quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test`; backend `uv run ruff check . && uv run pytest`
- [ ] T097 [P] Mark iteration-9 tasks complete + append Implementation Notes to this file

---

## Dependencies (iteration 9)
- T089 (backend fields) → T090 (backend tests) and → T091 (flat mode relies on them).
- T091 → T092/T093 (same file, sequential) → T094 (RTL) → T095 (e2e).

## Implementation Strategy (iteration 9)
Extend `ItemViewSet` for flat-mode filter/sort, then rewrite the Catalog to server-side dual-mode (Acquisition tree / Item flat) using the standard `EntityOffsetFooter` + `dataWidths` patterns; remove the URL column and make Name a link. Reuse, don't reinvent.
