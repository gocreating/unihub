# Quickstart: Pipeline and Release Management

## How to Release a New Version

1. **Determine the version number**
   - Use today's date: `YYYY.M.D.N` (unpadded, e.g., `2026.6.3.1`)
   - If this is the first release today, set `N=1`. For a second release on the same day, set `N=2`, etc.

2. **Update `pyproject.toml`**
   ```toml
   # apps/unihub/backend/pyproject.toml
   [project]
   version = "2026.6.3.1"   # ← update this line
   ```

3. **Commit and push to main**
   ```bash
   git add apps/unihub/backend/pyproject.toml
   git commit -m "chore: release v2026.06.03.1"
   git push origin main
   ```

4. **GitHub Actions does the rest**
   - Detects the version changed vs. the previous main commit
   - Creates a GitHub release tagged `v2026.06.03.1` with auto-generated release notes

---

## CI Pipeline Overview

Every push to any branch triggers two independent jobs:

| Job | Commands run |
|-----|-------------|
| `frontend-ci` | `pnpm lint` → `pnpm typecheck` → `pnpm test` |
| `backend-ci` | `uv run ruff check .` → `uv run pytest` |

Both must pass before a PR can be merged (branch protection rules recommended).

---

## Viewing the Current Version

1. Log in to the application
2. Navigate to **System → Profile** in the left sidebar
3. The current deployed version is displayed on the page

---

## Local Development — Version Endpoint

The version endpoint is available at:
```
GET http://localhost:8000/api/v1/system/version/
```

No authentication required. Returns:
```json
{"version": "v2026.06.03.1"}
```

The displayed version reflects the `version` field in `apps/unihub/backend/pyproject.toml` at the time the Django server was started.
