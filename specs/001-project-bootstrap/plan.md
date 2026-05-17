# Implementation Plan: UniHub Project Bootstrap

**Branch**: `001-project-bootstrap` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-project-bootstrap/spec.md`

## Summary

Bootstrap the UniHub monorepo with a Django + React web application that delivers
the Finance domain as the v1 MVP. The Finance domain implements balance sheet
snapshots across multiple currencies, with a shared entity/attribute infrastructure
designed for zero-migration extensibility to future domains. The frontend uses a
ProLayout-based dashboard shell and PageTable for all tabular views.

## Technical Context

**Backend Language/Version**: Python 3.12

**Frontend Language/Version**: TypeScript 5.7

**Primary Dependencies**:
- Backend: Django 5.x, Django REST Framework 3.x, drf-spectacular, psycopg2, gunicorn
- Frontend: React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8,
  TanStack React Query 5, React Router 7, Vite 6

**Storage**: PostgreSQL 16

**Testing**: pytest-django (backend), Vitest + React Testing Library (frontend)

**Target Platform**: Web browser (desktop/tablet), Linux server (backend)

**Project Type**: Web application — SPA frontend + REST API backend

**Performance Goals**: Table queries < 1s for < 10,000 entities per domain;
navigation < 2s on standard broadband

**Constraints**: Single authenticated user; session auth only; desktop/tablet
widths; no file attachments; no mobile layout in v1

**Scale/Scope**: Personal tool — hundreds of accounts, tens of balance sheets,
hundreds of exchange rates; no horizontal scaling required in v1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Entity-Centric Domain Architecture | ✅ Pass | Account and BalanceSheet use AttributeDefinition/AttributeValue. Balance and ExchangeRate are linking/lookup records with typed fields + seeded system AttributeDefinitions for UI rendering. |
| II. Domain Independence | ✅ Pass | Finance is the only domain in v1; shared infrastructure lives in a `core` app imported by domain apps. |
| III. Reference Implementation Alignment | ✅ Pass | ProLayout shell, PageTable, service layer, and backend layout all follow ov-fleet patterns. |
| IV. API Contract-Driven Frontend | ✅ Pass | drf-spectacular generates openapi.yaml; openapi-typescript generates all frontend types. |
| V. Quality Loop Enforcement | ✅ Pass | CI runs pnpm lint+typecheck+test and ruff+pytest on every change. |
| VI. PageTable as Default Tabular Component | ✅ Pass | Accounts list, BalanceSheet list, Balance entry table, and ExchangeRate list all use PageTable. |

**Post-design re-check**: All gates remain green after Phase 1. See research.md
for the hybrid attribute storage justification (Constitution I compliance note).

## Project Structure

### Documentation (this feature)

```text
specs/001-project-bootstrap/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — entity definitions
├── quickstart.md        # Phase 1 — developer setup
├── contracts/           # Phase 1 — API endpoint contracts
│   ├── auth.md
│   ├── core.md
│   └── finance.md
└── tasks.md             # Phase 2 — /speckit-tasks output
```

### Source Code

```text
apps/unihub/
├── backend/
│   ├── unihub/                    # Django project root
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── core/                      # Shared entity infrastructure
│   │   ├── models.py              # AttributeDefinition, AttributeValue
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── migrations/
│   ├── finance/                   # Finance domain app
│   │   ├── models.py              # Account, BalanceSheet, Balance, ExchangeRate
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── filters.py
│   │   ├── urls.py
│   │   └── migrations/
│   ├── health/                    # Health check endpoint
│   │   ├── views.py
│   │   └── urls.py
│   ├── tests/
│   │   ├── test_core.py
│   │   └── test_finance.py
│   ├── manage.py
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── entrypoint.sh
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── PageTable/
│   │   │       ├── index.tsx      # Adapted from ov-fleet
│   │   │       └── useStickyHeaderOffset.ts
│   │   ├── layouts/
│   │   │   └── AppShell.tsx       # ProLayout wrapper + sidebar nav
│   │   ├── pages/
│   │   │   ├── dashboard/
│   │   │   │   └── index.tsx      # Landing page
│   │   │   └── finance/
│   │   │       ├── accounts/
│   │   │       │   └── index.tsx  # Account list (PageTable)
│   │   │       ├── balance-sheets/
│   │   │       │   ├── index.tsx  # BalanceSheet list (PageTable)
│   │   │       │   └── [id].tsx   # Balance entry + net worth view
│   │   │       └── exchange-rates/
│   │   │           └── index.tsx  # ExchangeRate list (PageTable)
│   │   ├── services/
│   │   │   └── unihub-backend/
│   │   │       ├── finance.ts
│   │   │       ├── auth.ts
│   │   │       ├── types.ts       # Re-exports generated types
│   │   │       └── index.ts       # API_BASE_URL + exports
│   │   └── generated/
│   │       └── api-types.ts       # Generated by openapi-typescript
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── docker-compose.local.yml
├── docker-compose.production.yml
└── .env.example
```

**Structure Decision**: Web application (Option 2 variant). Backend and frontend
are co-located under `apps/unihub/` but independently managed. The `core` Django
app provides shared AttributeDefinition/AttributeValue infrastructure; domain
apps import from `core` only.
