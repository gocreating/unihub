# Quickstart — Inventory App Enhancements (018)

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

## Run the stack

```bash
# backend (from apps/unihub/backend/)
uv run python manage.py migrate
uv run python manage.py runserver

# frontend (from apps/unihub/frontend/)
pnpm dev
```

## US1 — accumulated cost ownership

1. Inventory → Catalog → **New acquisition**; add an item with SKU price
   `500 TWD`.
2. The Accumulated line shows `500`. Clear it (or type `0`) → Save.
3. Reopen the acquisition: Accumulated shows **0** (not 500); catalog
   net-cost/footer agree.
4. Edit the item's price to `600` → the Accumulated line does **not** move.
   Save, reopen — still 0.
5. Click the line's **Reset** (↻): value returns to the derived Σ (600) and
   now tracks further item edits live, until you type in it again.
6. Control: on a fresh acquisition where you never touch the Accumulated
   line, it live-updates as you add/edit priced items (auto behavior).

## US2 — length defaults to cm

1. Open any item's parameter editor (catalog → Edit item → Parameters).
2. Add a row and pick a length-family key (長度/寬度/高度/直徑/腰圍).
3. The unit select already reads **cm** (was mm). Existing rows keep their
   stored units; mm/m/in remain selectable.

## US3 — default pinned catalog columns

1. Open Inventory → Catalog fresh (default column settings, v8 key).
2. Scroll horizontally: **Toggle** and **Acquisition** stay fixed at the left
   edge, **Actions** at the right.
3. Columns panel → unpin Acquisition → apply → it scrolls normally;
   **Reset** restores both left pins.

## Quality loops

```bash
# backend (apps/unihub/backend/)
uv run ruff format . && uv run ruff check . --fix && uv run pytest

# frontend (apps/unihub/frontend/)
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# targeted e2e (real browser, from apps/unihub/frontend/)
pnpm exec playwright test e2e/column-pin.spec.ts
```

## Contract regeneration (Constitution IV — before frontend work)

```bash
# backend must be running (serves /api/schema/); then from apps/unihub/frontend/:
pnpm generate-types   # openapi-typescript http://localhost:8001/api/schema/ -o src/generated/api-types.ts
```
