# unihub

Your personal life OS — one dashboard to capture, organise, and browse everything that matters to you.

Most productivity tools are built for a single purpose: a contacts app, a music library, a vocabulary trainer, a finance tracker. unihub replaces the mental overhead of juggling all of them by bringing every dimension of daily life under one roof. As new areas of your life become worth tracking, a new domain is connected to the hub.

## Domains

| Domain | What you can do |
|--------|----------------|
| **Finance** | Track accounts, transactions, and net worth over time |
| **Visiting** | Log places you've been and plan where you want to go next |
| **Language** | Build word card decks and grammar cheat sheets for languages you're learning |
| **People** | Maintain a contact list and map the relationships between the people in your life |
| **Music** | Curate a personal song collection with ratings, tags, and notes |

More domains are added over time. The interface stays the same; only the data behind it grows.

## Philosophy

- **Personal, not collaborative** — built for one user, not a team. No sharing, no permissions overhead.
- **Owned data** — self-hosted with Docker. Your data lives in your own PostgreSQL database.
- **Breadth over depth** — each domain starts simple and grows only when there's a real need.
- **One backend, one database** — all domains share a single Django project and PostgreSQL instance. No microservices.

## Deployment

See [apps/unihub/DEPLOY.md](apps/unihub/DEPLOY.md) for local and production runbooks.

**Local (Docker — recommended)**
```bash
docker compose -f apps/unihub/docker-compose.local.yml up -d
```
Frontend → http://localhost:3000 · Backend API → http://localhost:8000/api/docs/

## Development Quick Start

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
    frontend/    # Single hub SPA (React + Vite + Ant Design)
    backend/     # Django project — one DB, all domain apps inside
      finance/   #   Finance domain
      visiting/  #   Visiting domain
      language/  #   Language learning domain
      people/    #   People & relationships domain
      music/     #   Music collection domain
      health/    #   Health check endpoint
    docker-compose.local.yml
    docker-compose.production.yml
    specs/       #   Domain specs (entity models, field docs)
    DEPLOY.md    #   Deployment runbook
.env.example     # Template — copy to apps/unihub/.env for production
CLAUDE.md        # AI dev guidelines
```
