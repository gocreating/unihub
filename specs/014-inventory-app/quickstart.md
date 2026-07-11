# Quickstart: Inventory App

**Feature**: 014-inventory-app | **Branch**: `014-inventory-app`

This guide walks a developer through building and exercising the Inventory domain. It assumes the unihub monorepo is checked out and Docker (or local uv/pnpm) is available.

> **Iteration 4 (2026-07-11)**: On top of iteration 3 (commit `a7a0ea2`), this round applies: **cost factors** (CostFactor {value signed, currency, type}; per-currency net_cost; ≥1; accumulated auto-derived), **integer quantity**, **remove item_type** (and the checklist shortfall), a merged **"Catalog"** page (expandable tree: acquisition parents → item children; item rows lose Edit; single "Catalog" nav entry; old list routes redirect), acquisition page title "Acquisition" + 3-crumb edit breadcrumb + request_time default today 00:00, **content-width RWD** stacking, the **item-edit-persistence** fix, and the placeholder ("—") fix carried forward. Migrations: `0007_cost_factors` (+backfills) and `0008_reseed_system_attrs`. See [plan.md](plan.md) / [research.md](research.md).

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

1. **Acquire items (creation entry point)**: Go to *Inventory → Catalog → New Acquisition*. Confirm the section title is **"Acquisition"**, one **empty item card** is present, there is **no Cancel button** (breadcrumb: Acquisitions / New Acquisition). **request_time** and **obtained_at** both default to today 00:00. Type into **source** → the auto-complete suggests used values. In **Cost Factors**: the `accumulated` factor value auto-fills to the sum of item totals (override, then **reset** to re-derive); add a `discount` factor with value **−100 USD** and a `shipping` factor **30 EUR** → **net_cost** shows a per-currency breakdown (USD, EUR). Fill the default card ("Camera", integer quantity 2, sku_price 2200 USD, weight 0.658 kg, volume 1.2 L — **no type field**) and **Add Item** a second card. **Edit a card's value → save → the change persists on the card** (regression check). Save → items appear in the Catalog. Try zero items or zero cost factors → rejected. Narrow the window / collapse the sidebar → the form fields **stack single-column**.
2. **Catalog (merged list)**: Go to *Inventory → Catalog*. Confirm it is one **expandable tree**: acquisition parent rows (source / obtained / net_cost) sorted ↓ by obtained date; **expand** an acquisition to see its item child rows (name, spec, size, weight, …, status, deprecate_time). Every column has a header; the single **"—"** placeholder is used. **Item rows have no Edit** action — Deprecate/Restore + Delete only; **acquisition rows** have Edit + Delete. **Deprecate** an item (deprecate_time defaults today 00:00) → status **deprecated**; **Restore** → **active**. Visiting `/inventory/items` or `/inventory/acquisitions` **redirects** here.
3. **Scenario checklist (US3)**: *Inventory → Scenarios*, create "Weekend camping", add items. Toggle `prepared`; watch outstanding fall to 0 → complete. Set a consumable's `required_quantity` above on-hand → shortfall flagged.
4. **Constraints (US4)**: Add a `mutual_exclusive` over two items → select both → violation; remove one → clears. Add a `required` constraint over an item set (no category field) → omit all → violation. Add a `weight_limit` → exceed it → overage shown.
5. **Packing & positions (US5)**: Assign the camera line's container to the "Backpack" line; review the containment tree. Try to make Backpack contain itself → rejected. Confirm the Scenario detail page uses a **breadcrumb** (Scenarios → name), not a back button.
6. **Edit acquisition (standalone)**: From the Catalog, open **Edit** on an acquisition parent row → a **standalone page** (breadcrumb **Acquisitions / {id} / Edit Acquisition**, no Cancel) pre-filled with source / cost factors / item cards; edit an item card value → save → **it persists**; change a cost factor → per-currency net_cost updates on save.
7. **Delete acquisition (composition)**: Delete the first acquisition → a confirm dialog states the item count → confirm → its items are removed from the catalog (no item is left acquisition-less).

## Reference files

- Backend pattern: `apps/unihub/backend/finance/{models,views,serializers,urls}.py`, `finance/migrations/0002_seed_account_system_attrs.py`
- Shared infra: `apps/unihub/backend/core/{filters,pagination}.py`, `core/models.py`
- Frontend pattern: `apps/unihub/frontend/src/pages/finance/*`, `components/PageTable/`, `components/AppShell/AppShell.tsx`
