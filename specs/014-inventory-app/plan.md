# Implementation Plan: Inventory App — Iteration 14 (Dynamic item parameters + scenario simplification)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 "dynamic item parameters + scenario simplification, iteration 14"; FR-001/002b/003/003a/005/006/010–017/022/025 (revised), **FR-026–FR-029** (new); US3/US5 (rewritten), US4 (removed). Constitution v1.19.0.

## Summary

Two thrusts, one iteration:

1. **Dynamic item parameters (FR-026–029)** — Item's seven concrete parameter columns (color, size, weight/length/width/height/volume + `_unit`/`_canonical` shadows) are replaced by the shared **core `AttributeDefinition`/`AttributeValue`** infrastructure (Principle I): seven seeded system definitions, runtime user-defined definitions (types: string→`text`, numeric→`number`, select→`single_select`, and a **new core `dimension` data type** with a unit family + canonical numeric), an on-demand **parameter-row editor** in the item form, dynamic per-definition Catalog columns/filters/sorts served by a new **attribute-aware extension of core's filter/ordering backends**, a migrate-and-drop data migration, `data_io` flip to `has_user_attributes=True` (values already ride the table CSV as `[name]:type` columns), and the legacy importer rewired to parameters.
2. **Scenario simplification** — Constraints and the preparation checklist are **deleted** (models, API, UI; tables/columns dropped): `Scenario.notes → description`; `ScenarioItem` loses `prepared`/`required_quantity`, gains **`display_order`**; the list page shows Name/Description/Actions; the detail page becomes **Backlog** (server-side substring search, excludes members) + **Organize** (AntD draggable Tree → containment + sibling order via a new `move` action, cycle-check preserved).

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend)

**Primary Dependencies**: React 18.3, AntD 5.24 (+`Tree` draggable for Organize), TanStack Query 5; Django 5 + DRF 3 + drf-spectacular. No new packages.

**Storage**: PostgreSQL 16. Migrations: **core** (AttributeDefinition.`dimension` type + `unit_family`; AttributeValue.`value_number` + `value_unit`), **inventory** (seed 7 system defs; migrate item values → AttributeValues; drop 12 concrete columns; rename `Scenario.notes→description`; drop `ScenarioItem.prepared`/`required_quantity`, add `display_order` backfilled by `created_at`; drop `Constraint`).

**Testing**: pytest-django (core attribute filter/order, item parameter serializer round-trip, migration seeding, scenario/move endpoints), Vitest+RTL (parameter editor, dynamic catalog columns, scenario pages), Playwright (catalog regression; scenario detail happy path).

**Target Platform**: unihub dashboard SPA (desktop/tablet)

**Project Type**: Web application (monorepo `apps/unihub/frontend` + `backend`)

**Performance Goals**: Attribute filter/sort via **per-definition Subquery annotations** (one scalar subquery per referenced definition, not per row-key joins); item list prefetches attribute values (single query) to avoid N+1 in `parameters` serialization.

**Constraints**: Missing parameter values behave as NULLs in sort/filter (honour `__nullsfirst`/`__nullslast`); one value per (definition, item) (existing uniqueness); system definitions protected (delete already blocked — **rename/type-change protection added to core** per Principle I); definition-delete-with-values keeps the existing count-confirm flow.

**Scale/Scope**: ~2 core files + migration; ~6 inventory backend files + 2 migrations; frontend: 1 new `ParameterRowsEditor`, ItemFormModal + AcquisitionForm + itemBadges rework, Catalog dynamic columns, scenarios list+detail rewrite, service/type regen, locales ×2; legacy importer rewire; RTL + pytest + e2e updates.

## Constitution Check

*GATE evaluated against constitution v1.19.0 — pre-Phase-0 PASS; re-checked post-Phase-1 PASS.*

| Principle | Gate | Status |
|---|---|---|
| I Entity-centric (NON-NEG.) | Parameters move ONTO the shared AttributeDefinition/AttributeValue path — removes inventory's concrete-column deviation. System defs seeded via data migration, protected (delete blocked; rename guard added); delete-with-values count-confirm exists. `dimension` extends the single shared model (no parallel storage). | PASS (deviation removed) |
| I data_io consistency | Same-change updates: item descriptor auto-fields shrink + `has_user_attributes=True` (values ride `[name]:type` CSV columns — mechanism already built); scenario/scenarioitem descriptors auto-pick renames; Constraint was never registered. | PASS |
| II Domain independence | `dimension`/`value_number` live in core (shared infra, not cross-domain business logic); inventory keeps its `units.py` helpers, exposed to core via a small callback-free import (core owns conversion tables copy? NO — conversion helpers move/are re-exported from core to avoid core→inventory import; see research R14.3). | PASS |
| III Reference alignment | DRF/AntD patterns; AntD `Tree` draggable (already-shipped library) for Organize; no new deps. | PASS |
| IV Contract-driven | Serializer changes → regen OpenAPI + `openapi-typescript` BEFORE frontend consumption. | PASS (task-ordered) |
| V Quality loop + TDD | Backend test-first (attribute filters, parameters round-trip, move endpoint, migrations); RTL first for editor/pages; full loops both sides. | PASS |
| VI/VII UI rules | PageTable layout untouched; footer rule v1.19.0 already in shared footer; datetime two-row untouched; modal grid/footers preserved in ItemFormModal rework; delete confirmations kept (scenario delete, definition delete count-confirm). | PASS |
| VIII i18n | New strings (parameter editor, backlog/organize, description labels) in BOTH locales, same commit. | PASS |
| XII Toolbar patterns | Dynamic defs → `filterableAttrs`/`columnDefs` built from fetched definitions; `useColumnConfig` label patching already handles async labels; flatten rule extends to `attr:` keys. | PASS |

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file (iteration 14)
├── research.md          # + "Iteration 14 research" (R14.*)
├── data-model.md        # + iteration-14 schema deltas
├── quickstart.md        # unchanged
├── contracts/           # inventory-api.md delta + regen types
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/
│   ├── models.py                # +dimension type, +unit_family; AttributeValue +value_number, +value_unit
│   ├── units.py                 # NEW — unit families + canonical conversion (moved from inventory.units, re-exported there)
│   ├── attributes.py            # NEW — annotate_attribute(queryset, definition) Subquery helper + key parsing ("attr:<id>")
│   ├── filters.py               # EntityFilterBackend + NullsOrderingFilter learn attr: keys (view opts in via attribute_content_type)
│   ├── serializers.py           # definition serializer +unit_family; system-def rename/type guard in views
│   ├── views.py                 # PATCH guard for is_system name/data_type
│   └── migrations/000X_dimension_attrs.py
├── inventory/
│   ├── models.py                # Item: drop 12 param columns; Scenario.description; ScenarioItem.display_order (drop prepared/required_quantity); delete Constraint
│   ├── serializers.py           # ItemSerializer.parameters (read nested; write upsert-replace); scenario serializers slimmed; drop Constraint/checklist
│   ├── views.py                 # ItemViewSet: attribute_content_type opt-in; ScenarioItemViewSet: move action, display_order; drop ConstraintViewSet/checklist
│   ├── urls.py                  # drop constraint + checklist routes; add move
│   ├── apps.py                  # data_io: item has_user_attributes=True; descriptors refreshed
│   ├── management/commands/import_legacy_csv.py  # _item_payload → parameters
│   └── migrations/00XX_*.py     # seed defs → migrate values → drop columns; scenario changes; drop Constraint
└── tests/                       # test_core_attributes.py (NEW), test_inventory_items/scenarios updated; constraint tests deleted

apps/unihub/frontend/src/
├── components/ParameterRowsEditor/   # NEW — rows editor + inline new-definition flow (+tests)
├── pages/inventory/
│   ├── items/ItemFormModal.tsx       # fixed param inputs → ParameterRowsEditor
│   ├── acquisitions/AcquisitionForm.tsx  # card badges from parameters
│   ├── itemBadges.ts                 # badge helpers over parameters (system-key compact formats, user keys "key: value")
│   ├── catalog/index.tsx             # dynamic per-definition columns/filters/sorts (attr:<id>), Parameters column from item.parameters
│   └── scenarios/{index,detail}.tsx  # 3-column list; Backlog+Organize detail (AntD Tree draggable)
├── services/unihub-backend/{inventory,core}.ts  # regen-backed types; move/search/definition calls
└── locales/{en-US,zh-TW}/pages.ts    # editor/backlog/organize/description strings
```

**Structure Decision**: Existing monorepo layout; core gains two focused modules (`units.py`, `attributes.py`) so the attribute machinery stays domain-agnostic (Principle II) while inventory re-exports its old `units` API to avoid churn.

## Phase 0 — Research (output: research.md § Iteration 14)

All resolved from codebase inspection (see research.md R14.1–R14.9): attribute API surface & delete-confirm exist (core/views.py:29-46); **no attribute filter/sort exists anywhere** — new `attr:<definition_id>` key scheme with per-definition Subquery annotations; `has_user_attributes=True` CSV mechanism already implemented end-to-end in data_io; system-def **rename guard is missing** in core (added, Principle I); AntD `Tree` draggable chosen for Organize (no new dep); `AttributeManagementPanel` exists unmounted — reused for the inline "create definition" flow's building blocks where practical.

## Phase 1 — Design & Contracts

- **data-model.md**: iteration-14 deltas appended (core + inventory schema, value storage shape: `value` = entered display value; `value_unit` = entered unit (dimension only); `value_number` = canonical numeric (dimension: family base; numeric: the number)).
- **Contracts**: `contracts/inventory-api.md` delta + regen `openapi.yaml`/`api-types.ts` AFTER serializer work: Item gains `parameters[]`, loses 7 attribute fields; AttributeDefinition gains `dimension`/`unit_family`; Scenario `description`; ScenarioItem `display_order` (− `prepared`/`required_quantity`); Constraint endpoints removed; `POST scenarios/{id}/items/{pk}/move` added.
- **Quickstart**: unchanged.
- **Agent context**: CLAUDE.md SPECKIT block updated to iteration 14.

## Complexity Tracking

*(no constitution violations — intentionally empty)*
