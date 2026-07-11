# Implementation Plan: Inventory App — Refinement Iteration

**Branch**: `014-inventory-app` | **Date**: 2026-07-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-inventory-app/spec.md`

## Summary

The Inventory domain was delivered end-to-end at commit `49159dd` (models, viewsets, tests, frontend pages, i18n, live on the Postgres stack). This plan covers the **refinement iteration** from the 2026-07-11 clarification session, which changes the data model and primary flow rather than adding new stories. Net changes:

- **Acquisition-first creation**: items are created only inside an acquisition (a standalone page adding one or more items at once). `Item.acquisition` becomes a **required** FK with **cascade delete**; the standalone "New Item" path is removed.
- **Per-field currency**: `price`/`cost` each carry a currency **code string**, picker fed by the finance domain's currency **API** (no model import, no FK — Principle II).
- **Units with normalization**: `length/width/height` (mm/cm/m/in) and `weight` (g/kg/lb) store a canonical base value for correct cross-unit sort/filter plus the display unit.
- **Field churn**: add `spec`, `remark` (multiline), `color`, `url`; remove `category`, `storage_location`, `purchase_time`, `acquisition.arrived_at`, `acquisition.cost`; `status` ∈ {active, deprecated}; rename `acquisition.notes` → `remark`; canonical obtained time = `acquisition.obtained_at`.
- **Constraint**: `required` becomes item-set-only (drop `target_category`).
- **List defaults**: no active/archived toggle (archived is a filterable attribute); default sort ↓ `acquisition.obtained_at`; fixed default column order.
- **UX**: Scenario detail uses a breadcrumb instead of a back button.

Approach: a schema migration (`0003_*`) that adds/removes/renames fields and backfills, updated serializers/viewsets/services, updated frontend pages (new Acquisition create page with inline item rows; Items list read/edit only), a small finance-currency read on the frontend, and refreshed tests. The already-passing test suite is updated to the new contract (still test-first for new behavior).

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.7 / React 18.3 (frontend)

**Primary Dependencies**: Django 5 + DRF 3, drf-spectacular, PostgreSQL 16; Ant Design 5 + Pro Components, TanStack React Query 5, React Router 7, react-intl. **New cross-domain touchpoint**: frontend reads `GET /api/v1/finance/currencies/` to populate currency pickers (read-only, over the public API).

**Storage**: PostgreSQL 16 — `inventory_*` tables. Item measurement columns store a canonical numeric + a unit label; money columns store a decimal + a currency code string. Item ↔ Acquisition is a required FK (composition).

**Testing**: pytest-django (backend, test-first for changed/new behavior); Vitest + RTL (frontend)

**Target Platform**: Desktop/tablet browser widths

**Project Type**: Web application (Django REST backend + React SPA) within the unihub monorepo

**Performance Goals**: Catalog of ≥500 items searchable/sortable via server-side pagination; default sort by the related `acquisition.obtained_at` uses an indexed FK join (no nulls — every item has an acquisition).

**Constraints**: Session auth; single user; no cross-currency FX conversion inside Inventory; unit sets fixed per measure; no charts.

**Scale/Scope**: ~5 models (schema-only delta), 4 frontend pages refactored + 1 new Acquisition create page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes for this iteration |
|-----------|--------|--------------------------|
| I. Entity-Centric (NON-NEGOTIABLE) | ✅ PASS | System `AttributeDefinition` seeds updated to match the new Item/Acquisition field sets via a data migration (add spec/remark/color/url/units/currency, drop category/storage_location/purchase_time/arrived_at). |
| II. Domain Independence | ✅ PASS (design-critical) | Currency is referenced as a **code string**; the picker calls the **finance HTTP API** from the frontend. Inventory does **not** import `finance.models`, add a DB FK, or share serializers. This keeps both domains independently deployable — the intended, compliant way to "reference" another domain. Documented in research R1. |
| III. Reference Implementation Alignment | ✅ PASS | Continues Finance/ov-fleet patterns; the Acquisition create page with inline item rows mirrors the balance-sheet detail composite. |
| IV. API Contract-Driven Frontend | ✅ PASS | Schema regenerated after model changes; `src/generated/api-types.ts` refreshed; no hand-written types. |
| V. Quality Loop | ✅ PASS | New/changed behavior tested first; full backend + frontend loops must pass. |
| VI. UI/UX ov-fleet | ✅ PASS | Datetime dual-display, `—` empty placeholder, `<Tag>` for enums/relations; **breadcrumb** on Scenario detail (FR-021). |
| VII. PageTable (NON-NEGOTIABLE) | ✅ PASS | Items/Acquisitions/Scenarios lists stay on `PageTable`. The Acquisition **create** page is a form (inline editable item rows), not a data grid. |
| VIII. i18n (NON-NEGOTIABLE) | ✅ PASS | New keys (spec/remark/color/url/units/currency/status/breadcrumb/acquisition-create) added to BOTH locales; removed keys pruned from both. |
| IX. Base Currency Net Worth | ➖ N/A (adjacent) | Inventory does not do FX valuation. Because items now carry per-field currencies, an acquisition's aggregated cost is reported **grouped by currency** (a list of {currency, total}), not summed across currencies — see research R3. |
| X / XI. Charts | ➖ N/A | No charts. |
| XII. Entity Toolbar & Sort | ✅ PASS | List filter/sort/columns unchanged in mechanism; Item default sort seeded as `-acquisition__obtained_at`; archived becomes a filterable attribute (no toggle). Backend `ordering_fields` gains the related-field alias. |
| Dev Constraint: Delete confirmation | ✅ PASS | Acquisition delete (now cascades to items) uses a count-stating `Modal.confirm(okType:'danger')`; scenario-item/constraint deletes unchanged. |
| Domain Addition Protocol | ✅ PASS (already added) | No new app; this is an in-place refinement of the existing `inventory` app. |

**Result**: All gates pass. Principle II is the sensitive one and is satisfied by the string-code + API-read design (no cross-domain coupling). Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file (refinement iteration)
├── research.md          # Refreshed Phase 0 decisions (R1–R7)
├── data-model.md        # Refreshed entity definitions
├── quickstart.md        # Refreshed walkthrough
├── contracts/inventory-api.md   # Refreshed REST contract
└── tasks.md             # Regenerate via /speckit-tasks after this plan
```

### Source Code (delta from commit 49159dd)

```text
apps/unihub/backend/inventory/
├── models.py            # Item: +spec,remark,color,url,*_unit,*_canonical,price_currency,cost_currency,
│                        #        status enum; −category,storage_location,purchase_time; acquisition FK required+CASCADE
│                        # Acquisition: notes→remark; −arrived_at,−cost
│                        # Constraint: −target_category
├── migrations/0003_refine_fields.py     # schema change + data backfill (units canonicalization, status default)
├── migrations/0004_reseed_system_attrs.py  # update system AttributeDefinitions to new field set
├── serializers.py       # unit value↔canonical conversion; per-field currency; nested item write on Acquisition create;
│                        # per-currency total; required-constraint validation (item-set-only)
├── views.py             # ItemViewSet: default ordering -acquisition__obtained_at, archived filterable, remove ?archived toggle semantics,
│                        # remove standalone create (items created via Acquisition); Acquisition create accepts items[]
├── services.py          # constraint eval: drop category branch; unit canonical helpers
└── ...
apps/unihub/backend/tests/   # update test_inventory_* to new contract (+ unit conversion, per-currency, cascade delete)

apps/unihub/frontend/src/
├── pages/inventory/acquisitions/   # NEW standalone create page with inline item rows (bulk); list stays
├── pages/inventory/items/          # list: default sort/columns, archived as filter, edit-only modal (+new fields, unit & currency selects); remove New Item
├── pages/inventory/scenarios/detail.tsx  # breadcrumb; required-constraint form drops category
├── services/unihub-backend/inventory.ts  # types + endpoints for new shape
├── services/unihub-backend/finance.ts     # (existing) listCurrencies reused for currency picker
├── generated/api-types.ts          # regenerated
└── locales/{en-US,zh-TW}/pages.ts  # add/remove keys in both
```

**Structure Decision**: In-place refinement of the existing `inventory` Django app and frontend section — no new project. The one structural addition is a **standalone Acquisition create page** (form with inline item rows) that becomes the sole item-creation entry point.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
