# Feature Specification: Inventory App

**Feature Branch**: `014-inventory-app`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Inventory app (GitHub issue #33) — Initialize a new app for users to organize their stockable items and consumables. Scenarios: CRUD for items and scenarios; prepare checklists for specific scenarios under constraints (e.g. batteries exclusive); organize/plan which item is packed inside which item for a scenario; review status for positions. Schema: item (model, serial number, amount, dimensions, size, weight, price, cost, purchase/archive time), order (store, create/arrive time), scenario, constraint."

## Clarifications

### Session 2026-07-10

- Q: The purchase-record entity was named "Order", but items can be gifts, hand-me-downs, transfers, or found — what should it be renamed to? → A: Rename "Order" to **Acquisition**; its "store" attribute becomes **source** (a store, seller, or person).
- Q: Should an acquisition record a typed method (purchase, gift, transfer, found, other), and is it required? → A: The method is a **typed** field, but it is **optional** — and linking an item to an acquisition at all is optional. A blank/absent record means the user does not recall how the item was obtained, or the item predates their use of the system.

### Session 2026-07-11

- Q: Should the catalog entity be renamed from "Item" to "SKU"? → A: **Keep "Item"**. The entity represents an individual owned/consumed thing (per-instance identity via serial number, storage location, containment), not a retail product type. "SKU" (a product-type identifier implying a product→units split) is a deliberate non-goal for v1; no product-type/variant layer is introduced.

### Session 2026-07-11 (refinement)

- Q: Should direct standalone item creation still be possible, or is creation acquisition-first only? → A: **Acquisition-first only.** Items are created within an acquisition (a standalone page where the user adds one or more items at once); there is no standalone "New Item" entry. **This supersedes the 2026-07-10 "linking is optional" decision** — every item now belongs to exactly one acquisition (`Item.acquisition` is required). An **acquisition with a blank method/source represents unknown or pre-existing origin** (the earlier "unknown origin" case).
- Q: How should inventory reference currency for price/cost given domain independence (Principle II)? → A: **Currency code string, per-field.** `price` and `cost` each carry their own currency **code string** (e.g. "USD"); the picker is populated from the finance currencies **API** (no import of finance models, no DB FK). Loose coupling preserves Principle II.
- Q: How should units on length/width/height/weight be modeled? → A: **Enum + normalize.** Each measure has a fixed unit set (length: mm/cm/m/in; weight: g/kg/lb) stored as (value, unit); a canonical base value (mm, g) is stored alongside for correct cross-unit sorting/filtering, and the value is displayed in the chosen unit.
- Q: With `item.category` removed, how should the "required" constraint work? → A: **Item set only.** A "required" constraint names specific items (≥1 must be selected); category matching (`target_category`) is dropped.
- Q: Assorted field/UX refinements (scenario nav, obtained-time consolidation, field add/remove/rename, list defaults)? → A: Scenario detail uses a **breadcrumb** (not a back button). Remove `item.purchase_time` and `acquisition.arrived_at`; the canonical obtained time is **`acquisition.obtained_at`**. Remove `item.category` and `item.storage_location`. `item.status` enum is limited to **active, deprecated** (default active). Add `item.spec` and `item.remark` (**multi-line text**); add `item.color` (string) and `item.url` (string). Rename `acquisition.notes` → **`acquisition.remark`**. Item list: **remove the active/archived toggle** (archived becomes a normal filterable attribute — the default view no longer auto-excludes archived); **default sort descending by `acquisition.obtained_at`**; **default column order**: name, spec, model, serial, size, weight, length, width, height.

### Session 2026-07-11 (UI refinement)

- Q: How should `item.status` relate to a deprecation timestamp? → A: **Status is derived from `deprecate_time`.** Setting `deprecate_time` (defaults to today 00:00:00 local) makes the item **deprecated**; clearing it returns it to **active**. `deprecate_time` **replaces `archived_at`**, and `item.status` becomes **read-only/computed** (the manual status field is removed). The "Archive" action becomes **"Deprecate"** (confirm modal collects `deprecate_time`), and a deprecated item exposes a **"Restore/Activate"** action that clears `deprecate_time`.
- Q: Add a volume attribute? → A: Add **`item.volume`** as a normalized measurement (unit set **mL, L**; canonical stored in mL), same pattern as length/weight.
- Q: Item quantity requiredness/default? → A: **`item.quantity` is required and defaults to 1.**
- Q: Currency inputs when there is no amount? → A: When `price` (or `cost`) is **0 or empty**, its currency selector is **disabled** and shows the standard **"—"** placeholder ("don't care").
- Q: Acquisition create/edit form defaults & layout? → A: `acquisition.obtained_at` **defaults to today 00:00:00** in the create form. On the acquisition form, **source / method / obtained_at share one row on wide screens and stack on narrow screens** (responsive). The Add-Item modal's fields likewise **stack on narrow screens**.
- Q: Modal & standalone-page button conventions? → A: In modals, the **Cancel button is placed left-most**; a modal **must not close on outside click while its form is dirty**. **Standalone creation/modification pages have no Cancel button** — the user navigates away via the breadcrumb. (Requested to also record this as a project-wide rule via `/speckit-constitution`.)
- Q: Can added items be edited before the acquisition is saved, and can acquisitions be edited later? → A: **Yes** — rows in the "Items in this acquisition" table are **editable** (open the item modal pre-filled, save back), and an existing **acquisition is editable on its own standalone page**.
- Q: Item/acquisition list bugs — empty column headers and inconsistent placeholders? → A: **Confirmed bugs.** Non-sortable columns (`item_count`, `total_item_cost`, `spec`, `weight`, `length`, `width`, `height`) render **blank headers** because they lack an explicit `title`; every column MUST show its localized header. Also **standardize on a single placeholder "—"** (the constitution's secondary em-dash) everywhere — no mixed short/long dashes. Add an **`acquisition.obtained_at` column** to the item list (the existing default sort ↓ by it now has a visible column), and **remove the "Add items via New Acquisition" hint** from the item list.

### Session 2026-07-11 (field trims)

- Q: Acquisition source input behaviour? → A: `source` MUST be an **auto-complete** that suggests previously-used source values (the user can still type a new value).
- Q: Keep `acquisition.method`? → A: **Remove `acquisition.method` entirely.** Unknown/pre-existing origin is now represented by a **blank source** alone. (Supersedes earlier "blank method/source" wording — method no longer exists.)
- Q: Price naming and total? → A: Rename `item.price` → **`item.sku_price`** (the per-unit / per-SKU price). A read-only **`total_price` is derived as `sku_price × quantity`**. `cost` is unchanged (the amount actually paid; still drives the acquisition's per-currency cost aggregation).
- Q: Keep `item.model` and `item.serial_number`? → A: **Remove both.** The user captures that detail in `item.spec` instead. (They also drop out of the item-list default column order.)

### Session 2026-07-11 (cost model & item cards)

- Q: "Items in this acquisition" display style? → A: Use a **card view** (not a list) on the acquisition create/edit page — each item is a card that **previews only its filled fields** (empty fields are omitted). Acceptable because an acquisition typically holds ≤ 10 items. Each card remains editable (opens the item form pre-filled) and removable.
- Q: Where should the amount actually paid live? → A: **Move cost to the Acquisition.** Remove `item.cost` and `item.cost_currency`. The **Acquisition** gains `cost` (with a currency code), `discount`, and `tax_refund`; the **net outlay is derived as `cost − discount − tax_refund`**. Items keep `sku_price` (per-unit value). This models "paying by order" and lets order-level discounts/refunds be logged once. The prior per-currency aggregation of item costs is removed (an acquisition now has a single cost currency).

### Session 2026-07-11 (request time & item minimum)

- Q: Track when an order was initiated? → A: Add **`acquisition.request_time`** — an optional timestamp for when the user initiated/requested the order (distinct from `obtained_at`, when it was received).
- Q: Minimum items per acquisition, and create-form convenience? → A: An acquisition MUST have **at least 1 item** to submit the create/edit form (0-item submit is rejected). On the **create** form, **one default (empty) item card is pre-inserted** so the user can start filling it immediately.

## User Scenarios & Testing *(mandatory)*

The Inventory domain is a new section of the unihub dashboard where a user catalogs everything they own or consume, records how those things were acquired, and plans which items to take and how to pack them for real-world situations (a trip, a shoot, an event). Each user story below is an independently shippable slice.

### User Story 1 - Catalog and manage items (Priority: P1)

The user maintains a personal catalog of physical things they own. Items are added through an acquisition (see User Story 2) rather than a standalone form. The user records each item's descriptive and logistical attributes — quantity (default 1), spec, remark, dimensions (length/width/height with units), volume (with unit), weight (with unit), size, sku_price (with a currency), color, url — classifies it as either a durable/stockable item or a consumable, edits it as details change, **deprecates** it when it leaves active use (setting `deprecate_time`, which makes its derived status "deprecated") or **restores** it to active, and browses/searches/filters the full catalog in a tabular view.

**Why this priority**: The item catalog is the foundation of the entire domain — acquisitions reference items, scenarios select items, and packing plans arrange items. Nothing else in the feature has meaning without it. Shipping only this story already delivers value: a searchable record of everything the user owns.

**Independent Test**: Can be fully tested by creating several items with varied attributes, editing one, deprecating one (and restoring it), and confirming they appear (with the derived status distinguishable/filterable) in the catalog table with working search, sort, and filter — no other story required.

**Acceptance Scenarios**:

1. **Given** an acquisition being created (User Story 2), **When** the user adds an item with a name, type (stockable or consumable), quantity, and any subset of attributes (spec, remark, length/width/height with units, volume with unit, weight with unit, sku_price with a currency, color, url), **Then** the item is saved under that acquisition and appears in the catalog table.
2. **Given** an existing item, **When** the user edits one or more of its attributes, **Then** the updated values are persisted and reflected in the table.
3. **Given** an existing item, **When** the user deprecates it (confirming a `deprecate_time` that defaults to today 00:00:00), **Then** its derived status reads "deprecated" and it is locatable via the `deprecate_time` filter; a subsequent **Restore** action clears `deprecate_time` and the status returns to "active".
4. **Given** a catalog with many items, **When** the user opens the item list, **Then** items are shown by default sorted descending by their acquisition's obtained date, in the default column order (name, spec, size, weight, length, width, height) plus an obtained-date column, every column shows its header, and the user can further search, sort, or filter (including by deprecated status) as needed.
5. **Given** a consumable item with a quantity on hand, **When** the user updates its quantity, **Then** the new quantity is persisted and displayed.
6. **Given** the item entry within an acquisition, **When** the user submits an item without a required identifying field (name), **Then** the system rejects it with a clear validation message and no item is created.

---

### User Story 2 - Acquire items (acquisition-first creation) (Priority: P1)

Adding items to the catalog is done through an acquisition on a dedicated, standalone page. The user opens "New Acquisition", records how the batch was obtained — source (a store/seller, or a person for gifts; entered via auto-complete over previously-used values), the date obtained, and an optional remark — then adds **one or more items** in the same flow, each with its own attributes. This is the only way items enter the catalog: every item belongs to exactly one acquisition. An acquisition with a **blank source represents unknown or pre-existing origin** (e.g. items the user already owned before using the system).

**Why this priority**: This is now the entry point for the entire catalog (creation happens here), so it is co-critical with browsing the catalog. Without it there are no items.

**Independent Test**: Create an acquisition with a cost/discount/tax_refund adding two items at once (as cards) and a "blank" acquisition adding one pre-existing item; confirm all three items appear in the catalog, each links back to its acquisition, and each acquisition shows its item cards and its derived net_cost.

**Acceptance Scenarios**:

1. **Given** the standalone New Acquisition page, **When** the user fills the acquisition fields and adds two or more items each with a name and attributes, **Then** the acquisition and all its items are saved together and the items appear in the catalog.
2. **Given** an acquisition with items, **When** the user views the acquisition, **Then** it displays the source, obtained date, remark, the item cards, and the payment summary (cost, discount, tax_refund, and the derived net_cost).
3. **Given** an item, **When** the user views it, **Then** its originating acquisition (source and obtained date) is shown.
4. **Given** an acquisition with a blank source, **When** the user views its items, **Then** their origin reads as unknown/pre-existing without error.
5. **Given** an acquisition, **When** the user adds or removes an item, **Then** the acquisition's item cards update accordingly (the acquisition's own cost/discount/tax_refund are independent of item count).
6. **Given** an acquisition, **When** the user deletes it, **Then** its items are also removed from the catalog with a confirmation warning (items cannot exist without an acquisition), OR the user is required to reassign them first.

---

### User Story 3 - Define scenarios and build preparation checklists (Priority: P2)

The user defines a scenario — a named situation such as "Weekend camping" or "Studio photo shoot" — and selects which catalog items are needed for it. From that selection the system produces a preparation checklist the user works through, marking each item as prepared/packed, so they can see at a glance what is still outstanding before they leave.

**Why this priority**: This is the primary planning payoff of the domain and the first story that turns a static catalog into an actionable tool. It depends on User Story 1 but not on acquisitions.

**Independent Test**: Can be tested by creating a scenario, adding several items to it, then working through the generated checklist by marking items prepared and confirming the outstanding count and completion state update correctly.

**Acceptance Scenarios**:

1. **Given** an existing catalog, **When** the user creates a scenario and adds a set of items to it, **Then** the scenario is saved with its item list.
2. **Given** a scenario with items, **When** the user opens its checklist, **Then** each required item appears as a checkable line, unprepared by default.
3. **Given** a scenario checklist, **When** the user marks items as prepared, **Then** the prepared count and remaining/outstanding count update, and the checklist reports complete only when every required item is prepared.
4. **Given** a scenario, **When** the user adds or removes items, **Then** the checklist reflects the change and preparation progress recalculates.
5. **Given** a consumable item required for a scenario in a quantity exceeding the quantity on hand, **When** the user views the checklist, **Then** the shortfall is clearly indicated.

---

### User Story 4 - Enforce constraints on scenarios (Priority: P3)

The user attaches constraints to a scenario that express real-world packing rules — for example "these battery items are mutually exclusive, take only one", "exactly one power source is required", or "total packed weight must not exceed a limit". When building or reviewing the scenario's checklist, the system validates the current selection against its constraints and flags any violations so the user can correct the plan before departure.

**Why this priority**: Constraints add safety and intelligence to scenario planning but are an enhancement on top of the basic checklist in User Story 3, which is fully usable without them.

**Independent Test**: Can be tested by attaching a mutual-exclusivity constraint and a required-selection constraint to a scenario, then adjusting the item selection to trigger and clear each violation, confirming the checklist surfaces the violation status accordingly.

**Acceptance Scenarios**:

1. **Given** a scenario, **When** the user adds a constraint (mutual exclusivity over a set of items, a required-item rule over a set of items, or a total-weight limit), **Then** the constraint is saved and associated with the scenario.
2. **Given** a scenario with a mutual-exclusivity constraint, **When** the selection includes more than one of the mutually exclusive items, **Then** the checklist shows a violation identifying the conflicting items.
3. **Given** a scenario with a required-item constraint, **When** the selection omits every item in the required set, **Then** the checklist shows an unsatisfied-requirement violation.
4. **Given** a scenario with a total-weight-limit constraint, **When** the summed weight of selected items exceeds the limit, **Then** the checklist shows the overage and the amount by which it exceeds the limit.
5. **Given** a scenario whose selection satisfies all constraints, **When** the user reviews the checklist, **Then** it reports no constraint violations.

---

### User Story 5 - Plan item packing and review positions (Priority: P3)

The user organizes items into a physical containment plan for a scenario — assigning items into containers, where a container is itself an item (e.g. camera goes in the padded case, case goes in the backpack). They can then review positions: for any item, see which container it is packed inside (or that it is top-level/unpacked) and its prepared status, and view a container to see everything nested within it.

**Why this priority**: Packing/containment and position review is the most advanced planning capability and depends on both the catalog and scenarios. It is the last slice because it delivers refinement rather than core function.

**Independent Test**: Can be tested by nesting one item inside another for a scenario, then reviewing the parent container to see its contents and reviewing the child item to see its position (inside the parent), and confirming an item cannot be placed inside itself or form a containment cycle.

**Acceptance Scenarios**:

1. **Given** items in a scenario, **When** the user assigns an item into a container item, **Then** the containment relationship is saved and the child appears nested under the container.
2. **Given** a container with nested items, **When** the user reviews the container, **Then** all directly-contained items are listed and multi-level nesting is navigable.
3. **Given** a packed item, **When** the user reviews it, **Then** its position — the container it is inside (or top-level) — and its prepared status are shown.
4. **Given** a containment action that would place an item inside itself or create a cycle (A in B, B in A), **When** the user attempts it, **Then** the system rejects the action with a clear message.
5. **Given** items and containers, **When** the user reviews positions across the scenario, **Then** each item's current position and prepared/packed status are visible in one review.

---

### Edge Cases

- **Deprecated items in plans**: What happens when an item that is part of an active scenario is deprecated? The item remains referenced with a clear deprecated indicator; it is not silently removed from existing plans.
- **Deleting a referenced item**: How does the system handle deleting an item that is linked to acquisitions, scenarios, or used as/inside a container? Deletion is blocked or the references are cleanly detached with a warning, rather than leaving dangling references.
- **Consumable depletion**: How is a consumable whose quantity on hand reaches zero represented in the catalog and in scenario checklists?
- **Conflicting constraints**: What happens when two constraints on the same scenario cannot both be satisfied by any selection (e.g. a required item that another constraint excludes)? Both violations are surfaced rather than one masking the other.
- **Container removed while holding items**: What happens to nested items when their container is removed from a scenario or deprecated — are they orphaned to "no container" or does the action require emptying first?
- **Empty scenario**: What does the checklist show for a scenario with no items selected yet?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the user to create (via an acquisition — FR-006), view, edit, and deprecate items, where each item records at minimum a name, a type (stockable/durable or consumable), and a quantity (required, default 1), plus optional attributes: spec (multi-line), remark (multi-line), length/width/height/volume (each with a unit), size, weight (with a unit), sku_price (with a currency), color, and url. A read-only **`total_price` is derived as `sku_price × quantity`**. Every item belongs to exactly one acquisition. (No `model`, `serial_number`, or per-item `cost` — the amount paid lives on the acquisition, FR-006.)
- **FR-002**: An item is **deprecated** by setting `deprecate_time` (the "Deprecate" action; its confirm dialog collects the timestamp, defaulting to **today 00:00:00** local). Setting `deprecate_time` marks the item deprecated; a **"Restore/Activate"** action clears `deprecate_time` and returns the item to active. `deprecate_time` is a filterable attribute; the default view does not auto-exclude deprecated items.
- **FR-002a**: `item.status` is **derived, read-only**: **deprecated** when `deprecate_time` is set, otherwise **active**. There is no separately-editable status field, and no separate `archived_at` (deprecate_time is the single lifecycle timestamp). The status column MUST reflect the derived value.
- **FR-002b**: Numeric measurement attributes (length, width, height, weight, volume) MUST each carry a unit from a fixed per-measure set (length: mm/cm/m/in; weight: g/kg/lb; volume: mL/L) and MUST store a normalized canonical value (mm, g, mL respectively) so that sorting and filtering compare correctly across mixed units.
- **FR-002c**: Monetary fields carry a currency stored as a currency **code string** — the item's `sku_price` and the acquisition's `cost` (see FR-006). The currency picker is populated from the finance domain's currencies **via its API** (no import of finance models and no cross-domain database foreign key — Principle II). When the associated amount is 0 or empty, its currency selector MUST be **disabled** and show the standard "—" placeholder.
- **FR-003**: System MUST present items in a tabular catalog view supporting search, sort, filtering, column configuration, and pagination consistent with other unihub domain tables. The default view MUST sort **descending by the item's acquisition obtained date** and use the default column order: name, spec, size, weight, length, width, height; an **acquisition obtained-date column** MUST be present. **Every column MUST render its localized header** (no blank headers), and absent values MUST use the single standard placeholder "—" (Principle VI) — no mixed placeholder styles.
- **FR-004**: System MUST track a quantity for items (required, default 1) and allow the user to update it.
- **FR-005**: System MUST validate item input and reject creation/update that omits required information (name, quantity) or contains invalid attribute values (e.g. negative dimensions/weight/volume/quantity), returning clear messages.
- **FR-006**: System MUST provide a standalone acquisition page where the user creates an acquisition AND adds one or more items in the same flow. Each acquisition records a source, an optional **`request_time`** (when the order was initiated/requested), a date obtained (`obtained_at`, defaulting to **today 00:00:00** in the create form), an optional remark, and the **payment for the order**: `cost` (with a currency), `discount`, and `tax_refund` — from which a read-only **`net_cost = cost − discount − tax_refund`** is derived. `source` MUST be an **auto-complete** suggesting previously-used source values (free text still allowed). On the acquisition form, source / obtained_at MUST share one row on wide screens and stack on narrow screens (responsive). Creating items outside of an acquisition MUST NOT be offered. The **"Items in this acquisition" section MUST render as a card view** (one card per item, previewing only the item's filled fields; empty fields omitted); each card MUST be **editable** in place (reopen the item form pre-filled and save back) and removable.
- **FR-006a**: An acquisition MUST contain **at least one item** — the create/edit form MUST reject submission with zero items. The **create** form MUST pre-insert **one default (empty) item card** so the user can begin filling it immediately.
- **FR-007**: System MUST let the user view, from an acquisition, its items and its payment summary (`cost`, `discount`, `tax_refund`, and the derived `net_cost`), and MUST allow adding/editing/removing items on an existing acquisition, which MUST be **editable on its own standalone page**.
- **FR-008**: System MUST show, from an item, its originating acquisition (source and obtained date). An acquisition with a blank source MUST be presented as unknown/pre-existing origin rather than an error.
- **FR-009**: Deleting an acquisition MUST remove its items as well (since an item cannot exist without an acquisition) behind a confirmation warning that states the item count, OR require the user to reassign the items to another acquisition first. No item is ever left without an acquisition.
- **FR-010**: System MUST allow the user to create, view, edit, and delete scenarios, each with a name and a selected set of items.
- **FR-011**: System MUST generate, for each scenario, a preparation checklist listing every required item with a prepared/unprepared state, and MUST track and display preparation progress (prepared count, outstanding count, overall completion).
- **FR-012**: System MUST recalculate a scenario's checklist and progress whenever its item selection changes.
- **FR-013**: System MUST allow the user to define constraints on a scenario, supporting: mutual exclusivity over a set of items, a required-item rule over a set of items (at least one must be selected), and a total-weight limit. (Category-based rules are out of scope — `item.category` is removed.)
- **FR-014**: System MUST evaluate a scenario's current selection against its constraints and clearly surface each violation (which constraint, which items, and by how much for quantitative limits), and report a satisfied state when no constraint is violated.
- **FR-015**: System MUST allow the user to arrange items into a containment hierarchy for a scenario, where a container is itself an item and items may be nested multiple levels deep.
- **FR-016**: System MUST prevent an item from being placed inside itself and MUST prevent containment cycles.
- **FR-017**: System MUST let the user review positions — for any item, the container it is packed inside (or top-level) and its prepared/packed status; and for any container, the items nested within it.
- **FR-018**: System MUST prevent or clearly warn on deletion of an item that is still referenced by an acquisition, a scenario, or a containment relationship, avoiding dangling references.
- **FR-019**: System MUST expose the Inventory domain as a navigable section of the unihub dashboard with its own menu entry and localized labels, consistent with existing domains.
- **FR-020**: System MUST scope all inventory data to the authenticated user and follow the same authentication and permission model as other unihub domains.
- **FR-021**: Standalone detail/create/edit pages (Scenario detail, Acquisition create, Acquisition edit) MUST use a **breadcrumb** for navigation rather than a back button, and MUST NOT render a Cancel button (the user navigates away via the breadcrumb).
- **FR-022**: The Add-Item modal (and any create/edit modal) MUST: place the **Cancel button left-most**; **not close on outside click while the form is dirty**; and **stack its fields on narrow screens** (responsive). When editing an item, the modal is pre-filled with the item's current values.
- **FR-023**: Item forms MUST default `quantity` to 1 and require it; disable a currency selector whenever its amount is 0/empty; and derive `status` from `deprecate_time` (no manual status control).

### Key Entities *(include if feature involves data)*

- **Item**: A physical thing the user owns or consumes. Attributes: name, type (stockable/durable vs consumable), quantity (required, default 1), spec (multi-line), remark (multi-line), dimensions (length/width/height, each with a unit + normalized canonical value), volume (unit mL/L + canonical mL), size, weight (with a unit + normalized canonical value), sku_price (per-unit, with currency code), color, url, and `deprecate_time`. Derived: **`total_price` = `sku_price × quantity`** (read-only). **`status` is derived** (deprecated when `deprecate_time` is set, else active) — not a stored, editable field. Belongs to exactly one **Acquisition**. May act as a container holding other items. Central entity referenced by scenarios and containment relationships. (No `model`, `serial_number`, `cost`, `category`, `storage_location`, `purchase_time`, or separate `archived_at`/`status`/`price` field.)
- **Acquisition** (formerly referred to as "Order"): A record of how a batch of one or more items was obtained and paid for, and the sole creation path for items. Attributes: source (a store, seller, or person; entered via auto-complete), optional `request_time` (when the order was initiated), date obtained (`obtained_at`), remark, and the order payment — `cost` (with a currency code), `discount`, `tax_refund`. Derived: **`net_cost` = `cost − discount − tax_refund`** (read-only). Owns **at least one** item (composition — deleting it removes its items). A blank source signifies unknown/pre-existing origin. (No `method`, `arrived_at`, arrival status, or per-item cost.)
- **Scenario**: A named situation for which the user prepares a set of items (e.g. a trip or event). Holds a selection of required items, produces a preparation checklist, tracks preparation progress, and owns zero or more constraints and a containment plan.
- **Constraint**: A packing rule attached to a scenario — mutual exclusivity over a set of items, a required-item rule over a set of items, or a quantitative limit such as total weight. Evaluated against the scenario's selection to detect violations. (No category-based matching.)
- **Containment relationship**: A parent-child link within a scenario expressing that one item is packed inside another (container) item; forms an acyclic hierarchy and underlies position review.
- **Checklist item**: The per-item preparation state (prepared/unprepared, required quantity, position/packed status) derived from a scenario's selection; the working surface the user checks off.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add a new item to the catalog with its core attributes in under 1 minute.
- **SC-002**: A user can locate any specific item in a catalog of at least 500 items in under 15 seconds using search, sort, or filter.
- **SC-003**: A user can go from creating a new scenario to a fully populated preparation checklist in under 3 minutes.
- **SC-004**: When a scenario's selection violates a constraint, the violation is surfaced within the same review, with 100% of defined constraint types (mutual exclusivity, required selection, total-weight limit) correctly flagged when violated and not flagged when satisfied.
- **SC-005**: For any packed item, a user can determine its current position (the container it is inside, or top-level) in a single view without manual cross-referencing.
- **SC-006**: The system prevents 100% of invalid containment attempts (self-containment and cycles) with a clear message.
- **SC-007**: No acquisition or scenario operation ever deletes or corrupts an item record — item count is preserved across all acquisition/scenario edits and deletions in testing.
- **SC-008**: A user can review overall scenario readiness (outstanding items and any constraint violations) at a glance, completing a pre-departure check in under 1 minute for a scenario of up to 30 items.

## Assumptions

- **Single-user, personal scope**: Inventory data belongs to the authenticated user, mirroring the personal-hub model of existing unihub domains; no multi-user sharing, lending, or team collaboration is in scope for this feature.
- **Item type model**: Items are classified as either stockable/durable (tracked as discrete possessions) or consumable (tracked by a quantity on hand that the user adjusts). Automatic consumption/depletion driven by usage events is out of scope; quantity changes are manual.
- **Item is an individual possession, not a product type (SKU)**: The catalog entity is called **Item** and represents a specific owned thing. A retail-style product-type/variant layer ("SKU" with multiple interchangeable units beneath it) is explicitly out of scope for v1; if two identical products are owned, they are two Items.
- **Containment is scenario-scoped**: The "which item is packed inside which" plan is defined per scenario (packing for a situation), not as a permanent global storage graph. There is no per-item storage-location attribute in v1. If a permanent global containment model is desired instead, that is a future refinement.
- **Constraint set for v1**: Constraints support mutual exclusivity, required-item selection (over an explicit item set), and total-weight limit. Category-based rules and other constraint types (volume/size fit, temperature, custom expressions) are out of scope for the initial version.
- **Checklist is preparation-oriented**: The checklist reflects preparation/packing readiness for a scenario; it is not a real-time stock ledger or barcode-scanning workflow.
- **Acquisition-first & composition**: Items are created only within an acquisition and belong to exactly one; there is no standalone item-creation path and no acquisition-less item. Deleting an acquisition deletes its items (composition) behind a count-stating confirmation.
- **Currency handling**: the item's `sku_price` and the acquisition's `cost` each store a currency code string; the picker reads the finance domain's currencies over its API. Inventory does not import finance models or hold a DB foreign key to them (Principle II). No automatic FX conversion is performed within Inventory (`discount`/`tax_refund` are assumed to be in the acquisition's `cost` currency).
- **Units**: Length/weight units come from a fixed per-measure set and are normalized to a canonical base unit (mm, g) for storage so cross-unit sort/filter is correct; the entered unit is retained for display.
- **Platform consistency**: The Inventory app is delivered as a new domain within the existing unihub dashboard and reuses the established entity-centric backend structure, shared table component, service-layer pattern, navigation, i18n, and authentication — no new standalone application.
- **Deletion vs deprecation**: Deprecating (setting `deprecate_time`) marks an item retired but keeps it in the catalog (surfaced via the deprecated filter) and is reversible via Restore; hard deletion of an item happens through its acquisition (FR-009).
