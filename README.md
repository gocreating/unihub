# unihub

A single, growing dashboard that serves as a personal central hub — one place to manage and visualize all dimensions of daily life. The dashboard frontend is the consistent interaction surface; new domains (finance, geography, travel, health, tasks, …) are connected to the hub over time as the project grows.

## Apps

| App | Path | Stack |
|-----|------|-------|
| Dashboard (frontend) | `apps/unihub/frontend/` | React 18 + Vite + Ant Design 5 + TanStack Query |
| Dashboard (backend) | `apps/unihub/backend/` | Python 3.12 + Django 5 + DRF + PostgreSQL |

## Quick Start

**Frontend**
```bash
cd apps/unihub/frontend
pnpm install
pnpm dev
```

**Backend**
```bash
cd apps/unihub/backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

## Development

**Package managers**: `pnpm` (frontend), `uv` (backend) — never use npm, yarn, or pip directly.

**Quality loops**

Frontend — run from `apps/unihub/frontend/`:
```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript strict check
pnpm test        # Vitest
```

Backend — run from `apps/unihub/backend/`:
```bash
uv run ruff check .   # Ruff linter
uv run pytest         # pytest-django
```

## Repository Structure

```text
apps/
  unihub/
    frontend/    # Single hub SPA
    backend/     # Django project — one DB, domain apps inside
      unihub/    #   Django project root (settings, urls, wsgi)
      finance/   #   Finance domain app
      visiting/  #   Visiting domain app
      health/    #   Health check
    docker-compose.local.yml
    docker-compose.production.yml
    specs/
.env.example     # Template — copy to apps/unihub/.env for production
.claude/
  commands/      # Speckit slash commands
CLAUDE.md        # AI dev guidelines
```

## Reference

Architecture is modelled after [ov-fleet](../OverviewCorporation/ov-pro-tools/apps/ov-fleet) — the primary reference for backend layout, service layer conventions, and frontend organization.
