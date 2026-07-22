# Implementation Plan: Inventory App Enhancements (Issue #39)

**Branch**: `018-inventory-enhancements` | **Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-inventory-enhancements/spec.md`

## Summary

Three independent inventory enhancements from GitHub issue #39:

1. **Accumulated cost ownership (US1, P1)** — a user-edited accumulated cost
   line (including cleared-to-zero) becomes *user-managed*: it is stored
   exactly as displayed on create, never auto-recalculated on any later edit,
   and persists across sessions; the per-line Reset control is the only way
   back to auto-derived behavior. Mechanism: new `CostFactor.user_managed`
   boolean + create-contract change (client-sent accumulated factors stored
   verbatim; server derives only when the payload has none) + a flag-aware
   reconcile effect in `AcquisitionForm` (auto rows now track item edits
   live; user rows freeze).
2. **Length default cm (US2, P2)** — length-family unit selectors default to
   `cm` instead of `mm` wherever no unit has been chosen yet, via an explicit
   `DEFAULT_FAMILY_UNIT` map in the frontend service constants. Canonical
   storage (mm) and stored units untouched.
3. **Default pinned catalog columns (US3, P3)** — seed
   `acquisition_summary` with `pin: 'left'` next to the already-pinned
   `__caret` (Toggle), bump the catalog column key v7 → v8 so the new default
   takes effect, Actions stays pinned right.

Full rationale and alternatives: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.7 (React 18.3) frontend; Python 3.12 (Django 5, DRF 3) backend

**Primary Dependencies**: Ant Design 5.24 + @ant-design/pro-components, TanStack React Query 5, react-intl, Vite 6; drf-spectacular, django-q2, httpx

**Storage**: PostgreSQL 16 — one new nullable-free boolean column `inventory_costfactor.user_managed` (default false, migration 0020)

**Testing**: Vitest + React Testing Library (frontend), pytest-django (backend, test-first), Playwright e2e (`apps/unihub/frontend/e2e/`) for the pin-geometry lock

**Target Platform**: Desktop/tablet web (existing unihub SPA + Django backend)

**Project Type**: Web application (monorepo `apps/unihub/frontend` + `apps/unihub/backend`)

**Performance Goals**: No new performance surface — same queries, one added boolean per cost factor row

**Constraints**: No data migration of existing values (all existing accumulated rows stay auto-managed, `user_managed=false`); legacy importer and data_io flows must keep working unchanged; OpenAPI schema + generated types must be regenerated in the same change (Principle IV)

**Scale/Scope**: ~658 acquisitions / ~1000 items in the real dataset; 3 backend files + ~6 frontend files touched

## Constitution Check

*GATE: evaluated against constitution v1.23.0 before Phase 0; re-checked after Phase 1 design — PASS (no violations, no Complexity Tracking entries).*

- **I. Entity-centric + data_io consistency** — PASS. No new model; the
  `CostFactor.user_managed` field flows into the existing `TableDescriptor`
  automatically via `auto_system_fields(CostFactor)`; a backend test asserts
  the descriptor picks it up (schema change stays data_io-consistent in the
  same change). Parameters continue through AttributeDefinition/AttributeValue
  untouched.
- **II. Domain independence** — PASS. All backend changes are inside the
  `inventory` app; the frontend unit-default map lives in the inventory
  service module; no cross-domain imports added (finance symbols already
  arrive via the established registry).
- **III. Reference alignment** — PASS. No architectural deviation; DRF
  serializer + migration + RTL/pytest patterns as established.
- **IV. API contract-driven frontend** — PASS (gate): backend serializer
  change ⇒ regenerate frontend types from the live schema (`pnpm
  generate-types` → `src/generated/api-types.ts`) before touching frontend
  service/types. `user_managed` enters the frontend only through generated
  types.
- **V. Quality loop + test-first backend** — PASS. Backend: new pytest cases
  written first (create-verbatim, create-derive-when-absent, update-persists-
  flag, duplicate-accumulated rejection on create). Frontend: RTL suites for
  the form (create payload, freeze/track reconcile, Reset), editor default
  unit, catalog default pin. Full loops (`pnpm lint/typecheck/test/build`,
  `uv run ruff format/check/pytest`) before completion.
- **VI. UI/UX** — PASS. No new visible controls (Reset already exists); empty
  amount keeps coercing to 0 with the existing PriceInput; no new strings
  expected — if any appear, both locales in the same commit (VIII).
- **VII. PageTable** — PASS. No layout change; only a ColumnDef pin seed.
- **VIII. i18n** — PASS. No hardcoded strings; new keys (if any) land in
  en-US + zh-TW together.
- **XII. Entity toolbar/columns** — PASS. Pin default rides `ColumnDef.pin`;
  `fixedForKey`/`pinFingerprint` already join the PageTable remount key; the
  label patch never touches `pin`. Catalog key bump v7 → v8 follows the
  established stale-default convention.

## Project Structure

### Documentation (this feature)

```text
specs/018-inventory-enhancements/
├── plan.md              # This file
├── spec.md              # Feature specification (issue #39)
├── research.md          # Phase 0 — current-state findings + decisions D1–D5
├── data-model.md        # Phase 1 — CostFactor.user_managed states
├── quickstart.md        # Phase 1 — how to exercise the three changes
├── contracts/
│   └── acquisitions-api-delta.md  # Phase 1 — create/update contract changes
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── inventory/
│   ├── models.py                      # + CostFactor.user_managed
│   ├── migrations/0020_costfactor_user_managed.py
│   └── serializers.py                 # CostFactorSerializer field; create/update rules (D2)
└── tests/
    └── test_inventory.py              # + accumulated-ownership cases (test-first)

apps/unihub/frontend/src/
├── generated/api-types.ts             # regenerated: pnpm generate-types (live /api/schema/)
├── services/unihub-backend/inventory.ts   # CostFactorWrite + DEFAULT_FAMILY_UNIT/defaultUnitFor (D4)
├── components/ParameterRowsEditor/index.tsx  # 3 default-unit sites → defaultUnitFor
├── pages/inventory/acquisitions/
│   ├── AcquisitionForm.tsx            # userManaged rows, reconcile (D3), payloads, Reset
│   ├── AcquisitionForm.*.test.tsx     # RTL: create payload / freeze / track / reset
│   └── AcquisitionEdit.test.tsx       # existing staging suite stays green
└── pages/inventory/catalog/
    ├── index.tsx                      # acquisition_summary pin:'left'; key v8 (D5)
    └── CatalogPage.test.tsx           # default-pin assertions

apps/unihub/frontend/e2e/
└── column-pin.spec.ts                 # catalog defaults + Reset now expect 2 left pins
```

**Structure Decision**: Existing web-app monorepo layout; every change lands in
already-existing files/apps except migration 0020 and (possibly) a new RTL
test file for the accumulated-ownership suite.

## Complexity Tracking

No constitution violations — table intentionally empty.
