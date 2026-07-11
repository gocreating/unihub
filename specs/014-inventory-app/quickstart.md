# Quickstart: Inventory App

**Feature**: 014-inventory-app | **Branch**: `014-inventory-app`

This guide walks a developer through building and exercising the Inventory domain. It assumes the unihub monorepo is checked out and Docker (or local uv/pnpm) is available.

> **Refinement iteration (2026-07-11)**: The domain shipped at commit `49159dd`; this iteration applies the clarified changes — acquisition-first creation, per-field currency (via finance API), units with normalization, field churn, and list defaults. See [plan.md](plan.md) and [research.md](research.md). The migrations for this iteration are `0003_refine_fields` and `0004_reseed_system_attrs`.

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

1. **Acquire items (US2 — creation entry point)**: Go to *Inventory → Acquisitions → New Acquisition*. Set method `purchase`, source "B&H", obtained date, then add two item rows in the same form ("Camera" cost 2200 USD, weight 0.658 kg; "Lens" cost 1100 USD). Save → both items are created and appear in the catalog, each linked to this acquisition. Create a second acquisition with **blank** method/source and one item → its origin reads "unknown/pre-existing". Confirm there is **no** standalone "New Item" button.
2. **Items list (US1)**: Go to *Inventory → Items*. Confirm the default sort is descending by acquisition obtained date and the default column order (name, spec, model, serial, size, weight, length, width, height). Edit an item: change weight unit kg→g and confirm sorting stays correct; set `price_currency` from the finance currency picker; set `status` to `deprecated`; archive one and find it via the **archived filter** (no toggle).
3. **Scenario checklist (US3)**: *Inventory → Scenarios*, create "Weekend camping", add items. Toggle `prepared`; watch outstanding fall to 0 → complete. Set a consumable's `required_quantity` above on-hand → shortfall flagged.
4. **Constraints (US4)**: Add a `mutual_exclusive` over two items → select both → violation; remove one → clears. Add a `required` constraint over an item set (no category field) → omit all → violation. Add a `weight_limit` → exceed it → overage shown.
5. **Packing & positions (US5)**: Assign the camera line's container to the "Backpack" line; review the containment tree. Try to make Backpack contain itself → rejected. Confirm the Scenario detail page uses a **breadcrumb** (Scenarios → name), not a back button.
6. **Delete acquisition (composition)**: Delete the first acquisition → a confirm dialog states the item count → confirm → its items are removed from the catalog (no item is left acquisition-less).

## Reference files

- Backend pattern: `apps/unihub/backend/finance/{models,views,serializers,urls}.py`, `finance/migrations/0002_seed_account_system_attrs.py`
- Shared infra: `apps/unihub/backend/core/{filters,pagination}.py`, `core/models.py`
- Frontend pattern: `apps/unihub/frontend/src/pages/finance/*`, `components/PageTable/`, `components/AppShell/AppShell.tsx`
