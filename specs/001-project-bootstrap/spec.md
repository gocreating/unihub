# Feature Specification: UniHub Project Bootstrap

**Feature Branch**: `001-project-bootstrap`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "Initialize the unihub project and setup initial constitutions. This project should use the same frontend/backend stack as ov-pro-tools (ant design, django, postgres, etc.). The idea is to collect several backend apps together, targeting different life domains, and share a centralized dashboard frontend web interface to interact with users. The core concept is similar to Notion's database — users can manage entities and customize attributes for each domain. The customizable tabular entity infrastructure should be shared across the whole project, but each domain app can build different UIs or visualizations."

## Clarifications

### Session 2026-05-17

- Q: Should system-defined attributes (built-in domain fields) and user-defined attributes share the same underlying model, or be kept separate? → A: Unified model — all attributes share one `AttributeDefinition` table; system attributes are flagged `is_system=True` and protected from deletion/rename; same rendering and storage path for both.
- Q: What is the primary entity type (or types) the Finance domain tracks in v1? → A: Balance sheet snapshots — no transaction recording. Three entity types: Account (a financial account), BalanceSheet (a dated snapshot), and Balance (the value of a specific account within a specific balance sheet).
- Q: What should happen to existing attribute values when a user-defined attribute definition is deleted? → A: Hard delete with confirmation warning — system warns how many entities have values, user confirms, all values are permanently removed along with the definition.

### Session 2026-05-17 (continued)

- Direct input: Each Account in the Finance domain MUST have a currency assigned (ISO 4217 code, e.g., USD, EUR, TWD). The Finance domain supports multiple currencies across accounts.
- Q: When a balance sheet contains accounts in multiple currencies, how should net worth be displayed? → A: The Finance domain includes a user-managed exchange rate database where rates between currency pairs are recorded with timestamps. When computing net worth, the system applies the closest (most recent prior) rate to the balance sheet's date. The balance sheet aggregation shows both (a) per-currency subtotals and (b) a total converted to a user-selected base currency.
- Direct input: All numeric values in the Finance domain (Balance amounts, ExchangeRate rates, computed net worth totals) MUST use exact decimal precision — never floating-point types. Backend stores values as fixed-precision decimal (not float). API transmits all numeric Finance values as JSON strings. Frontend performs all arithmetic using a Decimal library (e.g., decimal.js), never JavaScript's native `number` type.
- Q: What short string format should be used for entity primary keys? → A: NanoID, 12 characters, alphanumeric-only alphabet (`A-Za-z0-9`, 62 chars — no underscores or dashes). Generated server-side. Applied to all domain entity models and the shared core infrastructure models.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access the Central Dashboard (Priority: P1)

A user opens unihub and sees a unified dashboard that serves as the entry point to all connected life domains. The layout mirrors the ov-pro-tools dashboard pattern: a fixed left sidebar for domain navigation, a top header bar, and a main content area. From the sidebar, the user can navigate to the Finance domain (v1) and future domains as they are added.

**Why this priority**: The dashboard is the core interaction surface — without it, no domain is accessible. All other stories depend on this being in place.

**Independent Test**: Can be fully tested by launching the app, verifying the dashboard loads with a navigation menu listing all registered domains, and navigating to each domain's landing page.

**Acceptance Scenarios**:

1. **Given** a user opens the application, **When** the page loads, **Then** they see a dashboard shell with a sidebar listing all available life-domain sections.
2. **Given** a user clicks a domain section in the sidebar, **When** the navigation completes, **Then** they land on that domain's overview page without a full page reload.
3. **Given** a user is on any domain page, **When** they use the navigation, **Then** they can reach any other domain in one click.

---

### User Story 2 - Manage Finance Accounts (Priority: P1)

A user navigates to the Finance domain and manages their list of financial accounts (e.g., "Chase Checking", "Mortgage", "401k"). They can create, rename, and delete accounts, and assign each an account type (asset, liability, equity) and a currency (e.g., USD, EUR, TWD).

**Why this priority**: Accounts are the foundation of balance sheet snapshots. Without accounts defined, no balance sheet can be recorded.

**Independent Test**: Can be fully tested by creating several accounts of different types and verifying they appear in the account list with correct types.

**Acceptance Scenarios**:

1. **Given** a user opens the Finance domain, **When** they create a new account with a name, type, and currency, **Then** the account appears in the account list showing its currency.
2. **Given** an existing account, **When** the user edits the name or type and saves, **Then** the updated values persist.
3. **Given** an account with no balances recorded, **When** the user deletes it, **Then** it is removed from the list.
4. **Given** an account that has balances in one or more balance sheets, **When** the user attempts to delete it, **Then** the system warns that associated balance records will also be removed.

---

### User Story 2b - Record and View Balance Sheets (Priority: P1)

A user creates a balance sheet for a specific date (e.g., "May 2026"), then records a balance value for each of their accounts within that snapshot. They can view the balance sheet as a table showing all accounts and their balances. The summary section shows per-currency subtotals and a total converted to the user's selected base currency using the closest available exchange rate on or before the balance sheet date.

**Why this priority**: The balance sheet snapshot is the core value of the Finance domain in v1 — it gives the user a periodic net worth picture across all currencies.

**Independent Test**: Can be fully tested by creating accounts in two currencies, entering at least one exchange rate, creating a balance sheet, entering balances, and verifying both per-currency subtotals and the base-currency total are correctly computed.

**Acceptance Scenarios**:

1. **Given** a user has at least one account, **When** they create a new balance sheet with a date, **Then** the balance sheet appears in the balance sheet list.
2. **Given** an open balance sheet, **When** the user enters a balance value for an account, **Then** the value is saved and reflected in the sheet in that account's currency.
3. **Given** a balance sheet with balances in multiple currencies and exchange rates recorded, **When** the user views the balance sheet, **Then** they see: (a) each account's balance in its native currency, (b) per-currency net worth subtotals (assets minus liabilities per currency), and (c) a total net worth converted to the selected base currency using the closest prior exchange rate.
4. **Given** multiple balance sheets over time, **When** the user views the balance sheet list, **Then** sheets are ordered by date with the most recent first.

---

### User Story 2c - Manage Exchange Rates (Priority: P1)

A user records exchange rates between currency pairs at specific dates (e.g., "1 USD = 31.5 TWD on 2026-05-01"). The system uses these rates when computing base-currency totals on balance sheets — applying the closest rate on or before the balance sheet's date.

**Why this priority**: Without exchange rates, multi-currency balance sheet totals cannot be computed. This must be in place before balance sheet aggregation can be verified end-to-end.

**Independent Test**: Can be fully tested by recording two rates for the same currency pair on different dates, creating a balance sheet dated between them, and verifying the correct (closest prior) rate is used in the total computation.

**Acceptance Scenarios**:

1. **Given** the Finance domain, **When** a user records an exchange rate with a from-currency, to-currency, rate value, and date, **Then** the rate appears in the exchange rate list.
2. **Given** multiple rates for the same currency pair, **When** computing a balance sheet total, **Then** the system uses the rate with the most recent date that is on or before the balance sheet date.
3. **Given** a user edits or deletes an exchange rate, **When** they view an affected balance sheet, **Then** the base-currency total is recomputed using the updated rates.
4. **Given** a user selects a base currency for a balance sheet, **When** no exchange rate exists for a required currency pair on or before the balance sheet date, **Then** the system flags the missing rate and excludes that currency from the base-currency total, showing which currencies lack coverage.

---

### User Story 3 - Customize Attributes for a Domain (Priority: P2)

A user opens the attribute configuration panel for a domain and adds a custom attribute (e.g., adding a "Instrument" field to the Music domain). New entities in that domain display the custom attribute alongside built-in ones.

**Why this priority**: Customizable attributes are the key differentiator that makes the hub personal and extensible — but basic entity management (P1) must exist first.

**Independent Test**: Can be tested independently by adding a custom attribute to any domain and verifying it appears when creating/editing entities in that domain.

**Acceptance Scenarios**:

1. **Given** a user opens a domain's attribute settings, **When** they define a new attribute (name, type), **Then** the attribute is saved and appears in the entity form for that domain.
2. **Given** a custom attribute exists for a domain, **When** a user creates a new entity, **Then** the custom attribute field is visible and accepts input.
3. **Given** a custom attribute exists and has values, **When** the user removes the attribute definition, **Then** the system warns that existing values will be lost and asks for confirmation.
4. **Given** a domain with custom attributes, **When** the user views the entity table, **Then** custom attribute columns are visible and sortable.

---

### User Story 4 - Domain-Specific Visualization (Priority: P3)

Beyond the default table view, a domain may offer a domain-specific visualization (e.g., a chart for Music listening stats, a card view for People contacts). A user can toggle between the table view and the domain-specific view.

**Why this priority**: Core entity management must work first. Alternative visualizations enrich the experience but are not blockers for the hub to be useful.

**Independent Test**: Can be tested by enabling a secondary view for one domain (e.g., a card layout for People) and verifying the toggle between table and card view works.

**Acceptance Scenarios**:

1. **Given** a domain supports a secondary view, **When** a user selects that view, **Then** the same entity data is rendered in the domain-specific layout.
2. **Given** a user creates or edits an entity, **When** they switch views, **Then** the change is immediately reflected in both views.

---

### Edge Cases

- What happens when a domain has no entities yet? (Empty state with a prompt to create the first one.)
- When a user deletes a user-defined attribute definition that has existing values on entities: system displays a warning with the count of affected entities, user must confirm, then all associated values are permanently deleted along with the definition.
- What happens if a user tries to create an entity with a required attribute left blank?
- What happens when two browser tabs are open to the same domain and one makes a change?
- When a balance sheet needs a base-currency total but no exchange rate exists for a required currency pair on or before the balance sheet date: the system flags the missing pair and excludes it from the total, showing which currencies lack rate coverage.
- What happens when a user changes the currency on an Account that already has balance records? (The existing balance amounts remain as-is; they are reinterpreted as the new currency going forward.)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single-page application shell with a fixed left sidebar for domain navigation, a top header bar, and a main content area — following the ov-pro-tools dashboard layout pattern.
- **FR-002**: The v1 MVP MUST deliver the Finance domain as the sole fully-functional domain. Other domains (Visiting/Geography, Language Learning, People & Relationships, Music) are future scope and MUST be addable without changing Finance domain code.
- **FR-003**: Users MUST be able to create, read, update, and delete entities within any domain.
- **FR-004**: System MUST provide a shared infrastructure for tabular entity management reusable across all domains, including sorting, filtering, and pagination.
- **FR-005**: All domain attributes — whether system-defined (built-in) or user-defined (custom) — MUST be represented through a single shared `AttributeDefinition` model. System attributes are marked `is_system=True` and cannot be deleted or renamed by the user.
- **FR-006**: System MUST store attribute definitions and their per-entity values in a way that does not require schema migrations when users add or remove user-defined attributes.
- **FR-007**: System MUST render system attributes and user-defined attributes through the same UI components — no distinction is exposed to the user beyond the protected status of system attributes.
- **FR-008**: Each domain MUST be independently deployable and registerable — adding a new domain must not require changes to other domain code.
- **FR-009**: System MUST expose a machine-readable API contract (OpenAPI schema) so the frontend can consume typed API responses without hand-writing types.
- **FR-010**: System MUST support session-based authentication so that only the authenticated owner can access and modify their data.
- **FR-011**: Each domain MAY provide a domain-specific visualization in addition to the default table view.
- **FR-012**: Each Account in the Finance domain MUST have exactly one currency assigned at creation time (ISO 4217 code). Currency is required and cannot be blank; it MAY be changed after creation. Balance amounts for an account are denominated in that account's currency.
- **FR-013**: The Finance domain MUST provide a user-managed exchange rate database. Each rate entry records: from-currency (ISO 4217), to-currency (ISO 4217), rate value (positive decimal), and date. Entries are user-created, -edited, and -deleted.
- **FR-014**: When computing a base-currency total for a balance sheet, the system MUST apply the exchange rate with the most recent date that is on or before the balance sheet's date (closest-prior-rate rule). If no rate exists on or before that date for a required pair, the system MUST flag the gap and exclude that currency from the base-currency total — it MUST NOT silently use zero or an incorrect rate.
- **FR-015**: Every balance sheet MUST display: (a) each account's balance in its native currency, (b) per-currency net worth subtotals (sum of asset balances minus sum of liability balances, grouped by currency), and (c) a total net worth in a user-selected base currency, computed using the closest-prior-rate rule. The base currency selection MUST be persisted per balance sheet.
- **FR-016**: All numeric values in the Finance domain (balance amounts, exchange rates, computed totals) MUST be stored and processed as exact fixed-precision decimals — never as floating-point types. The API MUST transmit all Finance numeric values as JSON strings to preserve precision across the wire. The frontend MUST use a Decimal arithmetic library (not native JavaScript number arithmetic) for any Finance domain calculations.
- **FR-017**: All entity primary keys MUST be 12-character NanoID strings generated server-side using the alphanumeric alphabet `A-Za-z0-9` (no underscores, no dashes). This applies to all models in the `core` infrastructure app and all domain entity models. Auto-increment integer PKs are prohibited. The `object_id` field in `AttributeValue` (used for the generic foreign key) MUST be a `CharField(12)` to match entity string PKs.

### Key Entities

- **Domain**: A named life area (e.g., Finance, People) that groups related entity types. Has a slug, display name, and icon.
- **AttributeDefinition**: A schema entry scoped to an entity type within a domain — stores name, data type, display order, and `is_system` flag. System attributes ship with the domain and are protected from deletion/rename; user-defined attributes are created at runtime.
- **AttributeValue**: The per-entity value for an attribute. Linked to both the entity instance and its attribute definition. Applies equally to system and user-defined attributes.

**Finance domain entities (v1):**

- **Account**: A financial account owned by the user (e.g., "Chase Checking", "Mortgage"). System attributes: `name`, `account_type` (`asset` | `liability` | `equity`), `currency` (ISO 4217 code, e.g., `USD`, `EUR`, `TWD`). May have user-defined attributes.
- **BalanceSheet**: A dated financial snapshot (e.g., "May 2026"). Has a date and an optional label. System attributes: `date`, `label`.
- **Balance**: The recorded value of one Account within one BalanceSheet. Has a numeric balance amount denominated in the Account's currency. Linked to exactly one Account and one BalanceSheet. System attribute: `amount`.
- **ExchangeRate**: A user-recorded rate between two currencies at a point in time. Fields: `from_currency` (ISO 4217), `to_currency` (ISO 4217), `rate` (positive decimal), `date`. The (from_currency, to_currency, date) triple is unique. Used by the closest-prior-rate rule when computing base-currency totals on balance sheets.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can navigate from the dashboard to any domain section in under 2 seconds on a standard broadband connection.
- **SC-002**: A user can create a new entity in any domain (fill form, submit) in under 60 seconds on first use.
- **SC-003**: A user can add a custom attribute to a domain and use it on a new entity without leaving the application or consulting documentation.
- **SC-004**: All domain data tables support at least sorting by any column and filtering by text search, with results updating in under 1 second for datasets under 10,000 entities.
- **SC-007**: Balance sheet base-currency totals are computed correctly using the closest-prior exchange rate — verified by creating rates on multiple dates and confirming the correct rate is selected for each balance sheet date.
- **SC-005**: Adding a new life-domain section requires no changes to other domains' code — verified by adding a sixth domain without modifying any of the first five.
- **SC-006**: The OpenAPI schema is always in sync with the actual API — any change to the backend automatically regenerates the schema consumed by the frontend.

---

## Assumptions

- The application is a personal-use tool — a single authenticated user owns all data; multi-tenancy and sharing are out of scope for this initial version.
- Mobile layout is out of scope for v1; the dashboard targets desktop/tablet browser widths.
- v1 delivers Finance domain only. The shared entity/attribute infrastructure is designed to be domain-agnostic so subsequent domains (Visiting, Language, People, Music) can be added without modifying existing code.
- Custom attribute types for v1 are limited to: text (short), long text, number, date, boolean, and single-select (predefined options).
- File/image attachments on entities are out of scope for v1.
- Real-time collaborative editing is out of scope — last-write-wins on concurrent edits is acceptable.
- The backend runs as a single Django project with domain-specific Django apps; all domains share one database instance.
