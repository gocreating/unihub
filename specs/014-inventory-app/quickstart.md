# Quickstart: Inventory App

**Feature**: 014-inventory-app | **Branch**: `014-inventory-app`

This guide walks a developer through building and exercising the Inventory domain. It assumes the unihub monorepo is checked out and Docker (or local uv/pnpm) is available.

## 1. Bring up the stack

```bash
# from repo root
docker compose -f apps/unihub/docker-compose.local.yml up --build
```

Frontend: http://localhost:5173 (or the mapped port) · Backend API/docs: http://localhost:8000/api/docs/

> If the frontend image fails on `pnpm install` with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, refresh the stale base image: `docker pull node:22-alpine` and rebuild.

## 2. Backend: create the domain app (Domain Addition Protocol)

```bash
cd apps/unihub/backend
# 1. new app
mkdir -p inventory/migrations && touch inventory/__init__.py inventory/migrations/__init__.py \
  inventory/apps.py inventory/models.py inventory/serializers.py inventory/views.py inventory/urls.py
```

- **2.** Add `"inventory",` to `INSTALLED_APPS` in `unihub/settings.py`.
- **3.** Add `path("api/v1/inventory/", include("inventory.urls")),` to `unihub/urls.py`.
- Implement models (see [data-model.md](data-model.md)), serializers, and viewsets (see [contracts/inventory-api.md](contracts/inventory-api.md)) following the Finance reference (`finance/models.py`, `finance/views.py`).

```bash
uv run python manage.py makemigrations inventory
# then add the system-attribute seed migration (mirror finance/0002_seed_account_system_attrs.py)
uv run python manage.py migrate
```

## 3. Backend quality loop (test-first — Principle V)

Write tests in `tests/test_inventory.py` BEFORE the implementation (red → green). Then:

```bash
cd apps/unihub/backend
uv run ruff format .
uv run ruff check . --fix
uv run pytest tests/test_inventory.py -q
```

## 4. Regenerate the OpenAPI contract & frontend types (Principle IV)

```bash
# backend emits schema at /api/schema/ ; regenerate the frontend types
cd apps/unihub/frontend
pnpm gen:api    # or the project's openapi-typescript script → src/generated/
```

## 5. Frontend: wire the pages

- Add `src/services/unihub-backend/inventory.ts` (query keys `['inventory', 'items']`, `['inventory', 'acquisitions']`, `['inventory', 'scenarios']`) and export it from `services/unihub-backend/index.ts`.
- Add pages under `src/pages/inventory/{items,acquisitions,scenarios}/` using `PageTable` + `EntityToolbar` / `useEntitySort` / `useEntityFilter` / `useColumnConfig` (Principles VII, XII). Scenario detail at `pages/inventory/scenarios/ScenarioDetail.tsx`.
- Register routes in `App.tsx` and add the nav section in `components/AppShell/AppShell.tsx`:

```tsx
{
  path: '/inventory',
  name: t({ id: 'menu.inventory' }),
  icon: <InboxOutlined />,
  routes: [
    { path: '/inventory/items', name: t({ id: 'menu.inventory.items' }) },
    { path: '/inventory/acquisitions', name: t({ id: 'menu.inventory.acquisitions' }) },
    { path: '/inventory/scenarios', name: t({ id: 'menu.inventory.scenarios' }) },
  ],
}
```

- Add `menu.inventory.*` and `pages.inventory.*` keys to BOTH `locales/en-US/{menu,pages}.ts` and `locales/zh-TW/{menu,pages}.ts` in the same commit (Principle VIII).

## 6. Frontend quality loop

```bash
cd apps/unihub/frontend
pnpm lint        # zero warnings
pnpm typecheck   # strict
pnpm test
```

## 7. Manual acceptance walkthrough (maps to spec user stories)

1. **Items (US1)**: Go to *Inventory → Items*. Create "Backpack" (stockable) and "AA batteries" (consumable, quantity 4). Edit, then archive one item; confirm it leaves the default list and returns under the archived filter. Search/sort/filter the table.
2. **Acquisitions (US2)**: Go to *Inventory → Acquisitions*. Create a `purchase` from "B&H" and a `gift` (no cost) from a person; link items. Open an item with no acquisition → origin shows "unknown". Delete an acquisition → items remain.
3. **Scenario checklist (US3)**: Go to *Inventory → Scenarios*, create "Weekend camping", add several items. Toggle `prepared` on the checklist; watch the outstanding count fall to 0 → complete. Set battery `required_quantity` above on-hand → shortfall flagged.
4. **Constraints (US4)**: Add a `mutual_exclusive` constraint over two battery items → select both → violation appears; remove one → clears. Add a `weight_limit` → exceed it → overage amount shown.
5. **Packing & positions (US5)**: Assign the camera line's `container` to the "Backpack" line; review the containment tree. Try to make Backpack contain itself → rejected with a message.

## Reference files

- Backend pattern: `apps/unihub/backend/finance/{models,views,serializers,urls}.py`, `finance/migrations/0002_seed_account_system_attrs.py`
- Shared infra: `apps/unihub/backend/core/{filters,pagination}.py`, `core/models.py`
- Frontend pattern: `apps/unihub/frontend/src/pages/finance/*`, `components/PageTable/`, `components/AppShell/AppShell.tsx`
