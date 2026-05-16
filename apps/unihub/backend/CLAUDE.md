# Dashboard Backend — AI Dev Guidelines

Single Django project serving all unihub domain apps over one database.

> **Reference**: `ov-fleet/backend/` (`/Users/gocreating/projects/OverviewCorporation/ov-pro-tools/apps/ov-fleet/backend`) — follow its app layout, viewset patterns, serializer conventions, and test structure.

## Tech Stack

- **Runtime**: Python 3.12
- **Framework**: Django 5 + Django REST Framework 3
- **Database**: PostgreSQL 16 (via psycopg3 + dj-database-url)
- **OpenAPI**: drf-spectacular → `/api/docs/` (Swagger UI)
- **Static files**: WhiteNoise (Django admin CSS/JS at `/djstatic/`)
- **Package manager**: `uv`
- **Linter**: ruff
- **Tests**: pytest-django

## Project Structure

```
backend/
  unihub/          # Django project root
    settings.py
    urls.py        # Root router — includes each domain's urls.py
    wsgi.py
  finance/         # Finance domain app
    models.py      # Finance entities
    views.py       # DRF ViewSets
    serializers.py
    urls.py
    migrations/
  visiting/        # Visiting domain app
    models.py
    views.py
    serializers.py
    urls.py
    migrations/
  health/          # Health check — GET /api/health/
  manage.py
  pyproject.toml
  Dockerfile
  entrypoint.sh
```

## URL Namespace Convention

Each domain app owns a URL prefix in `unihub/urls.py`:

```
/api/finance/   → finance app
/api/visiting/  → visiting app
/api/health/    → health app
/api/docs/      → Swagger UI
/admin/         → Django admin
/djstatic/      → WhiteNoise static files
```

## Adding a New Domain App

1. `mkdir <domain> && touch <domain>/__init__.py <domain>/models.py <domain>/views.py <domain>/serializers.py <domain>/urls.py`
2. Add to `INSTALLED_APPS` in `unihub/settings.py`
3. Add `path('api/<domain>/', include('<domain>.urls'))` in `unihub/urls.py`
4. Run `uv run python manage.py makemigrations <domain>`

## Quality Loop

```bash
uv run ruff check .
uv run pytest
```
