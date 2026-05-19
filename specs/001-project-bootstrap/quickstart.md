# Developer Quickstart: UniHub

**Branch**: `001-project-bootstrap` | **Date**: 2026-05-17

---

## Prerequisites

- Python 3.12+
- Node.js 20+ and pnpm 9+
- Docker + Docker Compose
- `uv` (Python package manager): `curl -LsSf https://astral.sh/uv/install.sh | sh`
- PostgreSQL 16 (via Docker or local install)

---

## 1. Clone and configure environment

```bash
git clone <repo-url>
cd unihub
cp .env.example apps/unihub/.env
# Edit apps/unihub/.env — set POSTGRES_PASSWORD, SECRET_KEY, etc.
```

---

## 2. Start the database

```bash
docker compose -f apps/unihub/docker-compose.local.yml up db -d
```

---

## 3. Backend setup

```bash
cd apps/unihub/backend
uv sync                          # Install Python dependencies
uv run python manage.py migrate  # Run migrations (creates schema + seeds system AttributeDefinitions)
uv run python manage.py createsuperuser  # Create your admin user
uv run python manage.py runserver 8000
```

API available at: http://localhost:8000/api/v1/
OpenAPI docs at: http://localhost:8000/api/docs/

---

## 4. Frontend setup

```bash
cd apps/unihub/frontend
pnpm install
```

Generate types from the running backend:
```bash
pnpm run generate-types
# Runs: openapi-typescript http://localhost:8000/api/schema/ -o src/generated/api-types.ts
```

Start the dev server:
```bash
pnpm dev
```

App available at: http://localhost:5173/

---

## 5. Run quality loop

Backend (from `apps/unihub/backend/`):
```bash
uv run ruff check .
uv run pytest
```

Frontend (from `apps/unihub/frontend/`):
```bash
pnpm lint
pnpm typecheck
pnpm test
```

---

## 6. Regenerate API types (after any backend model/serializer change)

```bash
# Backend must be running
cd apps/unihub/frontend
pnpm run generate-types
```

This overwrites `src/generated/api-types.ts`. Commit the updated file.

---

## 7. Production (Docker)

```bash
docker compose -f apps/unihub/docker-compose.production.yml up -d
```

Uses pre-built images. Requires `.env` with production values.

---

## Finance domain: first-time data setup

1. Log in at http://localhost:5173/
2. Navigate to **Finance → Accounts** — create your accounts (name, type, currency)
3. Navigate to **Finance → Exchange Rates** — add rates for non-base currencies
4. Navigate to **Finance → Balance Sheets** — create a snapshot, enter balances
5. Click on a balance sheet to see the net worth summary with per-currency subtotals

---

## Key file locations

| What | Where |
|---|---|
| Django settings | `apps/unihub/backend/unihub/settings.py` |
| Finance models | `apps/unihub/backend/finance/models.py` |
| Core (attr) models | `apps/unihub/backend/core/models.py` |
| Frontend entry | `apps/unihub/frontend/src/main.tsx` |
| App shell / sidebar | `apps/unihub/frontend/src/layouts/AppShell.tsx` |
| PageTable component | `apps/unihub/frontend/src/components/PageTable/index.tsx` |
| Finance pages | `apps/unihub/frontend/src/pages/finance/` |
| API service layer | `apps/unihub/frontend/src/services/unihub-backend/` |
| Generated types | `apps/unihub/frontend/src/generated/api-types.ts` |
