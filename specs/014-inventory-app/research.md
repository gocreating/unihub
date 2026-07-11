# Phase 0 Research: Inventory App — Iteration 3

**Feature**: 014-inventory-app | **Date**: 2026-07-11

Refreshes Phase 0 for the five 2026-07-11 clarification batches. Prior decisions still hold except where superseded below. All items **Resolved**.

---

## R1. Cost model moves to the Acquisition

- **Decision**: Remove `Item.cost` and `Item.cost_currency`. The **Acquisition** carries the order payment: `cost` (Decimal) + `cost_currency` (code string), `discount` (Decimal), `tax_refund` (Decimal). Expose a read-only derived **`net_cost = cost − discount − tax_refund`**. Items keep `sku_price` only.
- **Rationale**: Users pay per order; order-level discounts/refunds are logged once instead of smeared across items. A single acquisition cost currency also removes the awkward per-currency item-cost aggregation.
- **Alternatives**: Keep per-item cost + acquisition adjustments (rejected — two reconciling cost layers); keep as-is (rejected — doesn't match "pay by order").
- **Migration**: before dropping `item.cost`, backfill `acquisition.cost = Σ item.cost` and `cost_currency` = the first non-blank item `cost_currency`, so existing data is preserved.

## R2. Deprecation lifecycle (single timestamp, derived status)

- **Decision**: Rename `Item.archived_at` → **`deprecate_time`** (DateTimeField, null). **Remove the stored `status` field**; `status` is a **serializer-computed** value (`"deprecated"` if `deprecate_time` is not null else `"active"`). The "Deprecate" action sets `deprecate_time` (confirm dialog defaults it to **today 00:00:00 local**); a "Restore" action clears it.
- **Rationale**: One source of truth eliminates the observed bug where a deprecated item still displayed "active". Reversible via Restore.
- **Alternatives**: Keep manual status + timestamp (rejected — the exact desync bug); keep `archived_at` separately (rejected — three lifecycle fields).
- **Migration**: `RenameField(archived_at → deprecate_time)` preserves data; `RemoveField(status)` (its value was already derivable).

## R3. Field churn — sku_price / total_price / volume / quantity; drop model+serial

- **Decision**: Rename `Item.price` → **`sku_price`** and `price_currency` → `sku_price_currency`. Expose read-only **`total_price = sku_price × quantity`**. Add **`volume`** as a normalized measurement (units mL, L; canonical mL) — same pattern as length/weight. Make `quantity` **NOT NULL, default 1**. Remove `Item.model` and `Item.serial_number`.
- **Rationale**: "sku_price" clarifies it's the per-unit price; total is derived. Volume rounds out physical attributes. model/serial detail moves into `spec` (free-form), reducing column clutter.
- **Alternatives**: keep price name (rejected — ambiguous vs. total); free-text volume unit (rejected — breaks comparable sort, R-units).
- **Migration**: `RenameField` for price/price_currency; `AddField` volume_canonical/volume_unit; backfill `quantity` null→1 then alter NOT NULL (non-atomic, before the constraint); `RemoveField` model/serial.

## R4. Acquisition method removed; request_time added

- **Decision**: Remove `Acquisition.method`. Add optional **`request_time`** (when the order was initiated, distinct from `obtained_at`). Unknown/pre-existing origin is now simply a **blank source**.
- **Rationale**: Method carried little value for a personal catalog; blank source already signals unknown origin. request_time supports order-lifecycle tracking (requested → obtained).
- **Alternatives**: keep method (rejected by clarification).

## R5. Source auto-complete

- **Decision**: `Acquisition.source` is entered via an AntD **`AutoComplete`** whose suggestions come from a new backend endpoint returning **distinct previously-used source values** (optionally filtered by a `q` substring). Free text is still allowed.
- **Rationale**: Speeds repeat entry (same shops recur) without a rigid vocabulary. A dedicated distinct endpoint avoids shipping all acquisitions to the client.
- **Alternatives**: client-side dedupe of the acquisitions list (rejected — unbounded payload); a Source entity/table (rejected — over-engineered for a free-text convenience).
- **Contract**: `GET /api/v1/inventory/acquisitions/sources/?q=<substr>` → `["B&H", "Amazon", …]` (distinct, non-blank, capped, ordered by frequency or alpha).

## R6. "Items in this acquisition" — card view + ≥1 item + default card

- **Decision**: Render the items being added as a **card grid** (one card per item) that **previews only filled fields** (empties omitted); each card is editable (reopens `ItemFormModal` pre-filled) and removable. The form requires **≥1 item** to submit (0 rejected). The **create** form **pre-inserts one empty item card** for immediate entry.
- **Rationale**: Cards read better than a dense list for ≤10 items and surface the salient fields. The default card removes an empty-state click. The ≥1 invariant matches the acquisition-first composition (an acquisition without items is meaningless).
- **Alternatives**: keep the list (rejected by clarification); allow 0 items (rejected — orphan acquisition).
- **Note**: the ≥1 rule is enforced both client-side (submit guard) and server-side (serializer validates `len(items) ≥ 1` on create).

## R7. Acquisition editable on a standalone page

- **Decision**: Add a standalone **edit page** at `/inventory/acquisitions/:id/edit`, reusing the create form pre-filled. `PATCH /acquisitions/{id}/` accepts the full payload incl. `items` (add new cards; edit/remove existing items via their ids or the item endpoints).
- **Rationale**: Symmetry with create; editing an order's payment/source/items is a common correction.
- **Alternatives**: modal edit (rejected — inconsistent with the standalone create flow and the new breadcrumb/no-Cancel rule).

## R8. Constitution v1.14.0 UI conventions

- **Decision**: Apply the amended Principle VI: the Acquisition **create and edit pages use a breadcrumb and render no Cancel button** (the current create page's Cancel button is removed). The **`ItemFormModal`** places **Cancel left-most**, does **not close on outside-click/Esc while dirty**, and **stacks its fields (single column) on narrow screens**. The acquisition form's source/obtained_at row also stacks on narrow screens.
- **Rationale**: Codified project-wide in constitution v1.14.0 (sourced from this feature). Prevents accidental loss of in-progress input on modals; removes the redundant page-level Cancel.
- **Implementation**: AntD `Modal` with `maskClosable={!isDirty}` and `keyboard={!isDirty}`; footer with Cancel first; `Row`/`Col` responsive `xs/sm` spans; track dirtiness via the form's `onValuesChange`.

## R9. Table bug fixes — headers & placeholders

- **Decision**: Every column MUST set an explicit `title` (localized). Non-sortable columns (`item_count`, `total`/`net_cost`, `spec`, `weight`, `length`, `width`, `height`, `volume`) previously lacked one and rendered blank — fix by adding titles. Standardize all absent-value cells on the single constitution placeholder **`<Typography.Text type="secondary" style={{userSelect:'none'}}>—</Typography.Text>`** (no AntD default "-" leaks; no mixed dash styles). Add an **`acquisition.obtained_at` column** to the item list; remove the "Add items via New Acquisition" hint.
- **Rationale**: Direct fixes to reported bugs; the placeholder standardization is already mandated by Principle VI.

---

## Resolved decisions summary

| # | Topic | Decision |
|---|-------|----------|
| R1 | Cost | Move to Acquisition (cost/discount/tax_refund/net_cost); drop item.cost |
| R2 | Deprecation | `deprecate_time` (rename archived_at); status derived; Deprecate/Restore |
| R3 | Item fields | price→sku_price (+total_price); +volume; quantity required/1; −model/−serial |
| R4 | Acquisition | −method; +request_time; blank source = unknown origin |
| R5 | Source | AutoComplete backed by a distinct-sources endpoint |
| R6 | Item cards | Card view; ≥1 item; default empty card on create |
| R7 | Edit | Standalone acquisition edit page |
| R8 | UI rules | v1.14.0: no Cancel on standalone pages; modal Cancel-left/dirty-guard/RWD |
| R9 | Bugs | Explicit column titles; single "—" placeholder; obtained_at column |

### Superseded from iteration 2
- `Item.cost`/`cost_currency` and per-currency `total_item_cost` → **removed**; cost lives on the Acquisition (R1).
- `Item.status` (stored, editable) + `archived_at` → **`deprecate_time` + derived status** (R2).
- `Item.price` → **`sku_price`**; `Item.model`/`serial_number` → **removed** (R3).
- `Acquisition.method` → **removed**; **`request_time`** added (R4).
- Items list in the acquisition form → **card view**, ≥1 item, default card (R6).
