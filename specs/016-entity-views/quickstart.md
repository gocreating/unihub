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
| UI | `apps/unihub/frontend/src/components/EntityViews/{ViewTabs,ViewTabMenu,ViewKebab,ManageViewsModal,SaveViewModal}.tsx` |
| Shared drag | `apps/unihub/frontend/src/components/EntityToolbar/SortableList.tsx` (`orientation` prop) |
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

## Round 3 manual walk-through (2026-08-03)

On the inventory catalog (`/inventory/catalog`), with the row revealed and at least three saved views:

1. **Hidden scrollbar + shadows**: open enough tabs to overflow the strip — no scrollbar renders at any scroll position; a shadow sits on the right edge at scroll 0, on both edges mid-scroll, and only on the left edge at the end (SC-009).
2. **Drag to reorder**: drag a tab past its neighbour — the strip reorders; reload the page and the order holds; open *Manage views…* and confirm the modal lists the same order (SC-010). Drag the default view too — it is no longer pinned to the first slot.
3. **Tab menu grammar**: left-click an inactive tab → it just switches. Left-click the now-active tab → its menu opens. Right-click any tab (active or not) → the same menu, no browser context menu.
4. **Menu contents**: the menu shows Save · Close · Duplicate · Pin/Unpin · Set as default · Rename · Delete, with inapplicable actions greyed out (Close/Delete on the default holder; Pin/Set as default/Delete on an anonymous tab; Save while clean). No `×` remains on the tab body, and double-clicking a tab does nothing.
5. **Set as default**: choose it on an ordinary saved view — it becomes pinned and its Delete/Close grey out; the previous default becomes deletable and closable; **neither tab moves** (SC-011). Reload: exactly one default.
6. **Kebab**: the row's right edge holds a single kebab — *Add empty view* opens an anonymous tab; *Open ▸* lists only views not already open (and shows a disabled empty-state entry when everything is open); *Manage views…* opens the modal. At 375px width with six tabs, the kebab stays fully visible without scrolling the strip (SC-006).
7. **Sync**: publish → checkout still restores which view holds the default role (SC-008).

## Round 4 manual walk-through (2026-08-04)

On the inventory catalog (`/inventory/catalog`), after `uv run python manage.py migrate` (adds 0007):

1. **Save never prompts**: kebab → *Add empty view* → a tab named **"New view"** opens with NO filters, NO sorting, every column visible in natural order, nothing pinned. Change a filter, open its menu → *Save* — the view is stored immediately, no dialog, dirty dot clears (SC-012).
2. **Rename dialog**: tab menu → *Rename* opens a modal pre-filled with the current name; edit and confirm to rename in place. Rename a second view to the SAME name — accepted (FR-016). Type `"  spaced  "` → stored trimmed; clear the field → the dialog refuses to submit.
3. **Duplicate**: tab menu → *Duplicate* produces a tab with the identical name (no "(1)" suffix); saving it creates a second stored view sharing that name, distinguishable by tab order.
4. **Set as default**: promote a view sitting third in the strip — it stays third, no tab jumps to the front, and neither it nor the previous default shows a dirty dot (SC-011). Reload: exactly one default.
5. **Drag**: drag a wide tab past a narrow one — the dragged tab keeps its own width the whole way (no stretching, SC-010); drop and reload to confirm the order persisted.
6. **Menus dismiss**: open a tab menu, click on the table body → the menu closes and nothing else happens; re-open and press Esc → closes.
7. **No Manage views**: the kebab shows only *Add empty view* and *Open ▸*. Manage a closed view by opening it from *Open ▸* first, then using its tab menu.
8. **URL by id**: activate a saved view → the URL reads `?inventory-catalog.view=<12-char id>`; rename that view and reload the same URL — it still resolves (renames no longer break links).

## Round 5 manual walk-through (2026-08-04)

1. **Refresh discards scratch work**: with a pinned view open, add two empty views and open an unpinned saved view; refresh. The row shows only the pinned views (plus the default holder) and the view the URL addresses — the scratch tabs are gone (SC-013).
2. **The URL keeps your place**: activate an unpinned saved view (URL shows `?<tableKey>.view=<id>`) and refresh — that view is still open and active even though it is not pinned.
3. **Unsaved changes travel only via the URL**: dirty a pinned view, switch to another tab, refresh — the pinned view comes back clean; dirty a view and refresh WITHOUT switching, and its overrides return from the URL with the dirty dot intact.
4. **Navigate away and back**: go to another page and return to the table — the row rebuilds exactly as in step 1 (no leftover tabs).
5. **The reveal preference survives**: on a table with only its default view, reveal the row, then refresh — the row stays revealed (FR-025).
6. **Confirmation footers**: trigger a destructive confirm anywhere in the app — delete a view from its tab menu, delete a finance account, delete a parameter definition — and check Cancel sits flush at the footer's LEFT edge with the danger action on the right (SC-014).
7. **Close label**: open any tab's menu — the item reads "Close", not "Close tab".
