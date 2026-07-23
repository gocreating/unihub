# Quickstart: Entity Views

**Feature**: 016-entity-views

## Run the stack

```bash
# Backend (from apps/unihub/backend/) — API on :8001
uv run python manage.py migrate
uv run python manage.py runserver 8001

# Frontend (from apps/unihub/frontend/) — dev server on :3001
pnpm install
pnpm dev
```

## Try the feature (inventory catalog is the reference table)

1. Open `http://localhost:3001/inventory/catalog` — above the Filter/Sort/Columns toolbar you should see the view row: `[+] [Tabular] … [View]`, with **Tabular** active.
2. Change a filter + hide a column → the Tabular tab shows the unsaved dot; the URL now carries `view[inventory-catalog]=type=inline&…`.
3. **Save**: View ▾ → Save → name it → the tab becomes a named saved view, dot clears.
4. **Reopen**: switch to Tabular, then View ▾ → pick your view → exact config restores (filters, sort, columns, pins, page size).
5. **Pin & manage**: View ▾ → Edit → pin it, drag to reorder, rename — changes apply only on the modal's Save (deletions confirm first).
6. **Deep link**: copy the URL mid-configuration, open it in a private window (log in) → identical table state. Try `…&page_size=100` appended inside the param as a saved-view override → dirty dot appears.
7. **Duplicate**: View ▾ → Duplicate → new unsaved tab "X (1)".
8. **Narrow screen**: shrink the window — tabs scroll horizontally; `[+]` and `[View]` stay at the edges.

## Verify (quality loop)

```bash
# Backend — from apps/unihub/backend/
uv run ruff format . && uv run ruff check . --fix
uv run pytest tests/test_entity_views.py     # feature suite
uv run pytest                                # full suite

# Frontend — from apps/unihub/frontend/
pnpm lint && pnpm typecheck
pnpm test -- EntityViews                     # serialization + hook + component suites
pnpm test                                    # full suite
pnpm build                                   # tsc -b, stricter than typecheck — run before committing

# e2e (dev server must already be running on :3001)
pnpm exec playwright test e2e/entity-views.spec.ts
```

## Regenerate API types after backend changes

```bash
# backend running on :8001
cd apps/unihub/frontend && pnpm generate-types
```

## Key files

| Concern | Path |
|---------|------|
| Model / API | `apps/unihub/backend/core/{models,serializers,views,urls}.py` |
| Backend tests | `apps/unihub/backend/tests/test_entity_views.py` |
| Serialization | `apps/unihub/frontend/src/components/EntityViews/serialization.ts` |
| Hook | `apps/unihub/frontend/src/components/EntityViews/useEntityViews.ts` |
| UI | `apps/unihub/frontend/src/components/EntityViews/{ViewTabs,ViewDropdown,ManageViewsModal,SaveViewModal}.tsx` |
| PageTable slot | `apps/unihub/frontend/src/components/PageTable/index.tsx` (`viewBar` prop) |
| Service | `apps/unihub/frontend/src/services/unihub-backend/core.ts` |
| i18n | `apps/unihub/frontend/src/locales/{en-US,zh-TW}/pages.ts` (`common.entityViews.*`) |

## Round 2 manual walk-through (2026-07-23)

On the inventory catalog (`/inventory/catalog`), after migrations (`uv run python manage.py migrate`):

1. **Auto-hide + reveal**: with no saved views, the view row is hidden; a compact affordance near the toolbar reveals it. The revealed row shows one active tab named **"YTD"** (other pages: "Table").
2. **"+" placement**: the "+" button sits immediately right of the rightmost tab; open enough tabs to overflow — tabs scroll, "+" stays visible at the strip's right edge, View control stays at the row edge.
3. **Default is a plain view**: change a filter on YTD → dirty dot; Save → persists (row materializes, `is_default=true`); double-click the tab → inline rename works; the manage modal offers rename/pin but no delete/drag on the default row.
4. **Double-click rename**: double-click a saved tab → inline input (Enter/blur commits, Esc cancels, duplicate name shows an error); double-click an anonymous tab → name-and-save modal.
5. **Readable URLs**: with YTD clean and revealed-only state, the URL has NO view params; switch to a saved view → `?inventory-catalog.view=<name>`; edit filters → readable `inventory-catalog.f=…` facets appear; paste a hand-edited `…size=100` and the table follows.
6. **Git sync**: publish from the Sync tab → the views CSV appears in the commit (no owner column); wipe/checkout → views come back owned by the signed-in account, and a fresh publish preview shows zero view diffs.
