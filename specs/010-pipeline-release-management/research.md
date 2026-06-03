# Research: Pipeline and Release Management

## 1. Calendar Versioning Format

**Decision**: Store `YYYY.M.D.N` (unpadded) in `pyproject.toml`; display and tag as `vYYYY.MM.DD.N` (zero-padded, `v` prefix).

**Rationale**: PEP 440 prohibits leading zeros in numeric version segments (`2026.06.03.1` is invalid; `2026.6.3.1` is valid). The display/tag format (`v2026.06.03.1`) is purely cosmetic and does not need to be PEP 440 compliant. The backend API returns the tag-format string (zero-padded with `v` prefix), formatted from the parsed pyproject.toml version.

**Alternatives considered**:
- Store the full padded string as a non-PEP-440 version: rejected because `uv` validates PEP 440 on install.
- Use a separate `VERSION` file outside pyproject.toml: rejected — adds redundancy and a second source of truth.

**Implementation note**: The `N` counter is a manual increment by the developer (e.g., `2026.6.3.1` → `2026.6.3.2` for a second release on the same day). No automation infers it — the developer bumps it.

---

## 2. Version Reading in Django

**Decision**: Read `pyproject.toml` using `tomllib` (Python 3.11+ stdlib) in `settings.py` at startup. Store in `settings.VERSION` as the formatted display string.

**Rationale**: `tomllib` is part of the Python 3.12 stdlib (already in use). No additional dependency. Reading at startup is fine — the file is static; reading on every request would be wasteful.

**Format transformation in settings.py**:
```python
import tomllib
with open(BASE_DIR / 'pyproject.toml', 'rb') as f:
    _meta = tomllib.load(f)
_raw = _meta['project']['version']          # e.g. "2026.6.3.1"
_parts = _raw.split('.')                    # ["2026", "6", "3", "1"]
VERSION = f"v{_parts[0]}.{int(_parts[1]):02d}.{int(_parts[2]):02d}.{_parts[3]}"
# → "v2026.06.03.1"
```

**Alternatives considered**:
- `importlib.metadata.version('unihub-backend')`: only works when the package is installed, not in development without `uv pip install -e .`. Rejected for fragility.
- Environment variable injected at deploy time: rejected — disconnects version from code; drift-prone.

---

## 3. GitHub Actions: CI Workflow Structure

**Decision**: Two workflow files:
1. `ci.yml` — triggered on `push` to all branches and `pull_request`. Runs frontend and backend quality/test jobs independently (they can fail independently).
2. `release.yml` — triggered on `push` to `main` only. Detects version bump; if bumped, creates a GitHub release with `--generate-notes`.

**Rationale**: Separate files keep CI and release concerns isolated. Two independent jobs (frontend, backend) in `ci.yml` allow faster feedback when only one side changes.

**Version bump detection** in `release.yml`:
```yaml
- name: Get current version
  id: cur
  run: |
    echo "ver=$(grep '^version' apps/unihub/backend/pyproject.toml | cut -d'"' -f2)" >> "$GITHUB_OUTPUT"

- name: Get previous version
  id: prev
  run: |
    git fetch --depth=2
    PREV=$(git show HEAD~1:apps/unihub/backend/pyproject.toml 2>/dev/null \
      | grep '^version' | cut -d'"' -f2 || echo "")
    echo "ver=$PREV" >> "$GITHUB_OUTPUT"

- name: Detect bump
  id: bump
  run: |
    if [ "${{ steps.cur.outputs.ver }}" != "${{ steps.prev.outputs.ver }}" ]; then
      echo "bumped=true" >> "$GITHUB_OUTPUT"
    else
      echo "bumped=false" >> "$GITHUB_OUTPUT"
    fi
```

**Alternatives considered**:
- Tag-based detection (only release if no tag exists for this version): more robust against squash-merges but complex. Deferred.
- `semantic-release` or `release-please` tools: heavy, opinionated, and add a dependency. Rejected for a personal project.

---

## 4. Auto-Generated Release Notes

**Decision**: Use GitHub's built-in `--generate-notes` flag in `gh release create`. Optionally add a `.github/release.yml` configuration file to control which PR labels are grouped.

**Rationale**: No external tool required. GitHub's release notes generator groups PRs by label. For a personal project with no label policy, the default grouping ("Full Changelog" link + PR list) is sufficient.

**Alternatives considered**:
- Manual release notes via `RELEASE_NOTES.md`: defeats the "zero manual steps" success criterion.
- Changelog tools (conventional-changelog, git-cliff): useful but add dependencies. Deferred to a future iteration.

---

## 5. Frontend Version Display

**Decision**: Fetch version from `GET /api/v1/system/version/` using TanStack React Query. Display in a simple `<Descriptions>` component on the System > Profile page. No caching TTL override — default React Query stale time is acceptable.

**Rationale**: Consistent with the project's API-contract-driven pattern (Principle IV). The version doesn't change during a session, so any stale time is fine.

**Alternatives considered**:
- Inject version at build time via Vite's `define` (from `VITE_APP_VERSION` env var): doesn't reflect the deployed backend version; rejected.
- Read from `package.json` `version` field: frontend and backend versions could diverge; rejected.
