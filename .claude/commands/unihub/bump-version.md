---
name: unihub:bump-version
description: 'Bump the unihub backend version (CalVer YYYY.M.D.N) in pyproject.toml and uv.lock, then auto-commit and push. Use when the user asks to bump, release, or tag a new backend version, or mentions "/unihub:bump-version". Accepts an explicit version as argument; defaults to a version inferred from today''s date.'
argument-hint: '[version]'
allowed-tools: Bash, Read, Edit
---

# Bump unihub Backend Version

Bump the backend package version in both version-bearing files, commit, and push — in one shot.

Files owned by this command (and the ONLY files it may stage):

- `apps/unihub/backend/pyproject.toml` — `version = "..."` under `[project]`
- `apps/unihub/backend/uv.lock` — `version = "..."` inside the `[[package]] name = "unihub-backend"` entry

## 1. Determine the target version

The version scheme is **CalVer**: `YYYY.M.D.N` — year, month and day **without zero-padding**, plus a same-day serial `N` starting at `0` (e.g. `2026.7.20.1`, `2026.7.22.0`).

1. **Explicit version wins.** If the user supplied a version via `$ARGUMENTS` or conversation context, use it verbatim after checking it matches `^\d{4}\.\d{1,2}\.\d{1,2}\.\d+$`. If it doesn't match, stop and ask — do not guess a correction.
2. **Otherwise infer from today's date.** Read the current version from `pyproject.toml`, then:
   - Current version is from an earlier date → `YYYY.M.D.0` for today.
   - Current version already has today's date prefix → keep the prefix, increment the serial (`2026.7.22.0` → `2026.7.22.1`).

   ```bash
   date +%Y.%-m.%-d   # today's CalVer prefix, unpadded
   grep '^version' apps/unihub/backend/pyproject.toml
   ```
3. **Sanity check direction.** The new version must sort strictly after the current one. If the inferred/target version is lower than or equal to the current version (e.g. clock skew, stale branch), stop and report instead of committing a downgrade.

## 2. Apply the bump

1. Edit `apps/unihub/backend/pyproject.toml`: update the `[project]` `version` line.
2. Regenerate the lockfile from `apps/unihub/backend/`:

   ```bash
   cd apps/unihub/backend && uv lock
   ```

   If `uv` is unavailable or fails on network access, fall back to editing `uv.lock` directly: change the `version` line inside the `[[package]]` block whose `name = "unihub-backend"` — and **only** that line.
3. Verify: `git diff` must show exactly two files changed, one version line each (plus nothing else). Both files must show the same new version. If `uv lock` produced unrelated churn (dependency re-resolution), revert the lockfile and use the direct-edit fallback instead — a version bump commit must never smuggle in dependency updates.

## 3. Commit and push

Stage the two files by explicit path — never `git add apps/unihub` or `git add -A`:

```bash
git add apps/unihub/backend/pyproject.toml apps/unihub/backend/uv.lock
```

Commit message follows the repo precedent (see `git log --grep "bump backend version"`):

```
chore(unihub): bump backend version to <new-version>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

Then push to the current branch's upstream (`git push`; on first push of a new branch, `git push -u origin <branch>`). The user has pre-authorized commit + push for this command — do not stop to ask, including on `main`.

## 4. Report

Report back: old → new version, the commit hash and subject, and the branch pushed to.

## Safety

- NEVER stage anything beyond the two files above (no `.env`, no personal notes, no unrelated worktree changes).
- NEVER force push or skip hooks.
- If the push is rejected (non-fast-forward, hook failure), stop and report — do not retry with destructive flags. The local bump commit is fine to leave in place.
