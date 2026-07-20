# Quickstart — Data Migration Refinement (015)

## Where the work lives

- **Backend**: `apps/unihub/backend/sync/` (views, serializers, `services/git_service.py`,
  `services/publish_helper.py`, `services/apply_helper.py`), shared diff machinery in
  `apps/unihub/backend/data_io/services/` (`csv_exporter.py`, `csv_importer.py`,
  `change_preview.py`), registry FK metadata in `data_io/registry.py`.
- **Frontend**: `apps/unihub/frontend/src/pages/io/SyncTab/index.tsx` (tab UI → gains the
  commit graph, loses the four legacy buttons),
  `src/components/ImportExport/ChangePreviewTable.tsx` (staging checkboxes + compliant
  footer), `src/services/unihub-backend/sync.ts` (service layer).
- **Tests**: `apps/unihub/backend/tests/sync/` (uses the `bare_repo` fixture —
  local bare repo + `file://` URL, no network); frontend RTL colocated per house style.

## Dev loop

```bash
# Backend (from apps/unihub/backend/) — test-first, reproduction before fix
uv run pytest tests/sync/ -x
uv run ruff format . && uv run ruff check . --fix
uv run pytest

# OpenAPI → frontend types (after serializer/view changes)
uv run python manage.py spectacular --file openapi.yaml   # or the project's schema task
# then from apps/unihub/frontend/:
pnpm generate:api   # openapi-typescript (see package.json scripts for exact name)

# Frontend (from apps/unihub/frontend/)
pnpm lint && pnpm typecheck && pnpm test
pnpm build          # stricter than typecheck — run before committing (memory rule)
```

## Manual verification against a throwaway remote

1. Create a scratch bare repo: `git init --bare /tmp/claude-scratch-sync.git` and
   configure the Sync tab with `file:///tmp/claude-scratch-sync.git` + any PAT string
   (file transport ignores it) — or use a private GitHub scratch repo.
2. Seed multi-year inventory data (the legacy import management command, or fixtures).
3. Exercise: publish → graph shows the commit; edit rows → preview shows exactly those
   rows; uncheck some → publish → unchecked reappear in next preview; checkout an older
   commit → DB matches snapshot; force-push the scratch remote from a shell → graph
   flags rewritten history; commit with a doctored CSV header (drop a required column)
   → node disabled with reason.

## Definition of done (per constitution)

- All new/changed backend endpoints covered by pytest (happy + error paths), written
  before implementation; the FR-004 filter regression test exists and passes.
- `openapi.yaml` regenerated; frontend uses regenerated types; zero hand-written
  response types added.
- `pnpm lint` (0 warnings) / `pnpm typecheck` / `pnpm test` / `pnpm build` and
  `uv run ruff format .` / `uv run ruff check .` / `uv run pytest` all green.
- All new UI strings in both `en-US` and `zh-TW` locale files; counts use ICU plurals.
- Preview-table footer matches the constitution layout (RTL-locked).
