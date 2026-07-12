# Implementation Plan: Inventory App — Iteration 18 (Item alias, scenario actions relocation, organize DnD unification + rich rows)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 iteration 18; FR-030 (alias) new, FR-001/003/003a/006/010/011 revisions. Constitution v1.20.0.

## Summary

1. **Item alias (FR-030)** — backend `Item.alias_name` (CharField, blank; migration 0014), serializer read/write, `alias_name` filterable/orderable on `ItemViewSet`, data_io auto pickup, OpenAPI/types regen. Frontend: a shared **`ItemName`** display component (alias-preferred text; when aliased, an informational Tooltip carries the original `name`; optional `url` link wrapping) used in the catalog Item column, acquisition item cards, scenario pane rows, and Add-modal results; hidden filterable/sortable **Alias** catalog column (column key bump → v6); Add-Item modal field after Name (FR-022 order: Name, quantity, SKU price, **alias**, spec, URL, remark); Add-modal search OR-groups extended to name/alias/spec.
2. **Scenario actions relocation** — list drops the Actions column (Name + Description; Name links to detail). Detail info-panel header: **Edit** button (opens the name/description modal form, extracted/reused from the list page) + **kebab (⋯) Dropdown holding Delete** (existing confirm; navigate back to the list on success).
3. **Organize panel polish** — pane titles removed; pane rows + modal results render rich context (ItemName link + tooltip, spec secondary, parameter badges via the existing `itemBadges` helpers); rows never overflow (flex layout, `minWidth: 0`, text ellipsis, action pinned).
4. **DnD unification (FR-011)** — replace ALL THREE drag mechanisms (AntD-Tree-internal, native HTML5 rows, cross-pane bridge) with **one dnd-kit system** (already a dependency): a single `DndContext` spans both panes; the organized tree renders as a **flattened depth-indented sortable list** (the canonical dnd-kit sortable-tree pattern) and the flat pane as a droppable list of draggables. During drag, a **projection** (over-row + horizontal offset → depth clamped between neighbor bounds) determines container/index/depth and renders live position + indentation feedback; drop calls the existing `move {container_id, index, organized}`. Pane↔pane both directions, in-tree rearrangement, and **left→nested-position in one motion** all share this path. AntD `Tree` usage is removed from the page.

## Technical Context

**Language/Version**: TypeScript 5.7, Python 3.12

**Primary Dependencies**: @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10 (already installed; used by cost-factor rows). No new packages.

**Storage**: PostgreSQL — migration 0014 (`Item.alias_name`). No ScenarioItem change (`move` API unchanged).

**Testing**: pytest (alias round-trip/filter/order, data_io descriptor); RTL + pure-helper unit tests first — the tree flatten/projection logic lands as **pure functions** (`flattenOrganized`, `projectDrop`) with exhaustive unit specs since jsdom cannot simulate dnd-kit pointer gestures; component RTL covers rendering (rows, depths, rich content, kebab actions); **Playwright covers the real drags** — dnd-kit uses PointerEvents, so Playwright's native `mouse.down/move/up` works (unlike HTML5 DnD — no more synthetic DragEvent dispatch for the scenario page).

**Constraints**: The kebab Delete reuses the existing two-step confirm text; deleting navigates to `/inventory/scenarios`. Alias tooltip is informational (allowed — reveals hidden content). Scenario list keeps PageTable/toolbar; only its columns change.

**Scale/Scope**: Backend small (field + tests + regen). Frontend: shared `ItemName` component; catalog (column defs v6, Item cell); AcquisitionForm card header; scenarios list (columns) + detail rewrite of the organize body (dnd-kit) + info-panel actions; `organizeTree.ts` gains flatten/projection helpers (drops the rc-tree-specific `computeDropTarget`); locales ×2; RTL/pytest/e2e updates.

## Constitution Check

*GATE vs v1.20.0 — PASS (pre-Phase-0 and post-Phase-1).*

| Principle | Gate | Status |
|---|---|---|
| I / data_io | `alias_name` is a schema change → item descriptor auto-fields pick it up; io round-trip asserted in the same change. | PASS |
| IV Contracts | Serializer change → OpenAPI + types regen before frontend consumption. | PASS (task-ordered) |
| V TDD | Backend tests first; flatten/projection pure-function specs first; RTL before page rework. | PASS |
| VI UI rules | Alias tooltip reveals hidden content (never repeats visible text — compliant); pane rows adopt no-overflow flex; placeholders unchanged. | PASS |
| VII PageTable | Scenario list stays on PageTable; catalog column mechanics unchanged (new hidden def + key bump). | PASS |
| VIII i18n | New keys (alias label, original-name tooltip, kebab/delete) in BOTH locales; dead pane-title keys removed. | PASS |
| XII Toolbar | Alias column/filter/sort ride the standard mechanics. | PASS |

No violations → Complexity Tracking empty.

## Project Structure

```text
apps/unihub/backend/
├── inventory/migrations/0014_item_alias_name.py
├── inventory/models.py / serializers.py / views.py     # alias_name field + filter/order
└── tests/test_inventory_items.py / test_inventory_io.py # alias round-trip, filter/sort, descriptor

apps/unihub/frontend/src/
├── components/ItemName/index.tsx                # alias-preferred name + original tooltip + url link
├── pages/inventory/catalog/index.tsx            # v6 defs (+Alias hidden), Item cell via ItemName
├── pages/inventory/acquisitions/AcquisitionForm.tsx  # alias form field + card header via ItemName
├── pages/inventory/scenarios/index.tsx          # Name+Description columns; form modal extracted
├── pages/inventory/scenarios/ScenarioFormModal.tsx   # shared create/edit modal (list "New" + detail Edit)
├── pages/inventory/scenarios/detail.tsx         # info-panel Edit+kebab; dnd-kit organize body
├── pages/inventory/scenarios/organizeTree.ts    # + flattenOrganized/projectDrop; − computeDropTarget
├── services/unihub-backend/inventory.ts         # Item.alias_name (+ generated types)
└── locales/{en-US,zh-TW}/pages.ts

apps/unihub/frontend/e2e/{inventory-scenario,inventory-catalog,inventory-acquisition}.spec.ts
```

**Structure Decision**: `ItemName` is a shared component (used by three domains' surfaces already); the scenario form modal is extracted so list-create and detail-edit share one implementation.

## Phase 0 — Research (research.md R18.1–R18.5)

- **R18.1 DnD choice**: dnd-kit sortable-tree pattern over patching the HTML5 bridge — one PointerEvent-based system removes the three-way conflict, gives first-class nested-drop projection with live depth feedback, and makes real-mouse e2e possible. AntD `Tree` is dropped from the page (expand/collapse not currently required — the tree was always fully expanded).
- **R18.2 Flatten/projection**: `flattenOrganized(lines)` → ordered `[{line, depth, parentId}]` (children under parents, display_order within siblings); `projectDrop(flattened, activeId, overIndex, offsetDepth)` → `{container_id, index, depth}` with depth clamped to [minDepth, maxDepth] derived from the previous/next rows (canonical dnd-kit tree math); cycle prevention = an active row's own subtree is excluded from its drop targets (subtree moves with it).
- **R18.3 Alias display**: one `ItemName` component (props: item, linkify?) — alias-preferred text, Tooltip(original name) only when aliased, `<a target=_blank>` when linkify && url. Reused across catalog/cards/panes/modal so the rule cannot drift.
- **R18.4 Scenario form reuse**: the list page's create modal is extracted to `ScenarioFormModal` (name/description, Cancel-left) and mounted from both the list ("New") and the detail ("Edit", pre-filled, PATCH).
- **R18.5 Overflow fix**: pane rows = `display:flex` with `minWidth:0` content (ellipsised) and a `flex:none` trailing action; verified at a narrow Splitter width in e2e.

## Phase 1 — Design & Contracts

- **Contracts**: `Item.alias_name` (read/write, blank default) on item + nested acquisition-item payloads; `alias_name` joins Item filter/order fields. Regen OpenAPI + `api-types.ts`; delta appended to contracts/inventory-api.md.
- **data-model.md**: iteration-18 note (Item.alias_name, migration 0014).
- **Agent context**: CLAUDE.md SPECKIT block → iteration 18.

## Complexity Tracking

*(no constitution violations — intentionally empty)*
