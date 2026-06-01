# Claude Development Guidelines — unihub Monorepo

**unihub** is a single, growing dashboard that serves as a personal central hub — one place to manage and visualize all dimensions of a user's daily life. As the project evolves, new domains get connected to the hub: finance, geography, travel, health, tasks, and whatever comes next. The dashboard frontend is the consistent interaction surface; backends and data sources expand behind it over time.

> **Reference implementation**: `ov-fleet` (`/Users/gocreating/projects/OverviewCorporation/ov-pro-tools/apps/ov-fleet`) — the primary architectural reference. Follow its patterns for backend layout, service layer, and frontend organization.

## Core Architecture: Entity-Centric Domains

Every domain is built around **entities** — the user creates and manages entities scoped to that domain. There is one backend (one Django project, one database) with each domain implemented as a standalone Django app inside it.

```
apps/
  unihub/
    frontend/    # Single hub SPA
    backend/     # Single Django project — one DB, domain apps inside
      unihub/    # Django project (settings, urls, wsgi)
      finance/   # Django app — finance entities
      visiting/  # Django app — visiting entities
      language/  # Django app — language learning (WordCard, GrammarSheet)
      people/    # Django app — people & relationships (Person, Relationship)
      music/     # Django app — song collection (Song)
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
    <domain>/             # One Django app per domain (finance, geography, …)
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
  geography.ts      # Geography/map domain endpoints
  auth.ts
  types.ts          # Barrel — re-export all API types
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
3. Add the domain's pages under `apps/unihub/frontend/src/pages/<domain>/`
4. Add a nav section entry in `AppShell.tsx`
5. Add a service file at `apps/unihub/frontend/src/services/<domain>.ts`

<!-- SPECKIT START -->
## Active Feature

**Branch**: `009-fix-finance-sync` | **Plan**: [specs/009-fix-finance-sync/plan.md](specs/009-fix-finance-sync/plan.md)

Systematic fix for data sync field omissions. Root cause: `finance/apps.py` manually hardcodes field lists; `Currency.is_base_currency` and `Account.color` were added after initial registration and silently omitted. Fix: (1) add missing fields immediately; (2) implement `auto_system_fields(model_class)` in `data_io/registry.py` that derives `FieldDescriptor` objects from `model._meta.concrete_fields` automatically — any future field addition is included in sync without manual updates. Also fixes `Account.created_at`/`updated_at` and `BalanceSheet.created_at`/`updated_at`. Adds regression test `test_sync_field_coverage.py` asserting all model fields are registered. Backend-only; no migrations.
<!-- SPECKIT END -->

## Active Technologies
- **Frontend**: TypeScript 5.7, React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, React Router 7, Vite 6, Vitest
- **Backend**: Python 3.12, Django 5.x, Django REST Framework 3.x, PostgreSQL 16, drf-spectacular, django-q2, httpx, gunicorn, uv
