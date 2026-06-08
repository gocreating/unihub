# Implementation Plan: Finance Portfolio Management

**Branch**: `013-finance-portfolio-management` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-finance-portfolio-management/spec.md`

## Summary

Add four new entities to the finance domain — Asset, Portfolio, Transaction, and Transfer — with full CRUD for each. Portfolios track `first_transaction_time` and `last_transaction_time` (auto-derived from their transactions) and default-sort by `last_transaction_time` descending. Transactions belong to an active portfolio and contain one or more atomic transfers; transfers are displayed as inline expandable rows in the Transactions table rather than a standalone page. Each transfer records a signed asset change amount plus an optional Value Change in the portfolio's base currency (for cost/expense/income events).

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**:
- Backend: Django 5.x, DRF 3.x, drf-spectacular, uv, ruff, pytest-django
- Frontend: Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, React Router 7, Vite 6, Vitest

**Storage**: PostgreSQL 16 — shared finance database; new tables via Django migrations

**Testing**: pytest-django (backend), Vitest + React Testing Library (frontend)

**Target Platform**: Linux server (backend), desktop/tablet browser (frontend)

**Project Type**: Web application — Django REST API + React SPA

**Performance Goals**: Personal dashboard; entity list views load perceptibly instantly (<1000 rows per entity)

**Constraints**: Mobile out of scope (v1); session auth only; single user; pnpm / uv only

**Scale/Scope**: Personal finance tracker; estimated <500 portfolios, <50k transactions

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I — Entity-Centric Architecture | ✅ PASS | Finance app uses concrete Django models (established precedent: Account, BalanceSheet, ExchangeRate). New entities follow the same pattern. |
| II — Domain Independence | ✅ PASS | All new models, serializers, and views live in `finance/`; no cross-domain imports. |
| III — Reference Impl Alignment | ✅ PASS | Django+DRF+drf-spectacular; session auth; uv/ruff/pytest-django; React+AntD+ProComponents; pnpm/ESLint/Vitest. |
| IV — API Contract-Driven Frontend | ✅ PASS | OpenAPI schema regenerated after backend changes; frontend types generated via openapi-typescript. |
| V — Quality Loop | ✅ PASS | TDD: tests written first, red-green-refactor. All backend/frontend quality loop commands must pass. |
| VI — UX Reference (ov-fleet) | ✅ PASS | PageTable layout, dayjs datetime format, empty-cell placeholder, Tag for FK values. |
| VII — PageTable NON-NEGOTIABLE | ✅ PASS | Assets, Portfolios, Transactions pages all use PageTable. Inline transfer rows use `ProTable ghost` inside `expandedRowRender` (not PageTable) per Principle XI. |
| VIII — i18n NON-NEGOTIABLE | ✅ PASS | All strings via `formatMessage`; `pages.finance.assets.*`, `pages.finance.portfolios.*`, `pages.finance.transactions.*` keys added to both en-US and zh-TW in same commit. |
| IX — Base Currency Net Worth | ⚠️ NOTE | Portfolio has a per-portfolio `base_currency` (immutable, for Value Change field labelling). This is distinct from the app-wide base currency selector (which drives net-worth valuation across accounts). No conflict; they serve different purposes. |
| X — Chart Rendering | ✅ N/A | No charts in this feature. |
| XI — Chart Library | ✅ N/A | No charts in this feature. |
| XII — Entity Toolbar & Sort | ✅ PASS | All list pages use `EntityToolbar` / `useEntitySort` / `useEntityFilter` / `useColumnConfig`. Portfolios page sets `initialActiveRules = [{ field: 'last_transaction_time', direction: 'desc' }]`. |
| Delete Confirmation | ✅ PASS | `Modal.confirm` with `okType: 'danger'` required before all entity deletions. Locale keys used for title/body. |

## Project Structure

### Documentation (this feature)

```text
specs/013-finance-portfolio-management/
├── plan.md              # This file
├── research.md          # Phase 0: key decisions
├── data-model.md        # Phase 1: entity schema
├── quickstart.md        # Phase 1: dev setup notes
├── contracts/
│   └── api.md           # Phase 1: REST API contract
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code

```text
apps/unihub/backend/finance/
├── models.py            # ADD: Asset, Portfolio, Transaction, Transfer
├── serializers.py       # ADD: 4 new serializers; TransactionSerializer nests transfers
├── views.py             # ADD: AssetViewSet, PortfolioViewSet, TransactionViewSet
├── urls.py              # ADD: assets/, portfolios/, transactions/ routes
└── migrations/          # ADD: single migration for 4 new models

apps/unihub/backend/tests/
└── finance/             # ADD: test_assets.py, test_portfolios.py, test_transactions.py

apps/unihub/frontend/src/
├── pages/finance/
│   ├── assets/
│   │   └── index.tsx    # ADD: AssetsPage
│   ├── portfolios/
│   │   └── index.tsx    # ADD: PortfoliosPage
│   └── transactions/
│       └── index.tsx    # ADD: TransactionsPage (expandable transfer rows)
├── services/unihub-backend/
│   └── finance.ts       # ADD: Asset/Portfolio/Transaction/Transfer types + service fns
└── locales/
    ├── en-US/pages.ts   # ADD: pages.finance.assets.*, portfolios.*, transactions.*
    └── zh-TW/pages.ts   # ADD: same keys in zh-TW
```

**`AppShell.tsx`**: ADD nav items for Assets, Portfolios, Transactions under the Finance section using `menu.finance.*` i18n keys.

**Router**: ADD routes `/finance/assets`, `/finance/portfolios`, `/finance/transactions`.

## Complexity Tracking

No constitution violations requiring justification.
