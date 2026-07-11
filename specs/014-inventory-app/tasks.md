---
description: "Task list for Inventory App implementation"
---

# Tasks: Inventory App

**Input**: Design documents from `/specs/014-inventory-app/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/inventory-api.md](contracts/inventory-api.md)

**Tests**: Backend tests are REQUIRED and written test-first (Constitution Principle V — red→green, `test_<function>_<scenario>` naming, happy + error path per endpoint). Frontend tests are part of the quality loop.

**Organization**: Tasks are grouped by the 5 user stories from spec.md so each can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 for user-story phases; Setup/Foundational/Polish have no story label

## Path Conventions

Web app in the unihub monorepo:
- Backend: `apps/unihub/backend/inventory/`, tests in `apps/unihub/backend/tests/`
- Frontend: `apps/unihub/frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the empty `inventory` domain app and wire it into the project (Domain Addition Protocol steps 1–2). No models yet.

- [x] T001 Create backend app skeleton: `apps/unihub/backend/inventory/__init__.py`, `apps.py` (`InventoryConfig`), empty `models.py`, `serializers.py`, `views.py`, `urls.py` (empty `DefaultRouter`), and `migrations/__init__.py`
- [x] T002 Register the app: add `"inventory",` to `INSTALLED_APPS` in `apps/unihub/backend/unihub/settings.py` and add `path("api/v1/inventory/", include("inventory.urls"))` to `apps/unihub/backend/unihub/urls.py`
- [x] T003 [P] Add the Inventory nav section (collapsible, level-1 icon `<InboxOutlined />`, `menu.inventory.*` labels via `t({id})`) in `apps/unihub/frontend/src/components/AppShell/AppShell.tsx` and register placeholder `/inventory/*` routes in `apps/unihub/frontend/src/App.tsx`
- [x] T004 [P] Create the frontend service stub `apps/unihub/frontend/src/services/unihub-backend/inventory.ts` (`API_BASE_URL` import, empty exports) and export it from `apps/unihub/frontend/src/services/unihub-backend/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test scaffolding used by every story's backend tests.

**⚠️ CRITICAL**: Must complete before user-story test tasks can run.

- [x] T005 Add shared pytest fixtures for an authenticated DRF API client and DB access in `apps/unihub/backend/tests/conftest.py` (reuse existing fixtures if present; add an `inventory`-scoped one only if missing)
- [x] T006 [P] Add the `menu.inventory` and `pages.inventory` namespace roots (section + page titles) to `apps/unihub/frontend/src/locales/en-US/{menu.ts,pages.ts}` AND `apps/unihub/frontend/src/locales/zh-TW/{menu.ts,pages.ts}` (both locales, same commit — Principle VIII)

**Checkpoint**: App is wired and testable — user stories can begin.

---

## Phase 3: User Story 1 - Catalog and manage items (Priority: P1) 🎯 MVP

**Goal**: A searchable, filterable catalog where the user creates, edits, archives, and browses stockable/consumable items with rich attributes.

**Independent Test**: Create several items with varied attributes, edit one, archive one (confirm it leaves the default list and returns under the archived filter), and search/sort/filter the catalog table — no other story required.

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [x] T007 [P] [US1] Write item CRUD/validation tests in `apps/unihub/backend/tests/test_inventory_items.py`: `test_create_item_missing_name_returns_400`, `test_create_item_negative_weight_returns_400`, `test_create_item_defaults_stockable`, `test_update_item_quantity`, `test_list_items_excludes_archived`, `test_archive_item_sets_archived_at`, `test_list_archived_filter_returns_archived`

### Implementation for User Story 1

- [x] T008 [US1] Create the `Item` model (all fields per data-model.md **except** the `acquisition` FK, added in US2) in `apps/unihub/backend/inventory/models.py`
- [x] T009 [US1] Generate the initial schema migration: `uv run python manage.py makemigrations inventory` → `apps/unihub/backend/inventory/migrations/0001_initial.py`
- [x] T010 [US1] Add the Item system-attribute seed data migration `apps/unihub/backend/inventory/migrations/0002_seed_item_system_attrs.py` (mirror `finance/migrations/0002_seed_account_system_attrs.py`; seed `is_system=True` AttributeDefinitions for all Item user-facing fields with `display_order`, plus a reverse `unseed`)
- [x] T011 [P] [US1] Implement `ItemSerializer` (all writable fields; `archived_at` read/writable for archive; validation for `name` non-blank and non-negative numerics) in `apps/unihub/backend/inventory/serializers.py`
- [x] T012 [US1] Implement `ItemViewSet` in `apps/unihub/backend/inventory/views.py`: `ModelViewSet` with `EntityFilterBackend`+`NullsOrderingFilter`, `EntityOffsetPagination`, `filterable_fields`/`ordering_fields` (per data-model.md), `http_method_names` without `put`, custom `get_queryset` for the `?archived` filter, and a guarded `destroy` (reference-count summary + `?confirm=true`) matching `AccountViewSet.destroy`
- [x] T013 [US1] Register `items` on the router in `apps/unihub/backend/inventory/urls.py`; run tests T007 to green (`uv run pytest tests/test_inventory_items.py`)
- [x] T014 [US1] Regenerate the OpenAPI schema and frontend types into `apps/unihub/frontend/src/generated/` (Principle IV — no hand-written types)
- [x] T015 [P] [US1] Implement item service functions (list/create/update/archive/delete, query key `['inventory','items']`) in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`
- [x] T016 [US1] Build the Items list page `apps/unihub/frontend/src/pages/inventory/items/ItemsPage.tsx` using `PageTable` + `EntityToolbar`/`useEntitySort`/`useEntityFilter`/`useColumnConfig` (Principles VII, XII: apply-gate, `makeSortProps`, `panelApplyCount` in `key`); enum cells (`item_type`, `status`) in `<Tag>`, datetime dual-display, `—` empty placeholder (Principle VI)
- [x] T017 [P] [US1] Build the item create/edit modal form `apps/unihub/frontend/src/pages/inventory/items/ItemFormModal.tsx` (all attributes; type = single-select)
- [x] T018 [US1] Wire the archived-items filter toggle and the archive action into `ItemsPage.tsx`
- [x] T019 [US1] Wire the delete action with a `Modal.confirm` (`okType:'danger'`, localized title/body) handling the backend reference-count gate response in `ItemsPage.tsx` (Dev Constraint — delete confirmation)
- [x] T020 [P] [US1] Add all `pages.inventory.items.*` keys to both `en-US` and `zh-TW` `pages.ts` locale files
- [x] T021 [P] [US1] Add a Vitest component test for the Items page (renders rows, opens create modal) in `apps/unihub/frontend/src/pages/inventory/items/ItemsPage.test.tsx`

**Checkpoint**: US1 fully functional — items catalog is a shippable MVP.

---

## Phase 4: User Story 2 - Record acquisitions (Priority: P2)

**Goal**: Record how items were obtained (purchase/gift/transfer/found/other, optional), link items to an acquisition, and view provenance + aggregated cost; items may have no acquisition (unknown origin).

**Independent Test**: Create a purchase (with cost) and a gift (no cost), link items, confirm each acquisition lists its items with an aggregated total and each linked item shows its origin; an item with no acquisition shows "unknown origin"; deleting an acquisition preserves items.

### Tests for User Story 2 (write first) ⚠️

- [x] T022 [P] [US2] Write acquisition tests in `apps/unihub/backend/tests/test_inventory_acquisitions.py`: `test_create_acquisition_links_items`, `test_acquisition_total_item_cost`, `test_acquisition_has_arrived_flag`, `test_delete_acquisition_preserves_items`, `test_remove_item_link_preserves_item`, `test_item_without_acquisition_origin_unknown`, `test_optional_method_blank_allowed`

### Implementation for User Story 2

- [x] T023 [US2] Create the `Acquisition` model and add the nullable `Item.acquisition` FK (`SET_NULL`) in `apps/unihub/backend/inventory/models.py`
- [x] T024 [US2] Generate migration `apps/unihub/backend/inventory/migrations/0003_acquisition.py` and add the Acquisition system-attribute seed (either append to the seed migration or a new `0004_seed_acquisition_system_attrs.py`)
- [x] T025 [P] [US2] Implement `AcquisitionSerializer` (writable `item_ids`; derived read-only `item_count`, `total_item_cost`, `has_arrived`, nested `items`) in `apps/unihub/backend/inventory/serializers.py`
- [x] T026 [US2] Extend `ItemSerializer` to include the nested `acquisition` summary and derived `origin_known` in `apps/unihub/backend/inventory/serializers.py`
- [x] T027 [US2] Implement `AcquisitionViewSet` (filter/sort per data-model.md; `destroy` nulls linked items) and register `acquisitions` in `apps/unihub/backend/inventory/urls.py`; run T022 to green
- [x] T028 [US2] Regenerate OpenAPI + frontend types into `apps/unihub/frontend/src/generated/`
- [x] T029 [P] [US2] Add acquisition service functions (query key `['inventory','acquisitions']`) in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`
- [x] T030 [US2] Build the Acquisitions list page `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionsPage.tsx` (PageTable + EntityToolbar; `method` in `<Tag>`, arrival status distinguishable, delete confirm modal)
- [x] T031 [P] [US2] Build the acquisition create/edit modal with multi-item linking `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionFormModal.tsx`
- [ ] T032 [US2] Surface the originating acquisition (or "unknown origin") in the item detail/edit view in `apps/unihub/frontend/src/pages/inventory/items/`
- [x] T033 [P] [US2] Add all `pages.inventory.acquisitions.*` keys to both `en-US` and `zh-TW` `pages.ts`

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 - Define scenarios and build preparation checklists (Priority: P2)

**Goal**: Create a scenario, select its items, and work through a generated preparation checklist with live progress and consumable-shortfall flags.

**Independent Test**: Create a scenario, add items, toggle `prepared` and watch the outstanding count fall to 0/complete, and set a consumable's required quantity above on-hand to see a shortfall.

### Tests for User Story 3 (write first) ⚠️

- [x] T034 [P] [US3] Write scenario/checklist tests in `apps/unihub/backend/tests/test_inventory_scenarios.py`: `test_create_scenario_requires_name`, `test_add_scenario_item_duplicate_returns_400`, `test_toggle_prepared_updates_progress`, `test_checklist_complete_when_all_prepared`, `test_checklist_reports_consumable_shortfall`, `test_empty_scenario_checklist_returns_empty`

### Implementation for User Story 3

- [x] T035 [US3] Create the `Scenario` and `ScenarioItem` models (ScenarioItem **without** the `container` FK, added in US5; include `required_quantity`, `prepared`, `unique_together(scenario,item)`) in `apps/unihub/backend/inventory/models.py`
- [x] T036 [US3] Generate migration `apps/unihub/backend/inventory/migrations/0005_scenario_scenarioitem.py` and add the Scenario system-attribute seed
- [x] T037 [P] [US3] Implement `ScenarioSerializer` (derived counts: `item_count`, `prepared_count`, `outstanding_count`, `complete`) and `ScenarioItemSerializer` (with derived `shortfall`) in `apps/unihub/backend/inventory/serializers.py`
- [x] T038 [US3] Implement the checklist computation (progress + per-line shortfall; `violations: []` placeholder until US4) as a helper in `apps/unihub/backend/inventory/services.py`
- [x] T039 [US3] Implement `ScenarioViewSet` (CRUD + `checklist` action `GET /scenarios/{id}/checklist/`) and `ScenarioItemViewSet` (nested list/create/patch/delete with duplicate + prepared handling) in `apps/unihub/backend/inventory/views.py`
- [x] T040 [US3] Register `scenarios` and nested `scenarios/{id}/items/` routes in `apps/unihub/backend/inventory/urls.py`; run T034 to green
- [x] T041 [US3] Regenerate OpenAPI + frontend types into `apps/unihub/frontend/src/generated/`
- [x] T042 [P] [US3] Add scenario + scenario-item + checklist service functions (query keys `['inventory','scenarios']`, `['inventory','scenario',id,'checklist']`) in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`
- [x] T043 [US3] Build the Scenarios list page `apps/unihub/frontend/src/pages/inventory/scenarios/ScenariosPage.tsx` (PageTable + EntityToolbar; readiness counts; delete confirm modal)
- [x] T044 [US3] Build the Scenario detail page `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.tsx` with the checklist panel: add/remove items, `prepared` toggle, progress summary, shortfall indicator (embedded table uses `ProTable ghost` if inside a card — Principle XI)
- [x] T045 [P] [US3] Add all `pages.inventory.scenarios.*` keys to both `en-US` and `zh-TW` `pages.ts`
- [ ] T046 [P] [US3] Add a Vitest test for the checklist progress/toggle behavior in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.test.tsx`

**Checkpoint**: US1–US3 independently functional; scenarios become actionable.

---

## Phase 6: User Story 4 - Enforce constraints on scenarios (Priority: P3)

**Goal**: Attach packing rules (mutual-exclusive, required, weight-limit) to a scenario and surface violations against the current selection.

**Independent Test**: Add a mutual-exclusivity and a required constraint, adjust the selection to trigger and clear each violation, and exceed a weight limit to see the overage amount.

### Tests for User Story 4 (write first) ⚠️

- [x] T047 [P] [US4] Write constraint tests in `apps/unihub/backend/tests/test_inventory_constraints.py`: `test_mutual_exclusive_requires_two_items`, `test_weight_limit_requires_limit_value`, `test_required_needs_items_or_category`, `test_mutual_exclusive_violation_flagged`, `test_required_constraint_unsatisfied_flagged`, `test_weight_limit_overage_reports_amount`, `test_all_constraints_satisfied_no_violations`

### Implementation for User Story 4

- [x] T048 [US4] Create the `Constraint` model (`constraint_type`, M2M `items`, `target_category`, `limit_value`, per-type validation) in `apps/unihub/backend/inventory/models.py`; migration `apps/unihub/backend/inventory/migrations/0006_constraint.py`
- [x] T049 [P] [US4] Implement `ConstraintSerializer` with type-specific validation (mutual_exclusive ≥2 items; required needs items xor category; weight_limit needs `limit_value>0`) in `apps/unihub/backend/inventory/serializers.py`
- [x] T050 [US4] Implement the constraint-evaluation function (returns `{constraint_id,type,message,offending_item_ids?,overage?}` list) in `apps/unihub/backend/inventory/services.py`
- [x] T051 [US4] Integrate evaluation into the scenario `checklist` endpoint `violations` field (replace the US3 placeholder) in `apps/unihub/backend/inventory/views.py`
- [x] T052 [US4] Implement the nested `ConstraintViewSet` and register `scenarios/{id}/constraints/` routes in `apps/unihub/backend/inventory/urls.py`; run T047 to green
- [x] T053 [US4] Regenerate OpenAPI + frontend types; add constraint service functions in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`
- [x] T054 [US4] Build the constraints panel in `ScenarioDetail.tsx`: add/edit/delete constraints (type-aware form), render violations from the checklist response (delete confirm modal)
- [x] T055 [P] [US4] Add all `pages.inventory.constraints.*` keys to both `en-US` and `zh-TW` `pages.ts`

**Checkpoint**: US1–US4 independently functional; scenario planning is rule-aware.

---

## Phase 7: User Story 5 - Plan item packing and review positions (Priority: P3)

**Goal**: Nest items into containers (item-in-item) per scenario and review each item's position (storage location or containing container) and status; prevent self-containment and cycles.

**Independent Test**: Nest one item inside another, review the container's contents and the child's position, and confirm self-containment/cycles are rejected.

### Tests for User Story 5 (write first) ⚠️

- [x] T056 [P] [US5] Write containment tests in `apps/unihub/backend/tests/test_inventory_containment.py`: `test_set_container_nests_item`, `test_set_container_self_reference_returns_400`, `test_set_container_rejects_cycle`, `test_set_container_cross_scenario_returns_400`, `test_delete_container_line_resets_children_to_top_level`, `test_checklist_line_reports_container`

### Implementation for User Story 5

- [x] T057 [US5] Add the nullable self-referential `container` FK (`SET_NULL`) to `ScenarioItem` in `apps/unihub/backend/inventory/models.py`; migration `apps/unihub/backend/inventory/migrations/0007_scenarioitem_container.py`
- [x] T058 [US5] Add same-scenario + acyclic validation (walk the parent chain, reject self/cycle/cross-scenario with 400) in `ScenarioItemSerializer`/viewset in `apps/unihub/backend/inventory/serializers.py`
- [x] T059 [US5] Include the `container` summary in checklist lines and reset children to top-level on line delete in `apps/unihub/backend/inventory/{services.py,views.py}`; run T056 to green
- [x] T060 [US5] Regenerate OpenAPI + frontend types into `apps/unihub/frontend/src/generated/`
- [x] T061 [P] [US5] Add container-assignment service calls (PATCH `container_id`) in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts`
- [x] T062 [US5] Build the containment UI in `ScenarioDetail.tsx`: assign a line into a container, render the multi-level containment tree, and handle the cycle-rejection error message
- [x] T063 [US5] Add a position-review surface (per item: storage location or containing container + status) in the Scenario detail (and/or item view) in `apps/unihub/frontend/src/pages/inventory/`
- [x] T064 [P] [US5] Add all `pages.inventory.packing.*` keys to both `en-US` and `zh-TW` `pages.ts`
- [ ] T065 [P] [US5] Add a Vitest test for the containment tree / cycle-rejection handling in `apps/unihub/frontend/src/pages/inventory/scenarios/`

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality-loop enforcement, verification, and cleanup across all stories.

- [x] T066 Run the backend quality loop from `apps/unihub/backend/`: `uv run ruff format . && uv run ruff check . --fix && uv run pytest` (all inventory tests green; type hints + docstrings on all new functions per Principle V)
- [x] T067 Run the frontend quality loop from `apps/unihub/frontend/`: `pnpm lint` (zero warnings) `&& pnpm typecheck` (strict, no `any`) `&& pnpm test`
- [x] T068 [P] Verify locale parity: every `menu.inventory.*` / `pages.inventory.*` key exists in BOTH `en-US` and `zh-TW` (Principle VIII)
- [x] T069 [P] Regression check (Principle II): confirm Finance and other existing domains still load and function after the additive changes
- [x] T070 Confirm the OpenAPI schema at `/api/docs/` reflects all inventory endpoints and that `apps/unihub/frontend/src/generated/` is in sync (Principle IV)
- [ ] T071 Execute the manual acceptance walkthrough in [quickstart.md](quickstart.md) (all 5 user-story scenarios) and confirm SC-001…SC-008 from spec.md
- [x] T072 [P] Final cleanup: remove dead scaffolding, ensure delete-confirmation modals on every destructive action, and verify datetime dual-display + `—` empty placeholders across all inventory tables (Principle VI)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — blocks story tests.
- **User Stories (Phase 3–7)**: each depends on Foundational. US1 is the MVP and is fully independent. US2/US3 build on the Item model but are independently testable. US4 extends the US3 checklist endpoint (evaluation). US5 extends the US3 `ScenarioItem` model (container). So US4 and US5 depend on US3; US2 depends only on US1's Item model.
- **Polish (Phase 8)**: depends on all desired stories.

### User Story Dependencies

- **US1 (P1)**: independent — MVP.
- **US2 (P2)**: needs the `Item` model from US1 (adds `Item.acquisition` FK). Independently testable.
- **US3 (P2)**: needs the `Item` model from US1. Independent of US2.
- **US4 (P3)**: extends US3's scenario checklist endpoint with constraint evaluation.
- **US5 (P3)**: extends US3's `ScenarioItem` with containment.

### Within Each User Story

- Backend tests (written first, must FAIL) → models → migrations/seed → serializers → viewsets/routes → OpenAPI regen → frontend service → pages/components → i18n.
- Models before services; services before endpoints; endpoints before frontend.

### Parallel Opportunities

- Setup: T003 and T004 in parallel (frontend) while T001/T002 (backend) proceed.
- Once Foundational is done, **US1, US2, US3 can be staffed in parallel** by separate developers (US2 coordinates the `Item.acquisition` FK migration with US1). US4 and US5 start once US3's checklist/ScenarioItem exist.
- Within a story, `[P]` tasks touch different files (e.g., serializer vs. service vs. locale) and can run together.

---

## Parallel Example: User Story 1

```bash
# 1. Write the tests first (single file, then run — must fail):
Task: T007 item CRUD/validation tests in tests/test_inventory_items.py

# 2. After the model + endpoints exist, these touch different files — run together:
Task: T011 ItemSerializer in inventory/serializers.py
Task: T015 item service in frontend services/unihub-backend/inventory.ts
Task: T017 ItemFormModal.tsx
Task: T020 pages.inventory.items.* locale keys
Task: T021 ItemsPage.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP and VALIDATE**: exercise the Items catalog independently (create/edit/archive/search).
3. Ship the item catalog as the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 (Items) → test → ship MVP.
3. US2 (Acquisitions) → test → ship.
4. US3 (Scenarios + checklists) → test → ship.
5. US4 (Constraints) → test → ship.
6. US5 (Packing + positions) → test → ship.
   Each story adds value without breaking the previous ones.

---

## Implementation Notes (2026-07-11)

Delivered via `/speckit-implement`. **68 / 72 tasks complete.** Backend: 35 new tests, full suite 236 passing, ruff clean. Frontend: ESLint (0 warnings) + strict typecheck clean; all inventory tests pass (one pre-existing flaky *finance* test, `BalanceSheetEditPage`, fails only under full-suite load and passes in isolation — unrelated to this feature).

Intentional deviations from the literal task text (outcome achieved, approach differs):
- **Migrations combined**: all five models live in `0001_initial.py` and all system-attribute seeds in `0002_seed_system_attrs.py` (single implementer, sequential) rather than one migration per story (resolves analyze finding F1). `makemigrations --check` reports no missing migrations.
- **Form modals inline**: item/acquisition/scenario create-edit forms are colocated inside each page's `index.tsx` rather than separate `*FormModal.tsx` files (T017/T031).
- **`Item.category` field added**: concretely resolves analyze finding I1 (the `required`-constraint category semantics) — `target_category` matches `Item.category`.
- **C1 resolved**: scenario-item removal and container reassignment in the Scenario detail use `Modal.confirm(okType:'danger')`.
- **i18n**: packing/containment strings live under the `pages.inventory.scenarios.detail.*` namespace (not a separate `packing.*` one).

Still open (4 tasks):
- **T032** — the item edit modal does not yet surface the originating acquisition as a field (data is exposed via `acquisition_detail`/`origin_known` and shown on the Acquisitions page).
- **T046 / T065** — optional Vitest tests for the Scenario detail checklist and containment tree were not added (backend behavior is covered by pytest).
- **T071** — the manual quickstart walkthrough / SC-001…SC-008 sign-off requires a running stack and was not executed in this session.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks.
- `[Story]` label maps each task to a spec user story for traceability.
- Backend tests are written first and must fail before implementation (Principle V).
- Regenerate frontend types from OpenAPI after every backend contract change (Principle IV) — never hand-write response types.
- Every destructive action needs a `Modal.confirm` with `okType:'danger'` and localized copy (Dev Constraint).
- Add i18n keys to both locales in the same commit (Principle VIII).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
