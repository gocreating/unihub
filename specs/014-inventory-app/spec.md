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

## User Scenarios & Testing *(mandatory)*

The Inventory domain is a new section of the unihub dashboard where a user catalogs everything they own or consume, records how those things were acquired, and plans which items to take and how to pack them for real-world situations (a trip, a shoot, an event). Each user story below is an independently shippable slice.

### User Story 1 - Catalog and manage items (Priority: P1)

The user maintains a personal catalog of physical things they own. Items are added through an acquisition (see User Story 2) rather than a standalone form. The user records each item's descriptive and logistical attributes — model, serial number, spec, remark, quantity on hand, dimensions (length/width/height with units) and weight (with unit), size, price and cost (each with a currency), color, url — classifies it as either a durable/stockable item or a consumable, sets its status (active/deprecated), edits it as details change, archives it when it leaves the collection, and browses/searches/filters the full catalog in a tabular view.

**Why this priority**: The item catalog is the foundation of the entire domain — acquisitions reference items, scenarios select items, and packing plans arrange items. Nothing else in the feature has meaning without it. Shipping only this story already delivers value: a searchable record of everything the user owns.

**Independent Test**: Can be fully tested by creating several items with varied attributes, editing one, archiving one, and confirming they appear (and archived ones are distinguishable/filterable) in the catalog table with working search, sort, and filter — no other story required.

**Acceptance Scenarios**:

1. **Given** an acquisition being created (User Story 2), **When** the user adds an item with a name, type (stockable or consumable), and any subset of attributes (model, serial number, spec, remark, quantity, length/width/height with units, weight with unit, price and cost each with a currency, color, url), **Then** the item is saved under that acquisition and appears in the catalog table.
2. **Given** an existing item, **When** the user edits one or more of its attributes, **Then** the updated values are persisted and reflected in the table.
3. **Given** an existing item, **When** the user archives it, **Then** it is marked archived (recording the archive time) and can be located via the archived filter (there is no separate active/archived toggle).
4. **Given** a catalog with many items, **When** the user opens the item list, **Then** items are shown by default sorted descending by their acquisition's obtained date, in the default column order (name, spec, model, serial, size, weight, length, width, height), and the user can further search, sort, or filter (including by archived status) as needed.
5. **Given** a consumable item with a quantity on hand, **When** the user updates its quantity, **Then** the new quantity is persisted and displayed.
6. **Given** the item entry within an acquisition, **When** the user submits an item without a required identifying field (name), **Then** the system rejects it with a clear validation message and no item is created.

---

### User Story 2 - Acquire items (acquisition-first creation) (Priority: P1)

Adding items to the catalog is done through an acquisition on a dedicated, standalone page. The user opens "New Acquisition", records how the batch was obtained — acquisition method (purchase, gift, transfer, found, or other — optional), source (a store/seller for purchases, a person for gifts), the date obtained, and an optional remark — then adds **one or more items** in the same flow, each with its own attributes. This is the only way items enter the catalog: every item belongs to exactly one acquisition. An acquisition with a **blank method/source represents unknown or pre-existing origin** (e.g. items the user already owned before using the system).

**Why this priority**: This is now the entry point for the entire catalog (creation happens here), so it is co-critical with browsing the catalog. Without it there are no items.

**Independent Test**: Create a purchase acquisition adding two items at once (with costs) and a "blank" acquisition adding one pre-existing item; confirm all three items appear in the catalog, each links back to its acquisition, and each acquisition shows its items with an aggregated total cost.

**Acceptance Scenarios**:

1. **Given** the standalone New Acquisition page, **When** the user fills the acquisition fields and adds two or more items each with a name and attributes, **Then** the acquisition and all its items are saved together and the items appear in the catalog.
2. **Given** an acquisition with items, **When** the user views the acquisition, **Then** it displays the method, source, obtained date, remark, the list of items, and an aggregated total cost (which may be zero when no cost applies).
3. **Given** an item, **When** the user views it, **Then** its originating acquisition and that acquisition's method are shown.
4. **Given** an acquisition with a blank method and source, **When** the user views its items, **Then** their origin reads as unknown/pre-existing without error.
5. **Given** an acquisition, **When** the user adds or removes an item, **Then** the acquisition's item list and aggregated total cost update accordingly.
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

- **Archived items in plans**: What happens when an item that is part of an active scenario or acquisition is archived? The item remains referenced with a clear archived indicator; it is not silently removed from existing plans.
- **Deleting a referenced item**: How does the system handle deleting an item that is linked to acquisitions, scenarios, or used as/inside a container? Deletion is blocked or the references are cleanly detached with a warning, rather than leaving dangling references.
- **Consumable depletion**: How is a consumable whose quantity on hand reaches zero represented in the catalog and in scenario checklists?
- **Conflicting constraints**: What happens when two constraints on the same scenario cannot both be satisfied by any selection (e.g. a required item that another constraint excludes)? Both violations are surfaced rather than one masking the other.
- **Container removed while holding items**: What happens to nested items when their container is removed from a scenario or archived — are they orphaned to "no container" or does the action require emptying first?
- **Duplicate serial numbers**: How does the system treat two items entered with the same serial number — allowed with a soft warning, or rejected?
- **Empty scenario**: What does the checklist show for a scenario with no items selected yet?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the user to create (via an acquisition — FR-006), view, edit, and archive items, where each item records at minimum a name and a type (stockable/durable or consumable), plus optional attributes: model, serial number, spec (multi-line), remark (multi-line), quantity on hand, length/width/height (each with a unit), size, weight (with a unit), price and cost (each with a currency), color, url, and status. Every item belongs to exactly one acquisition.
- **FR-002**: System MUST record an archive time when an item is archived and expose archived status as a filterable attribute of the catalog (there is no dedicated active/archived toggle; the default view does not auto-exclude archived items).
- **FR-002a**: `item.status` MUST be one of exactly two values — **active** or **deprecated** (default active).
- **FR-002b**: Numeric measurement attributes (length, width, height, weight) MUST each carry a unit from a fixed per-measure set (length: mm/cm/m/in; weight: g/kg/lb) and MUST store a normalized canonical value (mm for lengths, g for weight) so that sorting and filtering compare correctly across mixed units.
- **FR-002c**: `price` and `cost` MUST each carry their own currency, stored as a currency **code string**; the currency picker is populated from the finance domain's currencies **via its API** (no import of finance models and no cross-domain database foreign key — Principle II).
- **FR-003**: System MUST present items in a tabular catalog view supporting search, sort, filtering, column configuration, and pagination consistent with other unihub domain tables. The default view MUST sort **descending by the item's acquisition obtained date** and use the default column order: name, spec, model, serial, size, weight, length, width, height.
- **FR-004**: System MUST track a quantity on hand for consumable items and allow the user to update it.
- **FR-005**: System MUST validate item input and reject creation/update that omits required identifying information (name) or contains invalid attribute values (e.g. negative dimensions/weight/quantity), returning clear messages.
- **FR-006**: System MUST provide a standalone acquisition page where the user creates an acquisition AND adds one or more items in the same flow. Each acquisition records a source, a date obtained (`obtained_at`), an optional typed acquisition method (purchase, gift, transfer, found, or other), and an optional remark. Creating items outside of an acquisition MUST NOT be offered.
- **FR-007**: System MUST let the user view, from an acquisition, its items and an aggregated total cost (which may be zero when no cost applies), and MUST allow adding/removing items on an existing acquisition.
- **FR-008**: System MUST show, from an item, its originating acquisition and that acquisition's method. An acquisition with a blank method and source MUST be presented as unknown/pre-existing origin rather than an error.
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
- **FR-021**: The Scenario detail page MUST use a breadcrumb for navigation (Scenarios → «scenario name») rather than a back button.

### Key Entities *(include if feature involves data)*

- **Item**: A physical thing the user owns or consumes. Attributes: name, type (stockable/durable vs consumable), model, serial number, spec (multi-line), remark (multi-line), quantity on hand, dimensions (length/width/height, each with a unit + normalized canonical value), size, weight (with a unit + normalized canonical value), price (with currency code), cost (with currency code), color, url, status (active/deprecated), and archive time. Belongs to exactly one **Acquisition**. May act as a container holding other items. Central entity referenced by scenarios and containment relationships. (No `category`, `storage_location`, or `purchase_time`.)
- **Acquisition** (formerly referred to as "Order"): A record of how a batch of one or more items was obtained, and the sole creation path for items. Attributes: source (a store, seller, or person), date obtained (`obtained_at`), optional typed acquisition method (purchase, gift, transfer, found, other), and remark. Owns one or more items (composition — deleting it removes its items); aggregates their cost. A blank method/source signifies unknown/pre-existing origin. (No `arrived_at` / arrival status.)
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
- **Currency handling**: `price` and `cost` each store a currency code string; the picker reads the finance domain's currencies over its API. Inventory does not import finance models or hold a DB foreign key to them (Principle II). No automatic FX conversion is performed within Inventory.
- **Units**: Length/weight units come from a fixed per-measure set and are normalized to a canonical base unit (mm, g) for storage so cross-unit sort/filter is correct; the entered unit is retained for display.
- **Platform consistency**: The Inventory app is delivered as a new domain within the existing unihub dashboard and reuses the established entity-centric backend structure, shared table component, service-layer pattern, navigation, i18n, and authentication — no new standalone application.
- **Deletion vs archive**: Archiving marks an item retired but keeps it in the catalog (surfaced via the archived filter); hard deletion of an item happens through its acquisition (FR-009).
