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

**Branch**: `014-inventory-app` | **Plan**: [specs/014-inventory-app/plan.md](specs/014-inventory-app/plan.md)

Inventory domain from GitHub issue #33: an entity-centric Django app (`inventory`) + frontend section for cataloging **Items**, recording how each was obtained (**Acquisition**, with 1..N signed **CostFactor**s → per-currency `net_cost`), and per-situation planning via **Scenario** packing trees. Iterations 1–13 shipped (acquisition-first creation, cost factors, merged "Catalog" tree page with server-side filter/sort/pagination + flatten-on-item-filter, data_io registration, HTML legacy import, derived Item/Parameters/Acquisition columns + two-row datetime — see spec.md Clarifications for the full trail). Iterations 14 (dynamic parameters on core AttributeDefinition/AttributeValue + `attr:<id>` columns; constraints/checklist removed, Backlog+Organize detail) and 15 (merged single-item catalog rows, ×N tertiary, 4-case dates, zero-cost hidden, footer totals hook, legacy-import fixes + full 2026 re-import) shipped. **Iteration 16 (2026-07-12)** in progress — **Toggle column + parameter editor polish + scenario organize redesign**: the Catalog caret becomes a real pinnable **Toggle** `ColumnDef` (sticky-left by default via a new `defaultSticky` seed in `useColumnConfig`); **ParameterRowsEditor** adopts the form grid and gains user-definition deletion (count-confirm via the core two-step delete); scenario detail = standalone name/description panel + **Organize** card with an **Add** search modal (highlighted matches, `url` hyperlinks, disabled member rows) and an AntD **Splitter** (left/right wide ↔ top/bottom narrow): unorganized flat list ↔ organized draggable tree, cross-pane drag both ways via a native HTML5 DnD bridge (tree items only "sent back", never removed); Backlog panel removed. Backend: `ScenarioItem.organized` boolean (migration 0013) + `move {container_id, index, organized}` (unorganize re-parents children to organized top level). See [plan.md](specs/014-inventory-app/plan.md) and [research.md](specs/014-inventory-app/research.md).
<!-- SPECKIT END -->

## Active Technologies
- **Frontend**: TypeScript 5.7, React 18.3, Ant Design 5.24, @ant-design/pro-components 2.8, TanStack React Query 5, React Router 7, Vite 6, Vitest
- **Backend**: Python 3.12, Django 5.x, Django REST Framework 3.x, PostgreSQL 16, drf-spectacular, django-q2, httpx, gunicorn, uv
