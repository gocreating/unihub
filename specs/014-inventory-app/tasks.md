---
description: "Task list for Inventory App — Iteration 18 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 18 (Item alias, scenario actions relocation, organize DnD unification)

**Input**: [plan.md](plan.md) (iteration 18), [spec.md](spec.md) — FR-030 new; FR-001/003/003a/006/010/011 revised. Constitution **v1.20.0**.

**Tests**: REQUIRED — test-first on both sides (pytest before the alias field; pure-helper + RTL specs before the DnD/page rework).

**Baseline**: Iteration 17 shipped at `58d60e4`. Design decisions pre-confirmed (research R18.1–R18.5).

**Organization**: Foundational = backend alias + contracts (gates every alias display). US1 = alias surfaces (catalog + acquisition form). US3 = scenario list/detail rework incl. the dnd-kit unification (independent of US1 except the shared ItemName component, built in Phase 2).

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none — dnd-kit already installed)*

---

## Phase 2: Foundational (Item.alias_name + contracts + ItemName)

- [ ] T001 Write failing pytests: `apps/unihub/backend/tests/test_inventory_items.py` — alias round-trips through acquisition-item create and item PATCH (blank default); items filter by `alias_name` (contains) and order by `alias_name`; `apps/unihub/backend/tests/test_inventory_io.py` — the item descriptor's system fields include `alias_name`
- [ ] T002 Implement: `alias_name` (CharField ≤200, blank) on `Item` + migration `apps/unihub/backend/inventory/migrations/0014_item_alias_name.py`; serializer field (read/write, item + nested acquisition payloads); `alias_name` in `ItemViewSet.filterable_fields` (text) + `ordering_fields` in `apps/unihub/backend/inventory/views.py`; T001 green; backend loop green
- [ ] T003 Regenerate contracts (OpenAPI → `apps/unihub/frontend/src/generated/api-types.ts`); add `alias_name` to `Item`/`ItemWrite` in `apps/unihub/frontend/src/services/unihub-backend/inventory.ts` (delta already in `specs/014-inventory-app/contracts/inventory-api.md`)
- [ ] T004 Write failing RTL specs in `apps/unihub/frontend/src/components/ItemName/ItemName.test.tsx`: renders `name` plain when no alias; renders `alias_name` with a Tooltip carrying the original `name` when aliased; wraps in a new-tab link when `linkify` and `url`; no tooltip when not aliased — then implement `apps/unihub/frontend/src/components/ItemName/index.tsx` (T004 green)

**Checkpoint**: alias served, typed, and displayable through one shared component.

---

## Phase 3: User Story 1 — Alias surfaces (P1)

**Goal**: Alias-preferred display in the catalog Item cell and acquisition item cards; hidden Alias catalog column; alias editable in the item form.

**Independent Test**: Set an alias on an item: the catalog Item cell shows the alias with a tooltip carrying the seller name (link unchanged); the Columns dropdown lists a hidden "Alias" column that filters/sorts; the Add-Item modal offers the alias field after SKU price; the acquisition item card header shows the alias.

- [ ] T005 [US1] Write failing RTL specs: `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx` — Item cell prefers the alias (tooltip = original name) and keeps the url link; "Alias" appears (unchecked) in the Columns dropdown; `apps/unihub/frontend/src/pages/inventory/acquisitions/AcquisitionForm.test.tsx` (or the existing form spec file) — the Add-Item modal offers an alias input after SKU price and the card header shows the alias-preferred name
- [ ] T006 [US1] Implement: catalog `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` — Item-cell primary via `ItemName` (linkify); `alias_name` ColumnDef (hidden, filterable/sortable) + filterableAttrs entry; column key bump to `inventory-catalog-v6`; `AcquisitionForm.tsx` — alias form field (FR-022 order) persisted through item payloads; card headers via `ItemName`; T005 green
- [ ] T007 [P] [US1] Locales both `apps/unihub/frontend/src/locales/{en-US,zh-TW}/pages.ts`: alias field/column label + original-name tooltip label (if any), same commit
- [ ] T008 [US1] e2e: `apps/unihub/frontend/e2e/inventory-catalog.spec.ts` — Columns dropdown lists "Alias"; `apps/unihub/frontend/e2e/inventory-acquisition.spec.ts` — the Add-Item modal contains the alias input

**Checkpoint**: FR-030 satisfied on catalog + acquisition surfaces.

---

## Phase 4: User Story 3 — Scenario rework (P2)

**Goal**: List = Name+Description; detail info-panel Edit + kebab Delete; organize panel with no titles, rich no-overflow rows, and ONE dnd-kit drag system (pane↔pane, in-tree, one-motion nested drops).

**Independent Test**: The scenario list has no Actions column; opening a scenario shows Edit + ⋯ (Delete inside) on the info panel — Edit updates name/description in place, Delete confirms and returns to the list. Pane rows show alias/name (linked), spec, and parameter badges without overflowing a narrow pane. With a mouse: drag a flat item straight onto a nested position in the tree (depth indicator follows the pointer) — it lands nested; drag tree items to rearrange; drag a tree item into the flat pane to send it back. All state survives reload.

- [ ] T009 [US3] Write failing unit specs in `apps/unihub/frontend/src/pages/inventory/scenarios/organizeTree.test.ts`: `flattenOrganized` orders children under parents with correct depths; `projectDrop` clamps depth to neighbor bounds, resolves `{container_id, index}` for top-level/nested/edge positions, and excludes the active row's own subtree (cycle prevention); send-back payload unchanged
- [ ] T010 [US3] Implement `flattenOrganized`/`projectDrop` in `apps/unihub/frontend/src/pages/inventory/scenarios/organizeTree.ts` (remove the rc-tree-specific `computeDropTarget`); T009 green
- [ ] T011 [US3] Write failing RTL specs: `apps/unihub/frontend/src/pages/inventory/scenarios/ScenariosPage.test.tsx` — exactly Name + Description columns (no Actions); `ScenarioDetail.test.tsx` — info-panel Edit button opens the pre-filled form modal and PATCHes; kebab menu holds Delete → confirm → navigate + delete call; NO pane titles; pane rows render alias-preferred name (link), spec, and parameter badges inside a no-overflow flex row; organized rows render with depth indentation (flattened tree); Add-modal search request covers name OR alias OR spec
- [ ] T012 [US3] Implement: extract `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioFormModal.tsx` from the list page (list "New" + detail "Edit" share it); list page columns Name+Description; rewrite `detail.tsx` — info-panel header actions (Edit + kebab Delete w/ existing confirm, navigate on success); organize body on ONE `DndContext`: flattened depth-indented sortable organized pane + droppable flat pane, projection-driven drop indicator (row + depth), drops → `move {container_id, index, organized}`; rich `ItemName`-based rows (spec, badges) with `minWidth:0` ellipsis + pinned action; remove AntD Tree usage; T011 green
- [ ] T013 [P] [US3] Locales both `pages.ts`: remove dead pane-title keys (`organize.unorganized`/`organize.organized`); add kebab/menu labels if new; same commit
- [ ] T014 [US3] Rewrite Playwright `apps/unihub/frontend/e2e/inventory-scenario.spec.ts` with REAL mouse drags (dnd-kit = PointerEvents): list has no Actions column; detail Edit updates the name in place; kebab Delete removes and returns to list; modal-add lands in the flat pane; drag flat→nested position in one motion (persists reload, renders indented); in-tree rearrange; tree→flat send-back; narrow pane: rows don't overflow (remove button visible within pane bounds)

**Checkpoint**: FR-010/FR-011 (iteration 18) satisfied end-to-end.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T015 Full quality loops: backend `uv run ruff check . && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — zero warnings
- [ ] T016 Rebuild docker (`docker compose -f docker-compose.local.yml build backend frontend && up -d`, migration 0014 applies on boot), run ALL inventory Playwright suites, live-verify + screenshot: alias tooltip in catalog, list without Actions, detail Edit/kebab, rich pane rows, one-motion nested drag

---

## Dependencies & Execution Order

- **Phase 2**: T001 → T002 → T003; T004 independent of T003 (component consumes the service type loosely) but after T003 for strict typing.
- **Phase 3**: T005 → T006 (needs T003+T004); T007 [P]; T008 after T006.
- **Phase 4**: T009 → T010; T011 → T012 (needs T004+T010; T013 [P] alongside); T014 after T012.
- **Phase 5**: T015 → T016 last.

```text
T001 → T002 → T003 → T004 ─┬→ T005 → T006(+T007) → T008 ─┐
                           └→ T009 → T010 → T011 → T012(+T013) → T014 ─┴→ T015 → T016
```

## Implementation Strategy

Backend alias + the shared ItemName component land first (everything displays through them). The alias surfaces (US1) are small; the scenario rework (US3) is the bulk — pure projection helpers proven by unit tests before the page rewrite, and the e2e suite switches to real-mouse drags. Docker rebuild + live verification close the iteration.
