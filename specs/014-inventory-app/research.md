# Phase 0 Research: Inventory App

**Feature**: 014-inventory-app | **Date**: 2026-07-10

This document resolves the open decisions carried from the spec's Assumptions and the `/speckit-clarify` session, plus the technical unknowns raised by the Technical Context. All items below are **Resolved**; none remain as NEEDS CLARIFICATION.

---

## R1. Domain wiring pattern (concrete models vs. pure entity/attribute)

- **Decision**: Implement each Inventory entity as a **concrete Django model** with its own DRF `ModelViewSet`, and additionally **seed system `AttributeDefinition`s** (one per user-facing field) via a data migration. This is the exact hybrid the reference domain (Finance) uses.
- **Rationale**: The codebase reality (verified in `finance/models.py`, `finance/views.py`, `finance/migrations/0002_seed_account_system_attrs.py`) is that concrete models hold the structured fields while the shared `core.AttributeDefinition`/`AttributeValue` infrastructure provides (a) the system-attribute registry that IO/export and the attribute UI consume, and (b) user-defined custom attributes. Principle I is satisfied because attributes flow through the shared infra; Principle III requires alignment with Finance.
- **Alternatives considered**: (a) Pure `AttributeValue`-only storage with no concrete fields — rejected: no reference domain does this, filtering/ordering/relationships would be far harder, and it breaks Principle III alignment. (b) Concrete models with no attribute seeding — rejected: violates Principle I and the Domain Addition Protocol step 3.

## R2. Order → Acquisition rename & cardinality

- **Decision**: Name the acquisition entity **`Acquisition`**. An `Item` links to **at most one** Acquisition via a nullable FK (`Item.acquisition`). An Acquisition may group **zero or more** items. `Acquisition.method` is an optional `single_select` (`purchase`, `gift`, `transfer`, `found`, `other`); `Acquisition.source` is free text (store/seller/person). Recording an acquisition is optional — an item with `acquisition = null` displays "unknown origin".
- **Rationale**: Matches the clarification session (2026-07-10). An item is obtained once, so FK (not M2M) is correct and keeps the "which acquisition did this come from" lookup a simple join. Optional method + optional linkage supports gifts and pre-existing items.
- **Alternatives considered**: M2M item↔acquisition — rejected: an item is not acquired multiple times; M2M adds needless complexity. Required method — rejected by clarification (blank = unknown/pre-existing).

## R3. Cost model

- **Decision**: Keep `Item.cost` and `Item.price` as optional decimals on the item. The Acquisition's **aggregated total cost is derived** as the sum of its linked items' `cost`. `Acquisition.cost` remains an optional lump-sum field for cases where the user records a single bundle price instead of per-item costs; the derived per-item total is what the UI shows as "total".
- **Rationale**: Spec Assumption "Acquisition-cost aggregation uses each linked item's recorded cost"; FR-006 allows an optional acquisition cost. Both notions coexist without ambiguity because the derived total is always displayed and the lump-sum is clearly labeled.
- **Alternatives considered**: Store cost only on the acquisition — rejected: the spec item schema explicitly lists per-item `price`/`cost`, and per-item cost is needed for scenarios/reporting independent of acquisitions.

## R4. Containment scope (per-scenario vs. global)

- **Decision**: Containment is **per-scenario**. A `ScenarioItem` (the join between a Scenario and an Item) carries a nullable self-referential FK `container` pointing at **another `ScenarioItem` in the same scenario**. Top-level (unpacked) lines have `container = null`. A separate `Item.storage_location` free-text field records where an item lives when not packed.
- **Rationale**: Spec Assumption "Containment is scenario-scoped"; the same item can be packed differently for different situations. Anchoring the parent on `ScenarioItem` (not `Item`) guarantees the container is itself part of the scenario and lets the same physical item be a container in one scenario and packed loose in another.
- **Alternatives considered**: Global `Item.parent` graph — rejected by the assumption; would force one universal packing arrangement. Free-text location only — rejected: cannot express multi-level nesting (camera → case → backpack) required by User Story 5.
- **Cycle prevention**: On assigning `container`, the backend walks the parent chain and rejects (400) if the target is the line itself or already a descendant. Enforced in the serializer/viewset and covered by a dedicated test (`test_set_container_rejects_cycle`).

## R5. Constraint types & evaluation

- **Decision**: Support exactly three `constraint_type` values in v1: **`mutual_exclusive`** (at most one of a target item set may be selected), **`required`** (a specific item, or an item whose category/type matches `target_category`, must be selected), and **`weight_limit`** (summed `weight` of selected items must not exceed `limit_value`). A `Constraint` belongs to a `Scenario`, has an M2M `items` target set, an optional `target_category` (text), and an optional `limit_value` (decimal). Evaluation is **computed server-side** and returned by the scenario checklist endpoint as a list of violations (`{constraint_id, type, message, offending_item_ids, overage?}`).
- **Rationale**: Spec Assumption "Constraint set for v1"; FR-013/FR-014. Server-side evaluation keeps the rule logic unit-testable (Principle V) and consistent regardless of client. A small closed enum keeps the UI (a `single_select`) and the type generation simple.
- **Alternatives considered**: Free-form constraint expressions / a rule DSL — rejected: out of scope for v1, untestable-by-default, over-engineered. Client-side evaluation — rejected: duplicates logic, not unit-testable in the backend suite, risks divergence.

## R6. Checklist & preparation state

- **Decision**: Preparation state lives on `ScenarioItem`: `required_quantity` (number, default 1) and `prepared` (boolean, default false). The scenario **checklist endpoint** (`GET /scenarios/{id}/checklist/`) returns, in one response: each checklist line (item, required qty, prepared, container, on-hand shortfall for consumables), aggregate progress (`prepared_count`, `outstanding_count`, `complete`), and the evaluated constraint violations (R5). Marking prepared is a `PATCH` on the `ScenarioItem`.
- **Rationale**: FR-011/FR-012. One computed endpoint gives the frontend everything the Scenario detail view needs (progress + violations + shortfalls) without multiple round-trips, matching SC-008 (glanceable readiness).
- **Alternatives considered**: Compute progress on the client — rejected: shortfall and constraint evaluation are server concerns and must be testable server-side.

## R7. Archive vs. hard delete & referential safety

- **Decision**: **Archiving** (`Item.archived_at` timestamp) is the normal retirement path; archived items are excluded from the default list and retrievable via an `archived` filter. **Hard delete** is guarded: `ItemViewSet.destroy` returns a reference-count summary and requires `?confirm=true` when the item is linked to an acquisition, a scenario, or used as a container — mirroring `AccountViewSet.destroy`. Deleting an Acquisition or a ScenarioItem never deletes the underlying Item (FKs use `SET_NULL`/`CASCADE` on the join only).
- **Rationale**: Spec Assumption "Deletion vs archive"; FR-002, FR-009, FR-018; Dev Constraint delete-confirmation. Prevents dangling references (edge cases) while keeping the common case (retire an item) non-destructive.
- **Alternatives considered**: Hard delete with cascade — rejected: silently destroys acquisition/scenario history. Archive-only, no delete — rejected: users need a way to remove mistaken entries; FR-018 anticipates guarded deletion.

## R8. Consumable quantity & shortfall

- **Decision**: `Item.item_type` is a `single_select` (`stockable`, `consumable`). `Item.quantity` (number) is the on-hand quantity, editable for consumables. In a scenario, if a consumable line's `required_quantity` exceeds the item's on-hand `quantity`, the checklist line is flagged with a `shortfall` amount. Quantity changes are manual (no automatic depletion in v1).
- **Rationale**: Spec Assumption "Item type model"; FR-004; User Story 3 scenario 5. Manual quantity keeps v1 free of a consumption-event ledger.
- **Alternatives considered**: Auto-decrement on scenario completion — rejected: out of scope; scenarios are preparation plans, not stock transactions.

## R9. API namespace & pagination

- **Decision**: Mount the app at **`/api/v1/inventory/`** (matching the `/api/v1/finance/` convention in `unihub/urls.py`). Use `EntityOffsetPagination`, `EntityFilterBackend`, and `NullsOrderingFilter` from `core/`. `http_method_names` restricted to `get, post, patch, delete, head, options` (no `put` on collection resources), as Finance does.
- **Rationale**: Principle III alignment; the newer `/api/<domain>/` prefixes (visiting/language/people/music) are un-versioned, but Finance — the fully-wired MVP reference — uses `/api/v1/`. We follow the fully-wired reference.
- **Alternatives considered**: `/api/inventory/` (un-versioned like music) — rejected: those domains are not fully wired; Finance is the authoritative wired pattern.

## R10. Frontend page shape

- **Decision**: Three `PageTable` list pages under a collapsible **Inventory** nav section: **Items**, **Acquisitions**, **Scenarios**. The **Scenario detail** page (`/inventory/scenarios/:id`) is a non-table composite: a checklist panel (progress + prepared toggles), a constraints panel (add/evaluate, violations surfaced), and a containment tree. Any table embedded inside a card on the detail page uses `ProTable ghost` (Principle XI), not `PageTable`.
- **Rationale**: Principle VII (list pages) + the composite detail view parallels Finance's balance-sheet detail. Enum/relational cells use `<Tag>` (Principle VI).
- **Alternatives considered**: A single mega-page — rejected: three distinct entities each warrant a list; the scenario workflow needs a dedicated detail surface.

---

## Resolved decisions summary

| # | Topic | Decision |
|---|-------|----------|
| R1 | Domain wiring | Concrete models + seeded system AttributeDefinitions (Finance pattern) |
| R2 | Acquisition | Rename from Order; `Item.acquisition` nullable FK; optional typed method |
| R3 | Cost | Per-item cost/price; acquisition total = sum of item costs; optional lump-sum |
| R4 | Containment | Per-scenario `ScenarioItem.container` self-FK; cycle-checked |
| R5 | Constraints | `mutual_exclusive`, `required`, `weight_limit`; evaluated server-side |
| R6 | Checklist | Progress + violations + shortfalls from one `/checklist/` endpoint |
| R7 | Delete/archive | Archive default; guarded hard delete with `?confirm=true` |
| R8 | Consumables | `item_type` enum; manual on-hand `quantity`; shortfall flag |
| R9 | API | `/api/v1/inventory/`; core filter/order/pagination backends |
| R10 | Frontend | 3 list pages + 1 scenario detail; Tags for enums/relations |
