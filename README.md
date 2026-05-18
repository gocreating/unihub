# UniHub

Your personal life OS — one dashboard to capture, organise, and browse everything that matters to you.

Most productivity tools are built for a single purpose: a contacts app, a music library, a vocabulary trainer, a finance tracker. UniHub replaces the mental overhead of juggling all of them by bringing every dimension of daily life under one roof. As new areas of your life become worth tracking, a new domain is connected to the hub.

## Domains

More domains are added over time. The interface stays the same; only the data behind it grows.

### Finance
Track accounts, transactions, and net worth over time. (`/finance` · `/api/finance/`)

### Visiting
Log places you've been and plan where you want to go next. (`/visiting` · `/api/visiting/`)

### Language Learning
Personal reference library for languages you're studying. (`/language` · `/api/language/`)

**Language** — one record per language being tracked.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name, e.g. "Japanese" |
| `code` | string | ISO 639-1, e.g. "ja" — unique |
| `notes` | text | Free-form study notes |

**WordCard** — a vocabulary flashcard.

| Field | Type | Notes |
|---|---|---|
| `language` | FK → Language | |
| `word` | string | The word in the target language |
| `translation` | string | Primary translation |
| `romanization` | string | Optional — romaji, pinyin, transliteration |
| `example` | text | Example sentence(s) |
| `notes` | text | Personal mnemonics or context |
| `tags` | string[] | e.g. `["n5", "verb", "daily"]` |

**GrammarSheet** — a free-form Markdown document covering a grammar point or pattern.

| Field | Type | Notes |
|---|---|---|
| `language` | FK → Language | |
| `title` | string | e.g. "て-form conjugation" |
| `content` | text (Markdown) | Full explanation with examples |
| `tags` | string[] | e.g. `["verb", "conjugation"]` |

Future: spaced-repetition scheduling, Anki import/export.

### People
A personal contact list and relationship network. (`/people` · `/api/people/`)

**Person** — one record per person you want to track.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Full name |
| `nickname` | string | Optional short name |
| `email` | email | Optional |
| `phone` | string | Optional |
| `notes` | text | Personal observations, shared history, etc. |
| `tags` | string[] | e.g. `["tokyo", "tech", "climbing"]` |

**Relationship** — a directed edge between two people (e.g. "Alice is my colleague").

| Field | Type | Notes |
|---|---|---|
| `from_person` | FK → Person | |
| `to_person` | FK → Person | |
| `kind` | string | e.g. "friend", "colleague", "family", "mentor" |
| `notes` | text | Optional context |
| Unique on | `(from_person, to_person, kind)` | Prevents duplicate edges |

Future: graph visualisation, interaction log, birthday reminders.

### Music
A personal song collection with ratings, tags, and notes. (`/music` · `/api/music/`)

**Song** — one record per song in your collection.

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `artist` | string | |
| `album` | string | Optional |
| `year` | integer | Optional, e.g. 2003 |
| `genre` | string | Optional, e.g. "jazz", "city pop" |
| `language` | string | Optional, e.g. "Japanese", "English" |
| `rating` | integer | Optional, 1–5 |
| `notes` | text | Personal comments, mood associations, etc. |
| `tags` | string[] | e.g. `["road-trip", "focus", "90s"]` |

Future: MusicBrainz metadata lookup, playlist groupings, linked streaming URL.

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
    DEPLOY.md    #   Deployment runbook
.env.example     # Template — copy to apps/unihub/.env for production
CLAUDE.md        # AI dev guidelines
```
