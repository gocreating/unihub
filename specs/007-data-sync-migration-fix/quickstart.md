# Quickstart: Data Sync Migration Fix & Publish Preview

## Prerequisites

- Docker Compose running (`docker-compose -f apps/unihub/docker-compose.local.yml up`)
- Or Django dev server: `cd apps/unihub/backend && uv run python manage.py runserver`
- Frontend dev server: `cd apps/unihub/frontend && pnpm dev`
- Sync configured (GitHub repo URL + PAT set via the Sync tab)

---

## Part 1: Verify the Bug Fix (Missing Table Registrations)

### Check that language/music/people tables are now included in IO

1. Navigate to **IO → Export** tab in the UI.
2. Verify that the table list now includes:
   - "Languages", "Word Cards", "Grammar Sheets" (language domain)
   - "Songs" (music domain)
   - "Persons", "Relationships" (people domain)

### Verify sync includes all tables

1. Add at least one record to a language, music, or people table via the UI.
2. Navigate to **IO → Sync** tab.
3. Click "Publish" (or "Preview Changes" after the feature is implemented).
4. Verify the committed snapshot in the GitHub repository includes CSV files for `language_language.csv`, `language_wordcard.csv`, `music_song.csv`, `people_person.csv`, etc.

### Verify import round-trip

1. Export all tables to ZIP.
2. Delete all records from language/music/people tables.
3. Import the ZIP.
4. Verify records are restored.

---

## Part 2: Test the Publish Preview Feature

### Normal flow (changes exist)

1. With sync configured, make a change to any table (add or edit a record).
2. Navigate to **IO → Sync** tab.
3. Click **"Publish"** (button has been repurposed to trigger preview first).
4. Verify an inline preview section appears showing per-table change summary:
   - Table name and display name visible
   - Counts for Added / Modified / Deleted visible
   - Only tables with changes are shown
5. Click **"Confirm & Publish"** — verify publish succeeds (success message shows commit SHA).
6. Click **"Cancel"** instead — verify no commit is pushed (check GitHub repo).

### Up-to-date flow (no changes)

1. Publish successfully (nothing changes after last publish).
2. Click **"Publish"** again immediately.
3. Verify an info toast appears: "Nothing to publish — already up to date."
4. No preview section appears.

### First-ever publish

1. Configure sync against a fresh empty GitHub repository.
2. Click **"Publish"**.
3. Verify preview shows all local records as "Added" with `status: no_prior_publish`.
4. Confirm — verify commits appear in the repo.

### Diverged history flow

1. Publish from Device A.
2. Push a manual commit to GitHub (simulating Device B's publish).
3. Modify data on Device A.
4. Click "Publish" on Device A — verify preview still appears.
5. Confirm — verify the diverged-history warning modal appears (existing behaviour, unchanged).

---

## Part 3: Quality Loop

**Backend** (from `apps/unihub/backend/`):

```bash
uv run ruff format .
uv run ruff check . --fix
uv run pytest
```

Key tests to watch:
- `tests/sync/test_views_publish.py` — new publish preview tests
- All existing `tests/sync/` tests must still pass

**Frontend** (from `apps/unihub/frontend/`):

```bash
pnpm lint
pnpm typecheck
pnpm test
```

---

## Part 4: Backend API Smoke Test (curl)

```bash
# Get publish preview (requires active session cookie)
curl -s http://localhost:8000/api/v1/sync/publish/preview/ \
  -H "Cookie: sessionid=<your-session-id>" | python3 -m json.tool

# Expected responses:
# {"status": "up_to_date"}
# {"status": "has_changes", "changes": [...]}
# {"status": "no_prior_publish", "changes": [...]}
```
