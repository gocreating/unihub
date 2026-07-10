# Implementation Plan: Inventory App

**Branch**: `014-inventory-app` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-inventory-app/spec.md`

## Summary

Add an **Inventory** domain to the unihub hub: a personal catalog of physical items (stockable and consumable), a record of how each item was obtained (Acquisition), and per-situation planning (Scenario) with preparation checklists, packing rules (Constraint), item-in-item containment, and position review.

Technical approach: implement `inventory` as a new standalone Django app that mirrors the Finance reference implementation exactly — concrete Django models (`Item`, `Acquisition`, `Scenario`, `ScenarioItem`, `Constraint`) with nanoid PKs, DRF `ModelViewSet`s wired to the shared `core/` filter/order/pagination backends, per-entity system `AttributeDefinition` seeding via data migrations (Principle I), and REST endpoints under `/api/v1/inventory/`. The frontend adds a collapsible `Inventory` nav section with list pages (Items, Acquisitions, Scenarios) built on `PageTable` + the `EntityToolbar` hook family, plus a Scenario detail view rendering the computed checklist, constraint-violation review, and containment tree. Checklist progress and constraint evaluation are computed server-side (testable per Principle V) and exposed via a dedicated scenario endpoint.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3, drf-spectacular, PostgreSQL 16 (psycopg3); Ant Design 5 + Pro Components, TanStack React Query 5, React Router 7, Vite 6, react-intl

**Storage**: PostgreSQL 16 — single shared database; new `inventory_*` tables. Item attributes also surfaced through the shared `core` `AttributeDefinition`/`AttributeValue` infrastructure (system + user-defined).

**Testing**: pytest-django (backend, test-first per Principle V); Vitest + React Testing Library (frontend)

**Target Platform**: Desktop/tablet browser widths (mobile out of scope, Development Constraints)

**Project Type**: Web application (Django REST backend + React SPA frontend) within the existing unihub monorepo

**Performance Goals**: Catalog of ≥500 items remains searchable/sortable with server-side pagination (offset pagination via `EntityOffsetPagination`); scenario checklist + constraint evaluation for ≤30 items returns in a single request without perceptible delay.

**Constraints**: Session-based auth; single authenticated user owns all data (Development Constraints); no charts in v1; no base-currency valuation (Principle IX is Finance-only); custom attribute types limited to text/long_text/number/date/boolean/single_select.

**Scale/Scope**: One user; ~5 backend models; 3 list pages + 1 scenario detail page; ~3 new nav entries. Estimated 500-item catalog as the design target (SC-002).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
|-----------|--------|------------------------|
| I. Entity-Centric (NON-NEGOTIABLE) | ✅ PASS | Each primary entity (Item, Acquisition, Scenario) registers system `AttributeDefinition`s via a data migration (mirrors `finance/0002_seed_account_system_attrs`). All attributes flow through the shared `AttributeDefinition`/`AttributeValue` path; user-defined attributes supported. Relational structure (Acquisition FK, ScenarioItem, Constraint, containment) mirrors Finance's `Balance`/`BalanceSheet` relational models — permitted alongside the attribute infra. |
| II. Domain Independence | ✅ PASS | New standalone `inventory` Django app; imports only from `core/`. No existing domain code is modified except the additive registrations (`INSTALLED_APPS`, `unihub/urls.py`, frontend `AppShell`, routes, locales). Finance remains fully functional. |
| III. Reference Implementation Alignment | ✅ PASS | Backend follows Finance/ov-fleet: `ModelViewSet`, `EntityFilterBackend` + `NullsOrderingFilter`, `EntityOffsetPagination`, `filterable_fields`/`ordering_fields`, `httpx` (n/a — no external calls), `uv`, `ruff`, `pytest-django`. Frontend follows finance page/service structure. |
| IV. API Contract-Driven Frontend | ✅ PASS | Backend emits OpenAPI via drf-spectacular; frontend types generated with `openapi-typescript` into `src/generated/`. No hand-written response types. |
| V. Quality Loop Enforcement | ✅ PASS | Backend tests written first (red-green), `test_<function>_<scenario>` naming, happy + error path per endpoint. Full frontend/backend quality loop before completion. Checklist/constraint evaluation lives server-side to be unit-testable. |
| VI. UI/UX Reference: ov-fleet | ✅ PASS | Datetime cells show `YYYY-MM-DD HH:mm (X ago)`; empty cells use the secondary `—` placeholder; foreign-key/enum values (`item_type`, `acquisition_method`, `constraint_type`, container name) rendered in `<Tag>`; nav section is collapsible with a level-1 icon. |
| VII. PageTable Layout (NON-NEGOTIABLE) | ✅ PASS | Items, Acquisitions, Scenarios list pages use `PageTable` with the mandated white-card layout, `pageTitle`/`action`/`toolBarRender`, `computeScrollX()` widths, `message.error()` on query error. A table embedded in the Scenario detail visualization card (if any) uses `ProTable ghost`. |
| VIII. i18n (NON-NEGOTIABLE) | ✅ PASS | All strings via `formatMessage`. Keys under `menu.inventory.*` and `pages.inventory.*` added to BOTH `en-US` and `zh-TW` in the same commit. Nav labels via `t({ id: 'menu.*' })` in `AppShell.tsx`. |
| IX. Base Currency Net Worth | ➖ N/A | Explicitly Finance-domain only. Item `price`/`cost` are stored as plain decimals; no cross-currency valuation in Inventory v1. |
| X. Chart Rendering | ➖ N/A | No charts in Inventory v1. (Any future status-review chart must comply.) |
| XI. Chart Library & Visualization | ➖ N/A | No charts in Inventory v1. |
| XII. Entity Toolbar & Sort Controls | ✅ PASS | The three list pages use `EntityToolbar` / `useEntitySort` / `useEntityFilter` / `useColumnConfig` with the apply-gate pattern, `makeSortProps`, and `panelApplyCount` in the `PageTable` `key`. Backend opts in via `filterable_fields` / `ordering_fields`. |
| Dev Constraint: Delete confirmation (NON-NEGOTIABLE) | ✅ PASS | Every destructive action (delete item / acquisition / scenario / constraint / checklist line) uses `Modal.confirm` with `okType: 'danger'` and localized title/body. Backend `destroy` adds a `?confirm=true` reference-count gate, mirroring `AccountViewSet.destroy`. |
| Domain Addition Protocol | ✅ PASS | The plan follows the exact 6-step sequence (see Project Structure). |

**Result**: All applicable gates pass. No deviations to justify → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file
├── research.md          # Phase 0 output — resolved decisions
├── data-model.md        # Phase 1 output — entities, fields, relationships, seeds
├── quickstart.md        # Phase 1 output — dev setup + feature walkthrough
├── contracts/           # Phase 1 output — REST endpoint contracts
│   └── inventory-api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── inventory/                     # NEW Django app (Domain Addition Protocol step 1)
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py                  # Item, Acquisition, Scenario, ScenarioItem, Constraint
│   ├── serializers.py             # DRF serializers + checklist/evaluation serializers
│   ├── views.py                   # ModelViewSets + Scenario checklist/evaluate actions
│   ├── urls.py                    # DefaultRouter + nested scenario routes
│   └── migrations/
│       ├── 0001_initial.py
│       └── 0002_seed_system_attrs.py   # seed Item/Acquisition/Scenario system AttributeDefinitions
├── unihub/
│   ├── settings.py                # add "inventory" to INSTALLED_APPS (step 2)
│   └── urls.py                    # add path("api/v1/inventory/", include("inventory.urls")) (step 2)
└── tests/
    └── test_inventory.py          # pytest-django: models, endpoints, checklist, constraints, cycles

apps/unihub/frontend/src/
├── pages/inventory/               # NEW page section (step 4)
│   ├── items/                     # Items catalog (PageTable + EntityToolbar)
│   ├── acquisitions/              # Acquisitions list + item links
│   └── scenarios/                 # Scenarios list + Scenario detail (checklist, constraints, containment)
├── components/AppShell/AppShell.tsx   # add Inventory nav section (step 5)
├── services/unihub-backend/
│   ├── inventory.ts               # NEW service file (step 6)
│   └── index.ts                   # export inventory service
├── generated/                     # regenerated OpenAPI types (Principle IV)
├── locales/en-US/{menu.ts,pages.ts}   # add menu.inventory.* / pages.inventory.* (step 5/VIII)
├── locales/zh-TW/{menu.ts,pages.ts}   # mirrored keys
└── App.tsx                        # register /inventory routes
```

**Structure Decision**: Web application within the existing unihub monorepo. The backend gains one new domain app (`apps/unihub/backend/inventory/`) following the Finance layout; the frontend gains one new page section (`apps/unihub/frontend/src/pages/inventory/`) and one service file, wired through the existing `AppShell`, router, and locale files. No new project or deployment unit is introduced (Principle II — additive integration only).

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.
