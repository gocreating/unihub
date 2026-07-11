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
