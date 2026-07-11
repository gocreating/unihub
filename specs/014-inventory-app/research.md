# Phase 0 Research: Inventory App (Refinement Iteration)

**Feature**: 014-inventory-app | **Date**: 2026-07-11

This refreshes the Phase 0 decisions for the 2026-07-11 clarification refinements. Original decisions R1–R10 from the first iteration still hold except where superseded below. All items are **Resolved**.

---

## R1. Cross-domain currency reference (Principle II)

- **Decision**: Store currency on Item as a plain **code string** per money field (`price_currency`, `cost_currency`). The frontend populates the currency picker by calling the existing finance endpoint `GET /api/v1/finance/currencies/`. Inventory backend performs **no** import of `finance.models`, adds **no** database foreign key to `finance_currency`, and shares no serializers.
- **Rationale**: Constitution Principle II forbids a domain importing/depending on another domain's internal code. A loose string code + frontend API read is the compliant way to "let the user pick a finance currency" — the domains stay independently deployable. Mirrors how the currency code already travels as a bare string in the finance `Account`/`Balance` serializers.
- **Alternatives considered**: (a) DB FK `Item.price_currency → finance.Currency` — rejected: hard cross-domain coupling, violates Principle II, breaks "adding/refactoring a domain requires no change to another". (b) Duplicate a currency table inside inventory — rejected: data duplication and drift. (c) Backend proxy of finance currencies through an inventory endpoint — rejected: unnecessary; the frontend can call finance directly.

## R2. Units on measurements (enum + normalization)

- **Decision**: Each measurement stores a **canonical base value** plus a **display unit**:
  - Length fields (`length`, `width`, `height`): canonical in **mm**; unit ∈ {mm, cm, m, in}. Factors → mm: mm 1, cm 10, m 1000, in 25.4.
  - Weight (`weight`): canonical in **g**; unit ∈ {g, kg, lb}. Factors → g: g 1, kg 1000, lb 453.592.
  - DB columns per measure: `<m>_canonical` (Decimal, base unit) + `<m>_unit` (CharField enum). The serializer accepts `{value, unit}`, computes canonical on write, and returns both the display `value` (canonical ÷ factor) and `unit` on read.
- **Rationale**: Sorting/filtering by weight or a dimension must be comparable across items entered in different units (SC-002 intent). Storing a canonical column makes ORM ordering/filtering correct and index-friendly; keeping the unit preserves the user's chosen display.
- **Alternatives considered**: (a) Store raw value + unit, compare raw — rejected: mixes units, misleading sort. (b) Free-text unit string — rejected: no normalization, no validation. (c) Single global metric/imperial toggle — rejected: too coarse; users mix units per item.

## R3. Per-currency cost aggregation

- **Decision**: With per-field currencies, an Acquisition's aggregated cost is reported **grouped by currency**: `total_item_cost` becomes a list of `{currency, total}` (summing each item's `cost` within its `cost_currency`). No cross-currency summation or FX conversion is performed in Inventory. `Acquisition.cost` (the old optional lump-sum) is **removed**.
- **Rationale**: Summing amounts in different currencies is meaningless without FX, and Principle IX (base-currency valuation) is finance-only. Grouping by currency is the same transparency approach finance uses for per-currency net worth. Most real acquisitions use one currency, so the list usually has a single entry.
- **Alternatives considered**: (a) Single scalar total — rejected: wrong across mixed currencies. (b) Convert to a base currency in inventory — rejected: pulls FX/rate logic across the domain boundary (Principle II/IX).

## R4. Acquisition-first composition & lifecycle

- **Decision**: `Item.acquisition` is a **required** FK with `on_delete=CASCADE`. Items are created **only** through the Acquisition create flow (one request creates the acquisition and its item rows). Deleting an acquisition deletes its items (composition) behind a count-stating confirmation. The standalone item-create endpoint/UI is removed; `Item` remains independently editable and deletable-through-its-acquisition. "Unknown/pre-existing origin" is modeled by an acquisition with blank method/source (not by a null FK).
- **Rationale**: Directly implements the clarified acquisition-first decision, which supersedes the earlier "linking optional / null acquisition" model. CASCADE enforces the "no item without an acquisition" invariant at the DB level.
- **Alternatives considered**: (a) Keep nullable FK + optional standalone create — rejected: contradicts the clarification. (b) `PROTECT` on delete — rejected: the spec allows cascade-with-warning; PROTECT would block the common "remove this whole purchase" action.
- **Note (data migration)**: existing rows created in the first iteration may have `acquisition = NULL`. The `0003` migration backfills a synthetic "unknown origin" acquisition (blank method/source) for any orphan items before making the column non-null.

## R5. Item creation via nested write on Acquisition

- **Decision**: `POST /acquisitions/` accepts an `items: [ …itemFields ]` array and creates the acquisition and all items atomically. `PATCH /acquisitions/{id}/` supports adding new item rows and editing/removing existing ones. Individual item edits still go through `PATCH /items/{id}/`.
- **Rationale**: Matches the "add one or more items at once" flow on a single page; a nested writable serializer keeps it one round-trip and transactional.
- **Alternatives considered**: Separate calls (create acquisition, then create each item) — rejected: non-atomic, worse UX, partial-failure states.

## R6. Item list default view

- **Decision**: `ItemViewSet.ordering = ['-acquisition__obtained_at']` (default). `archived_at` becomes a filterable attribute; there is **no** implicit archived exclusion and **no** dedicated toggle — the default view lists all items and the user filters. Default column order (frontend): name, spec, model, serial, size, weight, length, width, height. `ordering_fields` gains `acquisition__obtained_at` (aliased).
- **Rationale**: Implements the clarified list defaults. The related-field sort is safe and index-friendly because every item now has an acquisition (no null join).
- **Alternatives considered**: Keep the toggle / default-exclude archived — rejected by the clarification ("use filter instead").

## R7. Constraint `required` becomes item-set-only

- **Decision**: Remove `Constraint.target_category` and `Item.category`. A `required` constraint validates on its M2M `items` set only (≥1 item required); evaluation flags a violation when none of the set is selected.
- **Rationale**: `item.category` is removed per the clarification, so category-based matching has no backing field; the explicit item set is the remaining, well-defined semantic.
- **Alternatives considered**: Retain `category` just for constraints — rejected by the clarification.

---

## Resolved decisions summary

| # | Topic | Decision |
|---|-------|----------|
| R1 | Currency | Per-field code string; picker via finance API; no import/FK (Principle II) |
| R2 | Units | Canonical base value (mm/g) + display unit enum per measure |
| R3 | Cost totals | Aggregate grouped by currency; drop `Acquisition.cost` |
| R4 | Composition | `Item.acquisition` required + CASCADE; acquisition-first; blank acq = unknown origin |
| R5 | Nested create | `POST /acquisitions/` writes acquisition + items atomically |
| R6 | List defaults | Default sort ↓`acquisition__obtained_at`; archived filterable, no toggle; fixed column order |
| R7 | Required constraint | Item-set-only; drop `target_category`/`item.category` |

### Superseded from iteration 1
- Item↔Acquisition **optional nullable FK** → now **required + CASCADE** (R4 supersedes old R2/R7-archive).
- `Acquisition.cost` lump-sum and single scalar `total_item_cost` → **per-currency grouping**, lump-sum removed (R3).
- `item.category` + `required`-by-category → **removed** (R7 supersedes old I1 resolution).
- Default-exclude-archived + toggle → **archived filterable, no toggle** (R6).
