# Feature Specification: Finance Portfolio Management

**Feature Branch**: `013-finance-portfolio-management`

**Created**: 2026-06-04

**Status**: Draft

## Clarifications

### Session 2026-06-04

- Q: Should User Story 4 (data migration) be in scope for the initial implementation? → A: Deferred — Story 4 will be addressed after the core implementation is accepted
- Q: What currency denomination applies to transfer amounts? → A: Asset change amount (in the asset's native currency) is always required. If the transfer type is PnL-relevant (e.g., buy, sell, dividend), a base-currency change amount is also required. For pure position changes (e.g., stock split, gift), providing a base-currency amount is forbidden.
- Q: Should transfers be viewable as a standalone paginated list or only within a transaction's detail? → A: No standalone Transfers page. Transfers are displayed as inline expandable rows directly within the Transactions table — clicking a transaction row expands it to reveal its transfers inline.
- Q: Are transfer types a fixed system-defined list or user-defined? → A: Fixed system-defined list — types are predefined and each is permanently classified as either PnL-relevant or pure position-change.
- Q: Can a portfolio's base currency be changed after creation? → A: Immutable — the base currency is fixed at creation time and can never be changed.

### Session 2026-06-08

- Q: Should a portfolio have a lifecycle state? → A: Yes — a portfolio has a state field indicating whether it is active or closed/ended; users can manually mark a portfolio as closed.
- Q: How should the Portfolios list be sorted by default, and what drives that ordering? → A: Default sort is `-last_transaction_time` (most recently active first). Portfolio's `last_transaction_time` is automatically updated to match the transaction time of the most recent transfer among all its transactions.
- Q: Once a portfolio is marked closed, can a user reopen it? → A: Yes — the state transition is reversible; a closed portfolio can be returned to active at any time.
- Q: Can new transactions be recorded against a closed portfolio? → A: No — creating a transaction against a closed portfolio is blocked; the user must reopen it to active first.
- Q: Does a transfer carry its own transaction time, or is it inherited from the parent transaction? → A: Inherited — no transaction time field on Transfer; `portfolio.last_transaction_time` is simply the timestamp of the portfolio's most recent transaction.
- Q: Should portfolio track both earliest and latest transaction timestamps, and what is the canonical field name? → A: Yes — portfolio tracks both `first_transaction_time` (earliest transaction) and `last_transaction_time` (most recent transaction); terminology standardised from "event" to "transaction" throughout.
- Q: Should transfer type be a field, and must the base-currency value change be required for PnL transfers? → A: Remove transfer type entirely. The Value Change field is optional on every transfer — users fill it for cost/expense/income events, leave it blank for pure position changes. *(Supersedes Session 2026-06-04 decisions on transfer type and base-currency amount requirements.)*
- Q: What should the Value Change field be labelled in the UI? → A: "Value Change (XXX)" where XXX is the portfolio's base currency symbol (e.g., "Value Change (USD)").

## User Scenarios & Testing

### User Story 1 - Manage Assets (Priority: P1)

As a user, I want to create and manage asset records so that I have a catalog of all the assets I hold or plan to hold across my portfolios.

**Why this priority**: Assets are the foundational dependency — portfolios, transactions, and transfers all reference assets. Without assets, nothing else works.

**Independent Test**: Can be fully tested by creating, viewing, editing, and deleting asset records independently of any portfolio or transaction data.

**Acceptance Scenarios**:

1. **Given** the user is in the finance section, **When** they navigate to the Assets page, **Then** they see a paginated, sortable, filterable table of all their assets with a toolbar
2. **Given** the Assets page is open, **When** the user clicks "Create", fills in the asset name and category, and submits, **Then** the new asset appears in the list
3. **Given** an asset exists, **When** the user edits and saves it, **Then** the updated details are reflected immediately in the table
4. **Given** an asset exists and is not referenced by any transfer, **When** the user deletes it, **Then** it is removed from the list
5. **Given** an asset is referenced by one or more transfers, **When** the user attempts to delete it, **Then** they receive a clear error message explaining why deletion is blocked

---

### User Story 2 - Manage Portfolios (Priority: P2)

As a user, I want to create and manage portfolios so that I can group related assets under a named container with a defined base currency for valuation.

**Why this priority**: Portfolios are the organizational backbone. Once assets exist, portfolios give users the means to structure and track their holdings.

**Independent Test**: Can be fully tested by creating a portfolio with a base currency and listing portfolios independently of any transaction data.

**Acceptance Scenarios**:

1. **Given** the user navigates to the Portfolios page, **When** they view the page, **Then** they see all their portfolios in a paginated table with a toolbar, sorted by most recently active first
2. **Given** the Portfolios page is open, **When** the user creates a portfolio and selects a base currency, **Then** the portfolio appears in the list with an active state
3. **Given** a portfolio exists, **When** the user edits its name, **Then** the change is saved and reflected in the list
4. **Given** a portfolio exists, **When** the user attempts to edit the base currency field, **Then** the field is read-only and the system prevents any change
5. **Given** an active portfolio exists, **When** the user marks it as closed, **Then** its state changes to closed and this is reflected in the list
6. **Given** a closed portfolio exists, **When** the user reopens it, **Then** its state returns to active
7. **Given** a portfolio has no associated transactions, **When** the user deletes it, **Then** it is removed from the list
8. **Given** a portfolio has associated transactions, **When** the user attempts to delete it, **Then** they receive an error explaining the dependency
9. **Given** a transaction is created or edited within a portfolio, **When** the save is confirmed, **Then** the portfolio's first_transaction_time and last_transaction_time automatically reflect the earliest and most recent transaction timestamps respectively

---

### User Story 3 - Record Transactions with Transfers (Priority: P3)

As a user, I want to record financial transactions — each composed of one or more transfers — so that I can track the exact asset flows for every financial event in my portfolio history.

**Why this priority**: Transactions and transfers represent the core financial activity. They depend on both assets and portfolios being set up first.

**Independent Test**: Can be fully tested by creating a transaction with multiple transfers (e.g., sell stock A, receive cash B) and verifying all transfers are recorded correctly.

**Acceptance Scenarios**:

1. **Given** assets and an active portfolio exist, **When** the user creates a transaction with a timestamp and at least one transfer, **Then** the transaction appears in the Transactions list
1a. **Given** a portfolio is closed, **When** the user attempts to create a transaction against it, **Then** the system blocks the action and prompts the user to reopen the portfolio first
2. **Given** a transaction is being created, **When** the user adds multiple transfers each referencing an asset and a signed amount, **Then** all transfers are saved as part of the transaction
3. **Given** a transaction exists in the Transactions table, **When** the user expands its row, **Then** the associated transfers appear as inline child rows directly within the table, each showing the asset, asset change amount, and Value Change amount if provided
4. **Given** a transaction exists, **When** the user edits it, **Then** they can update the timestamp, description, and modify, add, or remove transfers
5. **Given** a transaction exists, **When** the user deletes it, **Then** all associated transfers are also removed

---

### User Story 4 - Migrate Existing Finance Data *(Deferred — out of scope for initial implementation)*

> **Deferred**: This story will be addressed in a follow-up after the core CRUD implementation (Stories 1–3) is accepted.

As a user, I want my existing finance data migrated into the new portfolio structure so that I do not lose historical records when the new entities go live.

**Why this priority**: Data continuity is essential. Without migration, the user starts with a blank slate and loses history.

**Independent Test**: Can be verified by running the migration and confirming that previously existing records appear correctly in the new entity views without data loss or duplication.

**Acceptance Scenarios**:

1. **Given** existing finance data is present, **When** the migration is applied, **Then** all historical records appear correctly in the new portfolio, transaction, and transfer views
2. **Given** the migration has run, **When** the user views migrated data, **Then** no records are missing, duplicated, or corrupted
3. **Given** the migration has run, **When** the user performs new CRUD operations, **Then** migrated data and new data coexist without conflict

---

### Edge Cases

- What happens when a user attempts to create a transaction with zero transfers?
- How does the system handle a transfer with a zero amount?
- What if the same asset appears in multiple transfers within a single transaction?
- What happens if the user tries to change a portfolio's base currency? → The base currency field is always read-only after creation; no change is possible.

## Requirements

### Functional Requirements

- **FR-001**: Users MUST be able to create, view, edit, and delete asset records
- **FR-002**: Each asset MUST have at minimum a name and a user-defined category
- **FR-003**: Users MUST be able to create, view, edit, and delete portfolio records
- **FR-004**: Each portfolio MUST have a name and a designated base (settlement) currency chosen at creation time; the base currency is immutable and MUST NOT be editable after the portfolio is created
- **FR-004a**: Each portfolio MUST have a state, defaulting to active at creation; users MUST be able to toggle a portfolio's state between active and closed/ended at any time
- **FR-004d**: Creating a new transaction against a closed portfolio MUST be prevented; the user MUST receive a message indicating they must reopen the portfolio first
- **FR-004b**: Portfolio MUST track a `first_transaction_time` field that is automatically set to the timestamp of the earliest transaction within it, and a `last_transaction_time` field that is automatically updated to the timestamp of the most recent transaction; both fields are derived and read-only to users
- **FR-004c**: The Portfolios list view MUST default to sorting by `last_transaction_time` descending (most recently active portfolios first)
- **FR-005**: Users MUST be able to create, view, edit, and delete transaction records
- **FR-006**: Each transaction MUST be associated with a portfolio and MUST include a timestamp and at least one transfer
- **FR-007**: Users MUST be able to add multiple transfers to a single transaction
- **FR-008**: Each transfer MUST reference an asset and include a signed asset change amount in the asset's native currency (positive = inflow, negative = outflow)
- **FR-008a**: Each transfer MAY include an optional Value Change amount in the portfolio's base currency; when provided it represents the portfolio's gain or loss from this transfer (used for cost, expense, or income events); when omitted the transfer records a pure position change with no base-currency valuation impact
- **FR-008b**: The Value Change field MUST be labelled with the portfolio's base currency symbol, displayed as "Value Change (XXX)" where XXX is the symbol (e.g., "Value Change (USD)")
- **FR-009**: Deleting an asset that is referenced by existing transfers MUST be prevented and the user MUST receive an explanatory message
- **FR-010**: Deleting a portfolio that has associated transactions MUST be prevented and the user MUST receive an explanatory message
- **FR-011**: All entity list views MUST include a toolbar, column filtering, sorting, and pagination consistent with existing finance app patterns
- **FR-012**: *(Deferred)* The system MUST provide a one-time automated migration of existing finance data into the new entity structure — scheduled for a follow-up after initial implementation acceptance

### Key Entities

- **Asset**: Represents any kind of financial asset (stock, cash, crypto, real estate, etc.). Key attributes: name, category. Serves as the foundational reference for transfers.
- **Portfolio**: A named container for tracking asset positions. Key attributes: name, base currency (immutable), state (active or closed, user-togglable), first_transaction_time (derived read-only field, set to the timestamp of the earliest transaction), last_transaction_time (derived read-only field, set to the timestamp of the most recent transaction). A user can have multiple portfolios.
- **Transaction**: An atomic financial event tied to a portfolio at a specific point in time. Key attributes: portfolio, timestamp, description. Contains one or more transfers.
- **Transfer**: A single cash-flow entry within a transaction. Key attributes: asset reference, signed asset change amount (in the asset's native currency), optional Value Change amount in the portfolio's base currency (provided for cost/expense/income events; omitted for pure position changes), parent transaction reference.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can create a new asset, portfolio, and transaction with transfers — and view all records — within 2 minutes of first use with no external instructions
- **SC-002**: The three entity list views (Assets, Portfolios, Transactions) display data with pagination, sorting, and filtering that matches the visual and interaction patterns of the existing finance app. The Transactions list additionally supports row expansion to reveal transfers as inline child rows within the same table.
- **SC-003**: *(Deferred)* 100% of existing finance records are successfully migrated — verified by record count and spot checks — with no data lost, duplicated, or corrupted
- **SC-004**: Referential integrity is enforced: attempting to delete a referenced asset or a portfolio with transactions results in a clear user-facing error message, not a crash or silent failure
- **SC-005**: All entity list views load within standard, perceptibly instant response times under normal data volumes

## Assumptions

- A user may own multiple portfolios (one-to-many relationship between user and portfolios)
- Asset categories are free-form text entered by the user, not a fixed system-defined list
- Transfer amounts are signed decimals — positive values represent asset inflows (acquired), negative values represent asset outflows (disposed)
- The "existing system" refers to the current finance app's data within the same database; the migration is a one-time automated operation applied at deployment
- Cross-currency valuation and FX conversion are out of scope for this feature; the base currency field is informational
- The migration covers only financial records currently stored in the finance app; no external data sources are involved
- All users with access to the finance section can manage their own assets, portfolios, transactions, and transfers; no additional role hierarchy is introduced in this feature
