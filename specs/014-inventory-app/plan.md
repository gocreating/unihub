# Implementation Plan: Inventory App — Iteration 16 (Toggle column, parameter editor polish, scenario organize redesign)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 iteration 16; FR-003 (Toggle column), FR-011/FR-012 (Organize redesign, `organized` flag), FR-026 (parameter editor grid + definition deletion). Constitution v1.20.0.

## Summary

1. **Catalog Toggle column** — the caret column becomes a real `ColumnDef` (`__caret`, label "Toggle") listed in the Columns dropdown and **pinned (sticky-left) in the default state**; `useEntityTable`/`useColumnConfig` gain a `defaultSticky` seed since the initial ColumnState hardcodes `stickyLeft:false`.
2. **Parameter editor polish** — rows move onto the form-grid (fields fill the row, stack on narrow content width via `useContainerWidth`); the key dropdown gains a **delete affordance on user-defined definitions** (`optionRender` with a stop-propagation delete icon → count-confirm via the existing two-step delete API → definition queries invalidated).
3. **Scenario Organize redesign** — detail page = name/description Card + Organize Card whose header "Add" button opens a **search modal** (server substring search; `<mark>`-highlighted matches; item-name links to `url`; members listed **disabled**). Body = AntD **Splitter** (left/right wide, top/bottom narrow via `useContainerWidth`): left = **unorganized** flat list (remove button), right = **organized tree** (existing drag logic). **Cross-pane drag both ways** via native HTML5 DnD bridging (below). Tree items are only removable by sending them back left.
4. **Backend** — `ScenarioItem.organized` boolean (default false; migration 0013), `move` action gains an `organized` flag (organize = set true + container/index dense reorder among organized siblings; unorganize = false + container null + children re-parent to organized top level); serializer exposes `organized`; contracts regen.

## Technical Context

**Language/Version**: TypeScript 5.7, Python 3.12

**Primary Dependencies**: AntD 5.29 (**`Splitter`** verified available); no new packages — cross-pane drag uses native HTML5 DnD, not dnd-kit.

**Storage**: PostgreSQL 16 — one migration (`ScenarioItem.organized`, default false; scenarios are currently empty post-re-import, so no backfill decisions).

**Testing**: pytest (move/organize semantics, children re-parent, serializer), RTL (editor grid/delete flow, detail page modal/panes/highlight, drop-handler units), Playwright (modal add → left pane; cross-pane drag via DragEvent dispatch; reload persistence).

**Target Platform / Project Type**: unihub dashboard SPA, monorepo.

**Performance Goals**: No new endpoints; search modal reuses `listItems` (+`totals` ignored); tree/pane recompute is render-time.

**Constraints**: rc-tree's `onDrop` only fires for its own nodes — **external drops need manual handlers**: left items are `draggable` spans (line id via ref + dataTransfer); tree node **titles** (`titleRender`) and the tree wrapper carry `onDragOver`/`onDrop` for left→right (title = nest, wrapper background = top-level append); the left pane wrapper accepts drops of tree drags (tracked via Tree `onDragStart` ref) for right→left. Internal tree drags keep the existing rc-tree path.

**Scale/Scope**: EntityToolbar sticky seed + catalog caret def; ParameterRowsEditor rework; scenarios/detail.tsx full rewrite + `organizeTree.ts` extension (`organized` filter); new `HighlightText` helper (or inline `<mark>` splitter); backend migration + move rework; locales ×2; RTL/pytest/e2e updates.

## Constitution Check

*GATE evaluated against v1.20.0 — pre-Phase-0 PASS; re-check post-Phase-1 PASS.*

| Principle | Gate | Status |
|---|---|---|
| I / data_io | `organized` is a schema change → scenarioitem descriptor auto-fields pick it up (`auto_system_fields`), verified by the io round-trip test in the same change. | PASS |
| IV Contracts | Serializer/move changes → OpenAPI + types regen before frontend consumption. | PASS (task-ordered) |
| V TDD | Backend move/organize tests first; RTL first for editor + detail page; drop handlers unit-tested as pure functions where possible. | PASS |
| VI v1.20.0 | Parameter rows adopt the form grid (fixing a live violation); tooltips stay truncation-gated; EmptyValue everywhere; search modal keeps Cancel-left/primary-right + dirty guard n/a (search-only modal, closable). | PASS |
| VII PageTable | Catalog layout unchanged; Toggle column integrates into the existing column-config mechanics (pin = the standard sticky-left flag, seeded true). | PASS |
| VIII i18n | New keys (Toggle label, organize panes, search modal, delete-definition confirm) in BOTH locales. | PASS |
| XII Toolbar | `defaultSticky` seed extends `useColumnConfig` without changing apply-gate semantics; PageTable remount key already includes sticky state. | PASS |

No violations → Complexity Tracking empty.

## Project Structure

```text
apps/unihub/backend/
├── inventory/migrations/0013_scenarioitem_organized.py
├── inventory/models.py / serializers.py / views.py   # organized field; move(organized) semantics; send-back re-parent
└── tests/test_inventory_scenarios.py                 # organize/unorganize/move/re-parent coverage

apps/unihub/frontend/src/
├── components/EntityToolbar/{useEntityTable,hooks/useColumnConfig}.ts  # defaultSticky seed
├── components/ParameterRowsEditor/index.tsx           # form-grid rows + definition delete affordance
├── pages/inventory/catalog/index.tsx                  # __caret ColumnDef ("Toggle", pinned default; hidden cells in flat mode)
├── pages/inventory/scenarios/detail.tsx               # rewrite: info Card + Organize Card (modal, Splitter, panes, DnD bridge)
├── pages/inventory/scenarios/organizeTree.ts          # organized-aware childrenOf/computeDropTarget + pane-drop helpers
├── services/unihub-backend/inventory.ts               # organized on ScenarioItem; move(organized)
└── locales/{en-US,zh-TW}/pages.ts

apps/unihub/frontend/e2e/inventory-scenario.spec.ts    # modal add, cross-pane drag, persistence
```

**Structure Decision**: Existing layout; sticky-seed goes into the shared toolbar hooks so other pages can pin defaults later.

## Phase 0 — Research (research.md R16.1–R16.5)

- **R16.1 Splitter**: available in installed antd 5.29.3; orientation switches on `useContainerWidth` (content width, not viewport).
- **R16.2 Cross-pane DnD**: rc-tree ignores external drags → native HTML5 bridge (draggable left rows; drop handlers on tree node titles + wrapper; Tree `onDragStart` ref enables right→left drops). No new dependency.
- **R16.3 Pin-by-default**: `useColumnConfig` hardcodes `stickyLeft:false`; extend with an initial-sticky seed passed through `useEntityTable` (`defaultSticky: {left: true}` for the Catalog).
- **R16.4 Definition delete UX**: reuse the two-step core API (`DELETE` → 400 with `affected_entity_count` → `?confirm=true`) surfaced as `Modal.confirm` (okType danger, count in body) from the key dropdown's `optionRender`.
- **R16.5 organized semantics**: unorganized pane sorted by `created_at`; tree = `organized=true` lines only (`childrenOf` filters); `move {organized:false}` clears container and re-parents children to organized top level; adds default `organized=false`.

## Phase 1 — Design & Contracts

- **Contracts**: ScenarioItem gains `organized`; `move` body `{container_id, index, organized}`; regen OpenAPI + `api-types.ts`; delta appended to contracts/inventory-api.md.
- **data-model.md**: iteration-16 note (ScenarioItem.organized).
- **Agent context**: CLAUDE.md SPECKIT block → iteration 16.

## Complexity Tracking

*(no constitution violations — intentionally empty)*
