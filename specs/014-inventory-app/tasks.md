---
description: "Task list for Inventory App — Iteration 14 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 14 (Dynamic item parameters + scenario simplification)

**Input**: [plan.md](plan.md) (iteration 14), [spec.md](spec.md) — Session 2026-07-12 "dynamic item parameters + scenario simplification"; FR-026–FR-029 (new), FR-010–FR-017 (rewritten), US4 removed. Constitution **v1.19.0**.

**Tests**: REQUIRED — test-first (Principle V) on both sides.

**Baseline**: Iteration 13 shipped at commit `7986896`. Delta iteration; tasks modify existing files unless marked NEW. Prior task lists live in git history.

**Organization**: Foundational core work (attribute infra) blocks everything; US1 (P1) = parameters end-to-end; US3 (P2) = scenario CRUD/list/backlog; US5 (P3) = organize tree/containment. US4 (constraints) is removed as part of the scenario migration tasks.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none — existing app, no new dependencies)*

---

## Phase 2: Foundational (core attribute infrastructure + migrations + contracts)

**Purpose**: The `dimension` type, canonical numeric storage, attribute-aware filter/sort, and the schema/data migrations everything else consumes. Contract regen precedes frontend work (Principle IV).

- [X] T001 Write failing pytest for core attribute extensions in `apps/unihub/backend/tests/test_core_attributes.py` (NEW): (a) creating a `dimension` definition requires a valid `unit_family` (length|weight|volume); (b) upserting a dimension value stores `value` + `value_unit` + canonical `value_number` (e.g. 1.5 kg → 1500 g-canonical) and a numeric value stores `value_number`; (c) invalid unit for the family → 400; (d) PATCH renaming an `is_system` definition (or changing its data_type/unit_family) → 400 (Principle I guard); (e) delete-with-values count-confirm flow still works for user defs and stays blocked for system defs
- [X] T002 Move unit conversion tables/helpers from `apps/unihub/backend/inventory/units.py` to `apps/unihub/backend/core/units.py` (NEW), keeping `inventory/units.py` as a re-export shim (existing unit tests must stay green unchanged)
- [X] T003 Implement core model/API changes + migration `apps/unihub/backend/core/migrations/`: `AttributeDefinition` +`dimension` choice +`unit_family`; `AttributeValue` +`value_number` (Decimal 20,4, null) +`value_unit`; serializer exposes `unit_family`; `bulk_upsert`/value writes compute `value_number` (dimension via `core.units`, numeric via parse) and validate unit∈family / numeric parse / select options; views guard `is_system` rename/type change; T001 green
- [X] T004 Write failing pytest for attribute-aware filtering/ordering (same test file): on `ItemViewSet` (opt-in), `filters` with `attr:<definition_id>` conditions filter text (icontains) and numeric/dimension (gt/lt/eq on canonical `value_number`); `ordering=attr:<id>__nullsfirst/-attr:<id>__nullslast` orders by canonical with rows lacking the key treated as NULLs
- [X] T005 Implement `apps/unihub/backend/core/attributes.py` (NEW: `parse_attr_key`, `annotate_attribute(queryset, definition)` scalar-Subquery helper) and extend `EntityFilterBackend` + `NullsOrderingFilter` in `apps/unihub/backend/core/filters.py` to resolve `attr:` keys when the view declares `attribute_content_type`; T004 green
- [X] T006 Write failing pytest for item parameters + scenario changes: in `apps/unihub/backend/tests/test_inventory_items.py` — acquisition create with `parameters` on an item (system key weight {value, unit} + inline user-defined numeric key), read back `parameters[]` (definition_id, name, data_type, unit_family, value, unit, value_number), PATCH full-list upsert-replace (omitted key deleted), duplicate-key rejected, invalid select value rejected; in `apps/unihub/backend/tests/test_inventory_scenarios.py` — scenario create/patch with `description`; `ScenarioItem` exposes `display_order` (no `prepared`/`required_quantity`); `POST scenarios/<sid>/items/<pk>/move {container_id, index}` re-parents + rewrites dense sibling order + rejects cycles/self; DELETE re-parents children to top level; constraint & checklist endpoints are GONE (404) — delete `apps/unihub/backend/tests/test_inventory_constraints.py` and prune checklist tests from scenarios/containment test files
- [X] T007 Inventory migrations in `apps/unihub/backend/inventory/migrations/`: (1) data migration seeding the 7 system AttributeDefinitions (color/size → text; weight → dimension/weight; length/width/height → dimension/length; volume → dimension/volume; content type inventory.item) and copying each Item's concrete values into AttributeValues (`value` = display via `from_canonical`, `value_unit`, `value_number` = canonical); (2) schema migration dropping the 12 Item columns; (3) scenario migration: rename `Scenario.notes→description`, drop `ScenarioItem.prepared`/`required_quantity`, add `display_order` (backfill by created_at per scenario), delete `Constraint` (+M2M table); update `apps/unihub/backend/inventory/models.py` accordingly
- [X] T008 Rework `apps/unihub/backend/inventory/serializers.py` + `views.py` + `urls.py`: `ItemSerializer.parameters` (prefetched read; upsert-replace write incl. nested create-definition passthrough via definition_id only), remove `_MEASURES` measurement fields and color/size from serializers; `ItemViewSet` declares `attribute_content_type="inventory.item"` and prunes concrete param filter/order keys in favour of `attr:` resolution; Scenario serializers/views drop checklist/constraints/counts, gain `description`; `ScenarioItemViewSet` gains the `move` action (dense reorder + cycle check) and `display_order` in the serializer; constraint viewset/serializer/urls deleted; T006 green; backend loop (`ruff` + full `pytest`) green
- [X] T009 Update `apps/unihub/backend/inventory/apps.py` data_io descriptors (item → `has_user_attributes=True`, auto fields re-derived post-drop; scenario/scenarioitem refreshed; add an io round-trip assertion for a parameterized item in `apps/unihub/backend/tests/test_inventory_io.py`) and rewire `apps/unihub/backend/inventory/management/commands/import_legacy_csv.py` `_item_payload` to emit `parameters` instead of concrete keys
- [X] T010 Regenerate contracts: OpenAPI schema + `apps/unihub/frontend/src/generated/api-types.ts` (`openapi-typescript`); update service types in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts` (Item.parameters, ItemWrite.parameters, Scenario.description, ScenarioItem.display_order, remove Measurement fields/constraint functions, add `moveScenarioItem`) and `core.ts` (unit_family, dimension type, value_number); append the delta to `specs/014-inventory-app/contracts/inventory-api.md`

**Checkpoint**: Backend fully green with new schema; types regenerated.

---

## Phase 3: User Story 1 — Catalog and manage items with dynamic parameters (P1)

**Goal**: On-demand parameter rows in the item form; parameters drive the Catalog's Parameters column and appear as dynamic filter/sort/column options.

**Independent Test**: Create an acquisition item adding a seeded weight (kg) and a new user-defined "capacity" numeric parameter; both appear as badges on the item card and in the Catalog Parameters column; the Columns dropdown lists "capacity"; sorting by weight orders cross-unit correctly; the item form shows no fixed color/size/measurement inputs.

- [X] T011 [P] [US1] Write failing RTL specs in `apps/unihub/frontend/src/components/ParameterRowsEditor/ParameterRowsEditor.test.tsx` (NEW): renders existing rows; key select lists definitions minus keys already used; adding a row with a dimension key shows the family's unit select; "create new parameter" flow collects name + type (string/numeric/select/dimension) + unit family or options and calls the create API; removing a row works; value inputs validate per type
- [X] T012 [P] [US1] Implement `apps/unihub/frontend/src/components/ParameterRowsEditor/index.tsx` (NEW; definitions via TanStack Query on `listAttributeDefinitions('inventory.item')`, form-grid + narrow stacking per Principle VI); T011 green
- [X] T013 [US1] Rework item form + badges (RTL first in the same files' tests): `apps/unihub/frontend/src/pages/inventory/items/ItemFormModal.tsx` — fixed color/size/weight/length/width/height/volume inputs replaced by `ParameterRowsEditor` (field order Name, quantity, SKU price, spec, URL, remark, Parameters; modal conventions preserved); `apps/unihub/frontend/src/pages/inventory/itemBadges.ts` + `AcquisitionForm.tsx` cards — badges built from `parameters[]` (system keys keep compact formats; user keys `key: value unit`); update `itemBadges.test.ts` + `ItemFormModal.test.tsx` first
- [X] T014 [US1] Catalog dynamic parameters (RTL first in `CatalogPage.test.tsx` with mocked definitions): `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` — fetch Item definitions; build `filterableAttrs` + hidden-by-default `columnDefs` entries per definition (`attr:<id>` keys, dataType mapped); flatten rule treats any `attr:` key as item-level; Parameters derived column + `displayText` render from `item.parameters`; concrete color/size/measurement columns removed; per-definition columns render typed values (dimension `value unit`, right-aligned numerics)
- [X] T015 [US1] Update `apps/unihub/frontend/e2e/inventory-catalog.spec.ts` for dynamic parameter columns (dropdown lists a seeded key, e.g. Weight; badges still assert) and locale files `apps/unihub/frontend/src/locales/{en-US,zh-TW}/pages.ts` with parameter-editor strings (both locales, same commit)

**Checkpoint**: Items round-trip parameters end-to-end; catalog filter/sort/columns work per key.

---

## Phase 4: User Story 3 — Scenario assembly (list + Backlog) (P2)

**Goal**: Simplified scenarios: name+description; 3-column list; Backlog panel search-and-add.

**Independent Test**: Create a scenario with name+description; list shows exactly Name/Description/Actions; on detail, backlog search for a known fragment lists matching non-member items; adding one moves it into the Organize tree and out of backlog results.

- [X] T016 [US3] Rework scenario list (RTL first in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenariosPage.test.tsx`, NEW or updated): `apps/unihub/frontend/src/pages/inventory/scenarios/index.tsx` — columns exactly Name, Description, Actions; create/edit modal fields name + description; progress/complete/item-count columns and all constraint UI removed
- [X] T017 [US3] Scenario detail — Backlog panel (RTL first in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.test.tsx`, NEW): `detail.tsx` — two-panel layout (Backlog | Organize, content-width stacking); Backlog: debounced search input → `listItems` with OR-group filters (name/spec icontains), results exclude current members, one-click Add (top-level, end of order); checklist/constraint/progress UI deleted along with their service calls

**Checkpoint**: Scenario CRUD + membership management works without checklist/constraints.

---

## Phase 5: User Story 5 — Organize tree (containment + order) (P3)

**Goal**: Drag-and-drop packing tree persisting container + sibling order.

**Independent Test**: Drag item A onto item B → nested (survives reload); drag among siblings → order survives reload; dragging B into its own descendant is rejected with a message; removing a container re-parents its children to top level.

- [X] T018 [US5] Organize tree (RTL first in `ScenarioDetail.test.tsx`: tree renders nesting from scenario items' container/display_order; onDrop handler calls `moveScenarioItem` with correct `{container_id, index}` for nest and reorder cases; cycle rejection surfaces `message.error`; node Remove action): implement in `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx` with AntD `Tree` `draggable`+`onDrop`
- [X] T019 [US5] Add a scenario-detail Playwright spec `apps/unihub/frontend/e2e/inventory-scenario.spec.ts` (NEW): create scenario, backlog add two items, drag one into the other, reload, assert nesting persists; assert list page shows the 3 columns

**Checkpoint**: Full packing-tree flow verified end-to-end.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 Full quality loops: backend `uv run ruff format . && uv run ruff check . --fix && uv run pytest` from `apps/unihub/backend/`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from `apps/unihub/frontend/` — zero warnings; fix fallout
- [X] T021 Live-stack verification: rebuild docker backend+frontend, apply migrations, verify migrated legacy data (existing items show their parameters as badges; weight sort works cross-unit), run the Playwright suites, capture an iteration screenshot

---

## Dependencies & Execution Order

- **Phase 2 backbone (sequential)**: T001 → (T002 ∥) → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010. T002 may run parallel with T001.
- **Phase 3**: T011→T012 [P] can start once T010 lands types; T013 → T014 → T015 sequential (shared files).
- **Phase 4**: T016 [P with T013/T014], T017 after T010 (needs move/search types? — search only; move used in Phase 5).
- **Phase 5**: T018 after T017 (same file), T019 after T018.
- **Phase 6**: T020 → T021 last.

```text
T001 ─→ T003 ─→ T004 ─→ T005 ─→ T006 ─→ T007 ─→ T008 ─→ T009 ─→ T010 ─┬→ T011 → T012 → T013 → T014 → T015 ─┐
T002 ─┘                                                                ├→ T016 ──────────────┐              ├→ T020 → T021
                                                                       └→ T017 → T018 → T019 ┘──────────────┘
```

## Implementation Strategy

MVP = Phases 2+3 (parameters end-to-end — the P1 payoff); Phases 4–5 deliver the scenario redesign; Phase 6 gates the commit. Destructive migrations (column drops, Constraint drop) land only after their data migrations are test-proven; both locale files update with any new key (Principle VIII).
