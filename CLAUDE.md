# Claude Development Guidelines — unihub Monorepo

**unihub** is a single, growing dashboard that serves as a personal central hub — one place to manage and visualize all dimensions of a user's daily life. As the project evolves, new domains get connected to the hub: finance, visiting, language, people, music, and whatever comes next. The dashboard frontend is the consistent interaction surface; backends and data sources expand behind it over time.

> **Reference implementation**: `ov-fleet` (`/Users/gocreating/projects/OverviewCorporation/ov-pro-tools/apps/ov-fleet`) — the primary architectural reference. Follow its patterns for backend layout, service layer, and frontend organization.

## Core Architecture: Entity-Centric Domains

Every domain is built around **entities** — the user creates and manages entities scoped to that domain. There is one backend (one Django project, one database) with each domain implemented as a standalone Django app inside it.

```
apps/
  unihub/
    frontend/    # Single hub SPA
    backend/     # Single Django project — one DB, domain apps inside
      unihub/    # Django project (settings, urls, wsgi)
      core/      # Shared infrastructure (filters, pagination, permissions)
      finance/   # Django app — finance entities
      visiting/  # Django app — visiting entities
      language/  # Django app — language learning (WordCard, GrammarSheet)
      people/    # Django app — people & relationships (Person, Relationship)
      music/     # Django app — song collection (Song)
      data_io/   # Data import/export
      sync/      # Data sync with external sources
      system/    # System settings (profile, etc.)
      health/    # Health check endpoint
    docker-compose.local.yml       # Build from source, local dev
    docker-compose.production.yml  # Pre-built images, production
    specs/
.env.example                       # Template for production secrets (copy to apps/unihub/.env)
```

Adding a new domain = adding a new Django app under `apps/unihub/backend/`, registering it in `INSTALLED_APPS` and `urls.py`, and adding a `pages/<domain>/` section in the frontend.

Per-app CLAUDE.md files:
- `apps/unihub/frontend/CLAUDE.md` — frontend dev guidelines
- `apps/unihub/backend/CLAUDE.md`  — backend dev guidelines

## Architecture Decisions

### Frontend

**Vite over @umijs/max**
- Rationale: Lighter build toolchain, faster HMR, standard React setup. ov-fleet uses UmiJS but that adds framework lock-in we avoid for a personal project.

**Ant Design 5 + Pro Components for UI**
- Rationale: Enterprise-grade admin framework matching ov-fleet's UI stack. Rich data display components (ProTable, StatisticCard, charts).

**PageTable as default tabular component**
- All tabular data views MUST use `PageTable` (`src/components/PageTable/`), adapted from ov-fleet. It provides sticky header, sticky footer, sticky horizontal scrollbar, and column-follow-on-scroll — pre-configured. Use the exported helpers `widthForHeader()`, `measureTextWidth()`, `computeScrollX()` for column widths.

**TanStack React Query for data fetching**
- Rationale: Matches ov-fleet's data-fetching layer. Excellent caching and loading/error states.

**pnpm as frontend package manager**
- Rationale: Strict dependency resolution, disk efficient, mature workspace support.

### Backend

**Django + Django REST Framework**
- Rationale: Mirrors ov-fleet's proven backend stack. Rich ORM, DRF serializers/viewsets, session auth, and drf-spectacular for OpenAPI generation.

**PostgreSQL**
- Rationale: Same as ov-fleet. Reliable relational store; supports JSONB for flexible tag/metadata schemas.

**drf-spectacular for OpenAPI**
- Rationale: Auto-generates `openapi.yaml` consumed by the frontend's type generation (`openapi-typescript`). Types stay in sync with the API contract.

**App-level isolation**
- Rationale: Each app has its own `package.json` / `pyproject.toml` and dependencies. No shared root lockfile.

## Backend Structure (follow ov-fleet)

New Django apps under `apps/unihub/backend/` should mirror ov-fleet's layout:

```
backend/
  <project_name>/         # Django project root
    settings.py
    urls.py               # Root URL router — include app-level urls.py
    wsgi.py / asgi.py
    auth/                 # Session auth + RBAC (IsAdminOnly, etc.)
    <domain>/             # One Django app per domain (finance, visiting, language, …)
      models.py
      views.py            # DRF ViewSets
      serializers.py
      filters.py          # Query/filter helpers
      urls.py
      migrations/
    health/               # Health-check endpoint
  tests/                  # pytest-django test suite
  manage.py
  pyproject.toml          # uv-managed Python dependencies
  Dockerfile
  entrypoint.sh
```

**Key backend conventions (from ov-fleet):**
- Session-based authentication (Django's built-in + DRF session auth)
- Role-based permissions via DRF permission classes (`IsAdminOnly`, etc.)
- OpenAPI schema at `/api/docs/` via drf-spectacular Swagger UI
- Background tasks via django-q2 where polling or async work is needed
- All HTTP client calls via `httpx`
- Linter: `ruff`; tests: `pytest-django`

## Frontend Service Layer (follow ov-fleet)

Organise API calls under `src/services/<backend-name>/`:

```
src/services/unihub-backend/
  finance.ts        # Finance domain endpoints
  auth.ts           # Authentication endpoints
  core.ts           # Shared/core endpoints
  io.ts             # Data import/export endpoints
  sync.ts           # Data sync endpoints
  system.ts         # System (profile, settings) endpoints
  index.ts          # API_BASE_URL + service exports
```

Types are auto-generated from `openapi.yaml` via `openapi-typescript`. Do not hand-write API response types.

## Development Conventions

### TypeScript/React Style
- Strict TypeScript (`strict: true` in tsconfig)
- Functional components with hooks (no class components)
- Named exports preferred over default exports

### Tooling
- **Frontend package manager**: `pnpm` — never use npm or yarn directly
- **Backend package manager**: `uv` — never use pip directly
- **Frontend linter**: ESLint
- **Backend linter**: ruff
- **Testing (frontend)**: Vitest + React Testing Library
- **Testing (backend)**: pytest-django

### Quality Loop

Frontend — run from `apps/unihub/frontend/` after every change:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Backend — run from `apps/unihub/backend/` after every change:

```bash
uv run ruff check .
uv run pytest
```

### Git
- Branch from `main`
- Commit messages: imperative mood, concise

## Adding a New Domain

When connecting a new dimension to the hub:
1. Create `apps/unihub/backend/<domain>/` as a new Django app (`models.py`, `views.py`, `serializers.py`, `urls.py`, `migrations/`)
2. Register the app in `INSTALLED_APPS` and add its URL prefix in `unihub/urls.py`
3. Seed the domain's system AttributeDefinitions via a data migration or management command — never hardcoded in application code
4. Add the domain's pages under `apps/unihub/frontend/src/pages/<domain>/`
5. Add a nav section entry in `AppShell.tsx` using a `menu.*` i18n key (constitution Principle VIII)
6. Add a service file at `apps/unihub/frontend/src/services/<domain>.ts` with types generated from the updated OpenAPI schema

<!-- SPECKIT START -->
## Active Feature

**Branch**: `013-finance-portfolio-management` | **Plan**: [specs/013-finance-portfolio-management/plan.md](specs/013-finance-portfolio-management/plan.md)

Finance portfolio management from GitHub issue #14: Asset, Portfolio, Transaction and Transfer entities with full CRUD. Portfolios carry an immutable per-portfolio base currency (a finance Currency), an active/closed state (closed = frozen except Reopen, enforced server-side), and derived first/last transaction times. A Transfer is EXACTLY ONE of an asset leg or a currency leg plus an optional `pnl_change` in the base currency (iteration 7). Transfers are child rows of the Transactions table on the portfolio detail page. Every amount renders through the shared `<Price>` component over pure normalizers (constitution XIII). Iterations 1–8 shipped. **Iteration 9 (2026-08-25)** in progress — frontend-only, per Clarifications Session 2026-08-25 (FR-052…FR-057): (1) `PageTable` defaults a column `title` from `autoWidth.header` (the Portfolios list Position header was blank) and holdings render as badges via a shared `HoldingTags` + `<Price mutedUnit>`; (2) ONE shared chart tooltip builder (`components/Price/chartTooltip.ts`) used by the portfolio PnL/Trend charts AND the Balance Sheets charts, values through the normalizers; (3) PnL and Trend tabs become chart-only (no PnL/holdings lines, no page note; realized/net caveat as a tab-bar ⓘ); (4) the Trend "Position" series becomes money, `−(cost + income)` per transaction, on one axis; (5) Transactions table columns Time, Accumulated PnL, Accumulated Position, Tx PnL Change, Tx Position Change, Description — parents fill only the accumulated pair, transfers only the change pair; (6) accumulation and charts cover the WHOLE portfolio via one unpaginated fetch (3 of 55 real portfolios exceed the 25-row page). See [plan.md](specs/013-finance-portfolio-management/plan.md) (Iteration 9), [research.md](specs/013-finance-portfolio-management/research.md) (I9-1…I9-6), [quickstart.md](specs/013-finance-portfolio-management/quickstart.md) (verification plan). The `migration/` CSVs are real personal data — NEVER commit them.
<!-- SPECKIT END -->

## Active Technologies
- **Frontend**: TypeScript 5.7, React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, React Router 7, Vite 6, Vitest
- **Backend**: Python 3.12, Django 5.x, Django REST Framework 3.x, PostgreSQL 16, drf-spectacular, django-q2, httpx, gunicorn, uv
