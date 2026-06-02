# Data Model: Pipeline and Release Management

## No New Database Models

This feature does not introduce any new database tables or migrations.

---

## Version Setting (Django settings.py)

A new `VERSION` string is computed at Django startup from `pyproject.toml`:

| Setting | Type | Example | Notes |
|---------|------|---------|-------|
| `VERSION` | `str` | `"v2026.06.03.1"` | Formatted display version; zero-padded month/day, `v` prefix |

**Derivation**:
- Source: `apps/unihub/backend/pyproject.toml` → `[project].version` field
- Format: raw `YYYY.M.D.N` → display `vYYYY.MM.DD.N`
- Computed once at startup in `unihub/settings.py`

---

## System Django App

A new `system` app (no models, no migrations) following the `health/` app pattern.

### `system/views.py`

**`VersionView`** — `GET /api/v1/system/version/`

| Response field | Type | Example | Notes |
|----------------|------|---------|-------|
| `version` | `string` | `"v2026.06.03.1"` | The display version from `settings.VERSION` |

Returns HTTP 200 with `{"version": "<display_version>"}`. No authentication required (public endpoint, same as health check).

### `system/urls.py`

```
GET /api/v1/system/version/  →  VersionView
```

---

## Version Source of Truth: pyproject.toml

**File**: `apps/unihub/backend/pyproject.toml`

**Field**: `[project].version`

**Format**: `YYYY.M.D.N` (unpadded, PEP 440 compatible)

**Increment rules**:
- When releasing on a new calendar day: set to `YYYY.M.D.1`
- When releasing multiple times in one day: increment `N` (e.g., `2026.6.3.1` → `2026.6.3.2`)
- The `N` counter is a manual developer increment — no automation infers it

---

## GitHub Actions Workflow Artifacts

Two new YAML files under `.github/workflows/`:

### `ci.yml` — Continuous Integration

| Trigger | Branches | Jobs |
|---------|----------|------|
| `push`, `pull_request` | all | `frontend-ci`, `backend-ci` (independent) |

**`frontend-ci` job steps**:
1. Checkout
2. Setup Node + pnpm
3. `pnpm install`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm test`

**`backend-ci` job steps**:
1. Checkout
2. Setup Python 3.12 + uv
3. Start PostgreSQL service
4. `uv sync`
5. `uv run ruff check .`
6. `uv run pytest`

### `release.yml` — Release Automation

| Trigger | Branch | Condition |
|---------|--------|-----------|
| `push` | `main` | Version in `pyproject.toml` changed vs. `HEAD~1` |

**Steps** (conditional on version bump):
1. Checkout (with `fetch-depth: 2` for `HEAD~1` comparison)
2. Detect version bump (compare `pyproject.toml` versions)
3. Format display version (`v`-prefixed, zero-padded)
4. Create GitHub release via `gh release create` with `--generate-notes`

---

## Frontend Service

**File**: `apps/unihub/frontend/src/services/unihub-backend/system.ts`

```
getSystemVersion() → Promise<{ version: string }>
```

Types generated from `openapi.yaml` (regenerated after backend implementation).

---

## i18n Keys

New locale keys required in both `en-US` and `zh-TW` locale files:

| Key | en-US | zh-TW |
|-----|-------|-------|
| `menu.system` | `System` | `系統` |
| `menu.system.profile` | `Profile` | `概覽` |
| `pages.system.profile.title` | `System Profile` | `系統概覽` |
| `pages.system.profile.version` | `Version` | `版本` |
