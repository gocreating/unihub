# Developer Quickstart: Data Sync Across Devices

**Feature**: 004-data-sync-devices

---

## Prerequisites

- Docker + Docker Compose (local dev stack running)
- A private GitHub repository to use as the sync target (create one at github.com/new — keep it empty)
- A GitHub Personal Access Token with **Contents: Read and Write** permission scoped to that repository ([create one here](https://github.com/settings/tokens?type=beta))

---

## 1. Start the dev stack

```bash
cd apps/unihub
docker compose -f docker-compose.local.yml up -d
```

Backend runs at `http://localhost:8000`, frontend at `http://localhost:3000`.

---

## 2. Apply the migration

```bash
docker compose -f docker-compose.local.yml exec backend uv run python manage.py migrate sync
```

---

## 3. Verify the backend endpoints

```bash
# Check status endpoint exists (should return 400 "not_configured", not 404)
curl -s -b "sessionid=<your-session>" http://localhost:8000/api/v1/sync/status/
```

Or open the Swagger UI at `http://localhost:8000/api/docs/` and look for the `/sync/` group.

---

## 4. Try the Sync tab in the UI

1. Log in at `http://localhost:3000`
2. Navigate to **System → Import/Export**
3. Click the **Sync** tab
4. Fill in:
   - **Repository URL**: `https://github.com/<you>/<your-private-repo>`
   - **Personal Access Token**: paste your fine-grained PAT
   - **Device name**: `dev-machine` (or any label)
5. Click **Save Configuration**
6. The tab should automatically check remote status and show "No remote commits yet"
7. Click **Publish** — after a moment you should see a commit appear in your GitHub repo

---

## 5. Test the full round-trip

On a second device (or by temporarily modifying DB data directly):

1. Change some data in unihub (e.g., add a finance account)
2. Return to the Sync tab and click **Publish** → verify a new commit on GitHub
3. On the second device, open the Sync tab and click **Apply Latest**
4. Confirm the preview → verify the data matches

---

## 6. Run the quality loop

**Backend** (from `apps/unihub/backend/`):
```bash
uv run ruff format .
uv run ruff check . --fix
uv run pytest sync/
```

**Frontend** (from `apps/unihub/frontend/`):
```bash
pnpm lint
pnpm typecheck
pnpm test
```

---

## Key files

| File | Purpose |
|---|---|
| `apps/unihub/backend/sync/models.py` | `SyncConfig` model |
| `apps/unihub/backend/sync/services/git_service.py` | Git clone/push/pull/status logic |
| `apps/unihub/backend/sync/services/crypto.py` | PAT Fernet encryption |
| `apps/unihub/backend/sync/views.py` | DRF views for all sync endpoints |
| `apps/unihub/backend/sync/urls.py` | URL routing |
| `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx` | Sync tab UI component |
| `apps/unihub/frontend/src/services/unihub-backend/sync.ts` | Frontend API service |
