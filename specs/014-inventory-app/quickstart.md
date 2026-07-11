# Quickstart: Inventory App

**Feature**: 014-inventory-app | **Branch**: `014-inventory-app`

This guide walks a developer through building and exercising the Inventory domain. It assumes the unihub monorepo is checked out and Docker (or local uv/pnpm) is available.

> **Iteration 3 (2026-07-11)**: On top of iteration 2 (commit `2fc0106`), this round applies: cost→Acquisition (cost/discount/tax_refund/net_cost), deprecate_time + derived status (Deprecate/Restore), sku_price/total_price, +volume, quantity required/1, −method/−model/−serial/−item.cost, source auto-complete, item **card view** + ≥1-item + default card, standalone acquisition edit page, Constitution v1.14.0 page/modal button rules, and the blank-header/placeholder bug fixes. Migrations for this iteration: `0005_iter3_fields` (+backfills) and `0006_reseed_system_attrs`. See [plan.md](plan.md) / [research.md](research.md).

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

1. **Acquire items (US2 — creation entry point)**: Go to *Inventory → Acquisitions → New Acquisition*. Confirm one **empty item card** is already present and there is **no Cancel button** (breadcrumb at top). Type into **source** and confirm the auto-complete suggests previously-used values. Set obtained date (defaults today 00:00), order `cost` 3300 / `discount` 100 / `tax_refund` 0 → **net_cost** shows 3200. Fill the default card ("Camera", sku_price 2200 USD, weight 0.658 kg, volume 1.2 L) and **Add Item** a second card ("Lens", sku_price 1100 USD). Cards preview only filled fields. Save → both items appear in the catalog. Try saving an acquisition with **zero items** → rejected.
2. **Items list (US1)**: Go to *Inventory → Items*. Confirm **every column has a header** (no blanks), the single **"—"** placeholder is used, there is an **obtained-date column**, default sort ↓ by it, default column order (name, spec, size, weight, length, width, height), and **no "Add items via New Acquisition" hint**. Edit an item: change weight kg→g (sort stays correct); set `sku_price_currency` from the finance picker (currency disabled when the amount is empty); confirm `total_price = sku_price × quantity`. Click **Deprecate** → confirm the `deprecate_time` (defaults today 00:00) → status column reads **deprecated**; then **Restore** → status returns to **active**.
3. **Scenario checklist (US3)**: *Inventory → Scenarios*, create "Weekend camping", add items. Toggle `prepared`; watch outstanding fall to 0 → complete. Set a consumable's `required_quantity` above on-hand → shortfall flagged.
4. **Constraints (US4)**: Add a `mutual_exclusive` over two items → select both → violation; remove one → clears. Add a `required` constraint over an item set (no category field) → omit all → violation. Add a `weight_limit` → exceed it → overage shown.
5. **Packing & positions (US5)**: Assign the camera line's container to the "Backpack" line; review the containment tree. Try to make Backpack contain itself → rejected. Confirm the Scenario detail page uses a **breadcrumb** (Scenarios → name), not a back button.
6. **Edit acquisition (standalone)**: From the Acquisitions list, open **Edit** on an acquisition → confirm it opens a **standalone page** (breadcrumb, no Cancel) pre-filled with its source/payment/item cards; change the discount → net_cost updates on save.
7. **Delete acquisition (composition)**: Delete the first acquisition → a confirm dialog states the item count → confirm → its items are removed from the catalog (no item is left acquisition-less).

## Reference files

- Backend pattern: `apps/unihub/backend/finance/{models,views,serializers,urls}.py`, `finance/migrations/0002_seed_account_system_attrs.py`
- Shared infra: `apps/unihub/backend/core/{filters,pagination}.py`, `core/models.py`
- Frontend pattern: `apps/unihub/frontend/src/pages/finance/*`, `components/PageTable/`, `components/AppShell/AppShell.tsx`
