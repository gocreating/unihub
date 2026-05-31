# Implementation Plan: Entity Operations

**Branch**: `008-entity-operations` | **Date**: 2026-05-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-entity-operations/spec.md`

## Summary

Add filter, sort, column visibility/ordering/sticky, and server-side pagination primitives to all entity list views. The backend gains a reusable `EntityFilterBackend` (multi-condition/group filtering via a JSON query param) and two pagination classes (`EntityOffsetPagination`, `EntityCursorPagination`) in `core/`. The frontend gains a shared `EntityToolbar` component containing three Apply-gated panels (filter, sort, column) and hooks that manage state and URL sync. All existing Finance domain list views are wired up as the reference integration. Table column headers also trigger immediate sort changes (bypassing Apply) and stay bidirectionally in sync with the sort panel.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 (frontend)

**Primary Dependencies**:
- Backend: Django 5.x, Django REST Framework 3.x (built-in `LimitOffsetPagination`, `CursorPagination`, `OrderingFilter`)
- Frontend: React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, react-intl

**Storage**: PostgreSQL 16 — no new tables; all filter/sort work happens at query time

**Testing**: pytest-django (backend), Vitest + React Testing Library (frontend)

**Target Platform**: Desktop browser (Chrome/Firefox/Safari at ≥1024 px viewport width)

**Project Type**: Full-stack web application (Django monolith backend + React SPA frontend, monorepo)

**Performance Goals**: Filtered/sorted results returned within 2 s for datasets up to 100 k records (SC-002); column changes take effect without a data re-fetch (FR-016)

**Constraints**:
- All filter and sort evaluation MUST be server-side — no client-side array manipulation
- Mobile layout is out of scope
- Column configuration is session-scoped — not persisted to the DB or URL
- No new database tables or migrations

**Scale/Scope**: Single authenticated user; up to 100 k entity records per domain; Finance domain is the reference integration for all four Finance entity types (Currency, Account, BalanceSheet, ExchangeRate)

## Constitution Check

*Gate: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Entity-Centric Domain Architecture | ✅ Pass | Filter/sort attributes reference `AttributeDefinition` identifiers; no parallel attribute system created |
| II — Domain Independence | ✅ Pass | Filter backend and pagination classes live in `core/` as opt-in infrastructure; Finance viewsets add them independently |
| III — Reference Implementation Alignment | ✅ Pass | Uses DRF filter backends + built-in pagination; frontend uses PageTable, React Query, Pro Components |
| IV — API Contract-Driven Frontend | ✅ Pass | Filter/sort/pagination params documented in contract; frontend types generated from updated OpenAPI schema |
| V — Quality Loop Enforcement | ✅ Pass | Test-first backend; all filter/pagination endpoints have happy-path + error-path tests; frontend lint + typecheck + Vitest |
| VI — UI/UX Reference: ov-fleet | ✅ Pass | Toolbar controls go in `headerTitle`/`toolBarRender` per PageTable pattern; pagination in sticky footer |
| VII — PageTable Layout | ✅ Pass | Toolbar rendered via `headerTitle`/`toolBarRender` props; ProTable built-in `search` prop unused; pagination in sticky footer |
| VIII — Internationalisation | ✅ Pass | All EntityToolbar strings use `formatMessage`; keys under `common.entityOps.*`; both `en-US` and `zh-TW` updated |
| IX — Base Currency Net Worth | ✅ Pass | Not impacted by this feature |
| X — Chart Rendering | ✅ Pass | Not impacted |
| XI — Chart Library & Visualization | ✅ Pass | Not impacted |

**No violations. No Complexity Tracking required.**

## Project Structure

### Documentation (this feature)

```text
specs/008-entity-operations/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── entity-operations-api.md   ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code

```text
apps/unihub/backend/
  core/
    filters.py           ← NEW: EntityFilterBackend
    pagination.py        ← NEW: EntityOffsetPagination, EntityCursorPagination
  finance/
    views.py             ← MODIFIED: add EntityFilterBackend + pagination to all viewsets
  tests/
    test_entity_filter.py      ← NEW: filter backend unit + integration tests
    test_entity_pagination.py  ← NEW: pagination tests

apps/unihub/frontend/src/
  components/
    EntityToolbar/
      index.ts                 ← NEW: barrel export
      EntityToolbar.tsx        ← NEW: container (three dropdown buttons)
      FilterPanel.tsx          ← NEW: condition group builder + Apply/Cancel
      SortPanel.tsx            ← NEW: sort rule list with priority drag + Apply/Cancel
      ColumnPanel.tsx          ← NEW: visibility toggles + reorder + sticky toggles + Apply/Cancel
      types.ts                 ← NEW: FilterGroup, SortRule, ColumnConfig, operator enums
      hooks/
        useEntityFilter.ts     ← NEW: filter state + URL encoding/decoding
        useEntitySort.ts       ← NEW: sort state + URL sync + header-click handler
        useColumnConfig.ts     ← NEW: column visibility/order/sticky state
  pages/finance/
    currencies/index.tsx       ← MODIFIED: integrate EntityToolbar + pagination
    accounts/index.tsx         ← MODIFIED: integrate EntityToolbar + pagination
    exchange-rates/index.tsx   ← MODIFIED: integrate EntityToolbar + pagination
    balance-sheets/index.tsx   ← MODIFIED: integrate EntityToolbar + pagination
  services/unihub-backend/
    finance.ts                 ← MODIFIED: accept filter/sort/pagination params
  locales/
    en-US/pages.ts             ← MODIFIED: add common.entityOps.* keys
    zh-TW/pages.ts             ← MODIFIED: add common.entityOps.* keys
```

**Structure Decision**: Web application (Option 2) — backend changes under `apps/unihub/backend/core/` (infrastructure) and `apps/unihub/backend/finance/` (integration); frontend changes under `apps/unihub/frontend/src/components/EntityToolbar/` (new shared component) and `pages/finance/` (integration points).
