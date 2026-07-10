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

## User Scenarios & Testing *(mandatory)*

The Inventory domain is a new section of the unihub dashboard where a user catalogs everything they own or consume, records how those things were acquired, and plans which items to take and how to pack them for real-world situations (a trip, a shoot, an event). Each user story below is an independently shippable slice.

### User Story 1 - Catalog and manage items (Priority: P1)

The user maintains a personal catalog of physical things they own. They add an item (e.g. "Sony A7 IV camera body"), record its descriptive and logistical attributes (model, serial number, quantity on hand, dimensions, weight, price, cost, purchase date), classify it as either a durable/stockable item or a consumable, edit it as details change, archive it when it leaves the collection, and browse/search/filter the full catalog in a tabular view.

**Why this priority**: The item catalog is the foundation of the entire domain — acquisitions reference items, scenarios select items, and packing plans arrange items. Nothing else in the feature has meaning without it. Shipping only this story already delivers value: a searchable record of everything the user owns.

**Independent Test**: Can be fully tested by creating several items with varied attributes, editing one, archiving one, and confirming they appear (and archived ones are distinguishable/filterable) in the catalog table with working search, sort, and filter — no other story required.

**Acceptance Scenarios**:

1. **Given** an empty catalog, **When** the user creates an item with a name, type (stockable or consumable), and any subset of attributes (model, serial number, quantity, length/width/height, weight, price, cost, purchase date), **Then** the item is saved and appears in the catalog table.
2. **Given** an existing item, **When** the user edits one or more of its attributes, **Then** the updated values are persisted and reflected in the table.
3. **Given** an existing item, **When** the user archives it, **Then** it is marked archived (recording the archive time) and is excluded from the default active view but retrievable via an archived filter.
4. **Given** a catalog with many items, **When** the user searches by name or model, or sorts/filters by an attribute (e.g. type, weight), **Then** only matching items are shown, ordered as requested.
5. **Given** a consumable item with a quantity on hand, **When** the user updates its quantity, **Then** the new quantity is persisted and displayed.
6. **Given** an item creation form, **When** the user submits without a required identifying field (name), **Then** the system rejects the submission with a clear validation message and no item is created.

---

### User Story 2 - Record acquisitions (Priority: P2)

The user records how items were obtained. They create an acquisition that captures the acquisition method (purchase, gift, transfer, found, or other — optional), the source (a store or seller for purchases, a person for gifts), the date obtained, and — where relevant — the date it arrived and its cost, then associate one or more catalog items with that acquisition. Later they can look at an item and see which acquisition it came from, or open an acquisition and see everything it included and its total cost. Recording an acquisition is optional: an item may have no acquisition record, meaning its origin is unknown or it predates the user's use of the system.

**Why this priority**: Acquisition history gives the catalog provenance and enables cost/spend review, but the catalog is usable without it — items can exist with no acquisition at all. It builds directly on User Story 1.

**Independent Test**: Can be tested by creating acquisitions of different methods (a purchase with a cost and a gift with no cost), linking existing items to them, and confirming each acquisition lists its items with an aggregated total cost, and each linked item shows its originating acquisition.

**Acceptance Scenarios**:

1. **Given** existing items, **When** the user creates an acquisition with a method, a source, a date obtained, and (optionally) an arrive time and cost, and links one or more items to it, **Then** the acquisition is saved with its item associations.
2. **Given** an acquisition with linked items, **When** the user views the acquisition, **Then** it displays the method, source, dates, the list of associated items, and an aggregated total cost (which may be zero when no cost applies).
3. **Given** an item linked to an acquisition, **When** the user views that item, **Then** the originating acquisition and its method are shown.
4. **Given** an item with no acquisition record, **When** the user views that item, **Then** its origin is shown as unknown/unrecorded without error.
5. **Given** a purchase acquisition not yet marked arrived, **When** the user views the acquisitions list, **Then** its arrival status is visibly distinguishable from arrived acquisitions.
6. **Given** an acquisition, **When** the user removes an item association or deletes the acquisition, **Then** the affected items remain in the catalog (the item is not deleted with the acquisition).

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

1. **Given** a scenario, **When** the user adds a constraint (such as mutual exclusivity over a set of items, a required-item/required-category rule, or a total-weight limit), **Then** the constraint is saved and associated with the scenario.
2. **Given** a scenario with a mutual-exclusivity constraint, **When** the selection includes more than one of the mutually exclusive items, **Then** the checklist shows a violation identifying the conflicting items.
3. **Given** a scenario with a required-selection constraint, **When** the selection omits the required item/category, **Then** the checklist shows an unsatisfied-requirement violation.
4. **Given** a scenario with a total-weight-limit constraint, **When** the summed weight of selected items exceeds the limit, **Then** the checklist shows the overage and the amount by which it exceeds the limit.
5. **Given** a scenario whose selection satisfies all constraints, **When** the user reviews the checklist, **Then** it reports no constraint violations.

---

### User Story 5 - Plan item packing and review positions (Priority: P3)

The user organizes items into a physical containment plan for a scenario — assigning items into containers, where a container is itself an item (e.g. camera goes in the padded case, case goes in the backpack). They can then review positions: for any item, see where it currently is (its storage location or which container it is packed inside) and its status, and view a container to see everything nested within it.

**Why this priority**: Packing/containment and position review is the most advanced planning capability and depends on both the catalog and scenarios. It is the last slice because it delivers refinement rather than core function.

**Independent Test**: Can be tested by nesting one item inside another for a scenario, then reviewing the parent container to see its contents and reviewing the child item to see its position (inside the parent), and confirming an item cannot be placed inside itself or form a containment cycle.

**Acceptance Scenarios**:

1. **Given** items in a scenario, **When** the user assigns an item into a container item, **Then** the containment relationship is saved and the child appears nested under the container.
2. **Given** a container with nested items, **When** the user reviews the container, **Then** all directly-contained items are listed and multi-level nesting is navigable.
3. **Given** a packed item, **When** the user reviews it, **Then** its position — its storage location or the container it is inside — and its status are shown.
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

- **FR-001**: System MUST allow the user to create, view, edit, and archive items, where each item records at minimum a name and a type (stockable/durable or consumable), plus optional attributes: model, serial number, quantity on hand, length, width, height, size, weight, price, cost, and purchase time.
- **FR-002**: System MUST record an archive time when an item is archived and exclude archived items from the default active catalog view while keeping them retrievable via a filter.
- **FR-003**: System MUST present items in a tabular catalog view supporting search, sort, filtering, column configuration, and pagination consistent with other unihub domain tables.
- **FR-004**: System MUST track a quantity on hand for consumable items and allow the user to update it.
- **FR-005**: System MUST validate item input and reject creation/update that omits required identifying information (name) or contains invalid attribute values (e.g. negative dimensions/weight/quantity), returning clear messages.
- **FR-006**: System MUST allow the user to create, view, edit, and delete acquisitions, where each acquisition records a source, a date obtained, an optional typed acquisition method (purchase, gift, transfer, found, or other), an optional arrive time, and an optional cost.
- **FR-007**: System MUST allow the user to associate one or more items with an acquisition and to view, from an acquisition, its associated items and an aggregated total cost (which may be zero when no cost applies).
- **FR-008**: System MUST allow the user to see, from an item, the acquisition it originated from, if any; an item with no acquisition is valid and MUST be shown as having an unknown/unrecorded origin rather than an error.
- **FR-009**: System MUST preserve items when an acquisition is deleted or an item association is removed — items are never deleted as a side effect of acquisition changes.
- **FR-010**: System MUST allow the user to create, view, edit, and delete scenarios, each with a name and a selected set of items.
- **FR-011**: System MUST generate, for each scenario, a preparation checklist listing every required item with a prepared/unprepared state, and MUST track and display preparation progress (prepared count, outstanding count, overall completion).
- **FR-012**: System MUST recalculate a scenario's checklist and progress whenever its item selection changes.
- **FR-013**: System MUST allow the user to define constraints on a scenario, supporting at least: mutual exclusivity over a set of items, a required item/category selection, and a total-weight limit.
- **FR-014**: System MUST evaluate a scenario's current selection against its constraints and clearly surface each violation (which constraint, which items, and by how much for quantitative limits), and report a satisfied state when no constraint is violated.
- **FR-015**: System MUST allow the user to arrange items into a containment hierarchy for a scenario, where a container is itself an item and items may be nested multiple levels deep.
- **FR-016**: System MUST prevent an item from being placed inside itself and MUST prevent containment cycles.
- **FR-017**: System MUST let the user review positions — for any item, its current storage location or containing container and its prepared/packed status; and for any container, the items nested within it.
- **FR-018**: System MUST prevent or clearly warn on deletion of an item that is still referenced by an acquisition, a scenario, or a containment relationship, avoiding dangling references.
- **FR-019**: System MUST expose the Inventory domain as a navigable section of the unihub dashboard with its own menu entry and localized labels, consistent with existing domains.
- **FR-020**: System MUST scope all inventory data to the authenticated user and follow the same authentication and permission model as other unihub domains.

### Key Entities *(include if feature involves data)*

- **Item**: A physical thing the user owns or consumes. Attributes: name, type (stockable/durable vs consumable), model, serial number, quantity on hand, dimensions (length/width/height), size, weight, price, cost, purchase time, archive time, current storage location, and status. May act as a container holding other items. Central entity referenced by acquisitions, scenarios, and containment relationships.
- **Acquisition** (formerly referred to as "Order"): A record of how one or more items were obtained. Attributes: source (a store, seller, or person), date obtained, optional typed acquisition method (purchase, gift, transfer, found, other), optional arrive time and arrival status, and optional cost. Associated with zero or more items; aggregates their cost. Linking an item to an acquisition is optional — an item with no acquisition has an unknown/unrecorded origin (e.g. the user does not recall, or the item predates system use).
- **Scenario**: A named situation for which the user prepares a set of items (e.g. a trip or event). Holds a selection of required items, produces a preparation checklist, tracks preparation progress, and owns zero or more constraints and a containment plan.
- **Constraint**: A packing rule attached to a scenario — mutual exclusivity over a set of items, a required item/category, or a quantitative limit such as total weight. Evaluated against the scenario's selection to detect violations.
- **Containment relationship**: A parent-child link within a scenario expressing that one item is packed inside another (container) item; forms an acyclic hierarchy and underlies position review.
- **Checklist item**: The per-item preparation state (prepared/unprepared, required quantity, position/packed status) derived from a scenario's selection; the working surface the user checks off.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add a new item to the catalog with its core attributes in under 1 minute.
- **SC-002**: A user can locate any specific item in a catalog of at least 500 items in under 15 seconds using search, sort, or filter.
- **SC-003**: A user can go from creating a new scenario to a fully populated preparation checklist in under 3 minutes.
- **SC-004**: When a scenario's selection violates a constraint, the violation is surfaced within the same review, with 100% of defined constraint types (mutual exclusivity, required selection, total-weight limit) correctly flagged when violated and not flagged when satisfied.
- **SC-005**: For any packed item, a user can determine its current position (storage location or containing container) in a single view without manual cross-referencing.
- **SC-006**: The system prevents 100% of invalid containment attempts (self-containment and cycles) with a clear message.
- **SC-007**: No acquisition or scenario operation ever deletes or corrupts an item record — item count is preserved across all acquisition/scenario edits and deletions in testing.
- **SC-008**: A user can review overall scenario readiness (outstanding items and any constraint violations) at a glance, completing a pre-departure check in under 1 minute for a scenario of up to 30 items.

## Assumptions

- **Single-user, personal scope**: Inventory data belongs to the authenticated user, mirroring the personal-hub model of existing unihub domains; no multi-user sharing, lending, or team collaboration is in scope for this feature.
- **Item type model**: Items are classified as either stockable/durable (tracked as discrete possessions) or consumable (tracked by a quantity on hand that the user adjusts). Automatic consumption/depletion driven by usage events is out of scope; quantity changes are manual.
- **Item is an individual possession, not a product type (SKU)**: The catalog entity is called **Item** and represents a specific owned thing. A retail-style product-type/variant layer ("SKU" with multiple interchangeable units beneath it) is explicitly out of scope for v1; if two identical products are owned, they are two Items.
- **Containment is scenario-scoped**: The "which item is packed inside which" plan is defined per scenario (packing for a situation), not as a permanent global storage graph. A separate "storage location" attribute captures where an item lives when not packed. If a permanent global containment model is desired instead, that is a future refinement.
- **Constraint set for v1**: Constraints support mutual exclusivity, required item/category selection, and total-weight limit. Additional constraint types (volume/size fit, temperature, custom expressions) are out of scope for the initial version.
- **Checklist is preparation-oriented**: The checklist reflects preparation/packing readiness for a scenario; it is not a real-time stock ledger or barcode-scanning workflow.
- **Acquisition-cost aggregation** uses each linked item's recorded cost; currency handling follows whatever convention existing unihub domains use and is not re-specified here.
- **Platform consistency**: The Inventory app is delivered as a new domain within the existing unihub dashboard and reuses the established entity-centric backend structure, shared table component, service-layer pattern, navigation, i18n, and authentication — no new standalone application.
- **Deletion vs archive**: Archiving is the normal way to retire an item from active use; hard deletion is a secondary action guarded against dangling references.
