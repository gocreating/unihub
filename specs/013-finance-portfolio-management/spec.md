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

### Session 2026-07-20

- Q: How should users navigate from the Portfolios list to a portfolio's detail page? → A: The Name cell and the row's View action are real hyperlinks (router `<Link>` / `href`) to the detail page, per constitution v1.24.0 "Hyperlinked row identifiers & actions" — no onClick-only navigation.
- Q: Where do the portfolio Edit and Delete actions live? → A: Not in the Portfolios list rows. They move to the portfolio detail page, on the "Portfolio" panel header — Edit as a visible header button, Delete folded into the kebab (⋯) menu per the constitution's panel-header actions rule.
- Q: How does the portfolio detail page handle top-of-page navigation? → A: Via a constitution-compliant breadcrumb (Portfolios → current portfolio name); no page-level Back/Cancel control.
- Q: How is the portfolio's own information presented on the detail page? → A: Inside a panel (Card) titled "Portfolio" holding the portfolio's fields (name, base currency, state, first/last transaction time). Deleting from this panel (after the standard confirmation, and only when not blocked by FR-010) returns the user to the Portfolios list.

### Session 2026-08-13

- Q: Should the base (valuation) currency bind to Asset instead of Portfolio? → A: Neither new concept — the finance app already has a Currency model (with an `is_base_currency` flag). The base currency remains a per-portfolio, immutable choice that references an existing finance Currency record (legacy data requires per-portfolio: portfolios settle in both TWD and USD). Assets carry no currency binding.
- Q: How are legacy transfers whose asset is a settleable currency (TWD/USD) represented? → A: Port as-is: the migration is strictly additive — every legacy asset row (including TWD and USD) becomes a unihub Asset record and every transfer ports 1:1 with its asset reference and amounts. Existing unihub records are never modified or deleted; the Currency table is only consulted for the portfolios' base-currency codes (TWD/USD created there only if missing).
- Q: How is each migrated portfolio's active/closed state derived (legacy has no state column)? → A: From the name prefix — names starting with "[Active]" → state `active`, all others → `closed`; portfolio names are ported verbatim, keeping the "[Active] " prefix text in the name.
- Q: Where do legacy fields with no unihub home go — `chain_id`/`tx_hash` on 136 transactions, `remark` on 36 transfers (and `description` on 8 portfolios)? → A: Add optional fields: `Transaction.chain_id`, `Transaction.tx_hash`, `Transfer.remark`, `Portfolio.description` — lossless, structured, shown in the relevant forms/panels/expanded rows. Legacy transaction `remark` maps to the existing `description` field.
- Q: (Directive) Does Asset keep its `category` attribute? → A: No — `category` is removed from the Asset entity, its forms, columns, and API. Legacy asset `decimals` are likewise not stored; they are used only to convert raw integer minor-unit amounts to decimal values during migration (amount ÷ 10^decimals).

### Session 2026-08-15 (iteration 4)

- Q: How should users open an entity from a list now? → A: Per constitution v1.25.0, clicking anywhere on the row navigates to the detail page with full hyperlink semantics (Ctrl/Cmd/Shift+click and middle-click open a new tab), and the "View" action button is removed everywhere it exists. The name cell stays a real `<a>`. Applies system-wide, not just to portfolios: balance-sheets and inventory scenarios are corrected in the same iteration. *(Supersedes the Session 2026-07-20 answer that made the View action a hyperlink.)*
- Q: Where does the portfolio Close/Reopen action live? → A: Off the Portfolios list entirely, onto the detail page's "Portfolio" panel header as a **visible** button beside Edit (Delete stays in the kebab). Close/Reopen is frequent, reversible, and non-destructive, so it belongs among the visible actions. Consequence: the Portfolios list retains **no** row actions at all, so its Actions column is removed.
- Q: How is the portfolio's own data presented on the detail panel? → A: A single Ant Design responsive `Descriptions` block holding **every** field including Name (no separate large title — the breadcrumb already names the record); the column count collapses as the panel narrows.
- Q: How should the Transactions panel render transfers? → A: As real child rows in the **same table sharing the parent's columns** (the inventory catalog pattern): a dedicated caret column, `indentSize={0}`, `showExpandColumn: false` — not a nested table with its own headers. A collapsed transaction row **summarises** its transfers: the Asset column shows the transfer count and the Value Change column shows the net value change, so the row stays informative when collapsed.

### Session 2026-08-16 (iteration 5)

- Q: Should the settlement currency move to Asset and be dropped from Portfolio? *(asked twice; answered here properly)* → A: **Keep it on Portfolio.** The unit of a P&L figure belongs to the thing being measured, and Value Change measures the portfolio — so every value inside a portfolio shares one unit by construction and the net total stays addable. The legacy schema agrees: assets carried `is_settleable` (a *capability*), portfolios carried `settlement_asset_reference` (the *choice*). Evidence gathered before deciding: the real data has 2 currencies across 55 portfolios and **zero assets appearing in portfolios of both**, so nothing in the data forces a change; moving it to Asset would make a mixed-currency portfolio representable and silently sum mixed units. An optional Asset *quote* currency remains a sensible ADDITIVE change if mark-to-market pricing is built later — it answers a different question and is not a replacement.
- Q: How hard is the closed-portfolio lock? → A: **Freeze everything except Reopen.** While closed: no creating, editing, or deleting transactions, and no editing the portfolio's own fields. Reopen stays available; Delete stays available (removal is not an update) subject to FR-010. Enforced in the **backend**, with the UI disabling controls so correctness never depends on the client.
- Q: `Portfolio.description` should be multi-line → A: Yes — a text area, stored as an unbounded `TextField`, rendered clamped to two lines in tables per constitution v1.26.0.
- Q: The Portfolios list description column → A: Present but **hidden by default** (users reveal it via the Columns control). Its width bug is fixed by the constitution v1.26.0 sizing work, not by a local patch.
- Q: Transactions panel footer → A: Show both counts — "X transactions, Y transfers" — on the footer's information (left) side, keeping the constitution's footer layout rule.
- Q: Bar + waterfall visualisations on the portfolio detail page? → A: Build both, in a tabbed chart Card (Principle XI). They plot **Value Change only** — the sole comparable unit, since asset amounts (419 shares vs 0.000000067 ETH) cannot share an axis — and the position-only transfers (223 of 837) are excluded with that stated in the card. Data shape measured first: ≤5 assets per portfolio, ≤53 transactions but a median of 2, so charts must degrade gracefully to near-empty.

### Session 2026-08-16b (iteration 6)

- Q: Some Transactions-panel column headers are empty — bug? → A: **Yes, a real defect introduced in iteration 4.** Verified on the live page: the header row reads `["", "Time", "", "", "", "", "", "Actions"]` — 6 of 8 blank. When the merged parent/child column set was built, only `timestamp` received a title (via `makeSortProps`) and `actions` set one explicitly; `description`, `asset`, `asset_change`, `value_change` and `remark` were never given a `title`. Only the caret's blank header is intentional.
- Q: How should PnL report for an OPEN portfolio, given there is no price feed? → A: **Never call a cash-flow figure "unrealized PnL".** Closed portfolios show a single **Realized PnL**. Open portfolios show Invested / Returned / **Net invested** plus the positions still held, and state plainly that unrealized PnL requires market prices unihub does not track. Evidence that settled it: `[Active] 永豐 DCA TW.00918` nets −474,391 TWD, which is exactly 49 DCA purchases with **zero sales** — capital deployed, not a loss. *(An earlier −1,283,062 figure quoted in discussion was wrong twice over: it was partly illustrative and it summed TWD and USD together. Per-portfolio figures in one currency are the only valid ones.)*
- Q: Is the model compatible with a stock split (2× or 4×)? → A: **Yes, with no change.** A split is a position-only transfer: `+N` units with a blank Value Change — the identical shape to the 223 imported `UPDATE_POSITION` legs. Quantities are signed deltas, so holdings stay correct, and PnL is untouched because a split contributes no Value Change. The ratio goes in the transfer remark. No split entity, no form helper.
- Q: The Edit Portfolio modal's State and Base Currency fields → A: Remove both. State is owned by the Close/Reopen action (FR-020) and base currency is immutable (FR-004), so neither belongs in an edit form; base currency stays *displayed* read-only for context.

### Session 2026-08-16c (iteration 7) — breaking Transfer redesign

- Q: How should a cash leg be modelled, now that 新台幣/美元 must not be Assets? → A: **The Transfer model itself was wrong.** Redesigned: every transfer carries an **optional PnL change** plus **either a currency change or an asset (position) change** — never both, never neither. Cash and positions are now distinguished *structurally* rather than by the convention "value present, amount absent". `Transfer.value_change` is renamed **`pnl_change`** so the field matches the vocabulary used in the UI and charts. *(Supersedes the Session 2026-08-13 answer that ported legacy settleable assets as Asset rows — that reading was wrong; the user had flagged the currency/asset separation from the outset.)*
- Q: How does Position accumulate when 34 of 54 portfolios hold 2+ assets? → A: **Per asset.** PnL accumulates into one figure because it is all one currency; Position accumulates per asset — the transaction row lists each asset's running total and the Trend chart draws one grey series per asset.
- Q: `Transaction.remark` / `Transfer.remark`? → A: `Transaction.remark` never existed (the Remark seen in the modal was the per-transfer field). `Transfer.remark` is **removed**, and verified to lose nothing unique: 29 of its 36 values are 手續費 — now conveyed by the red cost/fee colour — and the other 7 are byte-identical to their transaction's own description.

## User Scenarios & Testing

### User Story 1 - Manage Assets (Priority: P1)

As a user, I want to create and manage asset records so that I have a catalog of all the assets I hold or plan to hold across my portfolios.

**Why this priority**: Assets are the foundational dependency — portfolios, transactions, and transfers all reference assets. Without assets, nothing else works.

**Independent Test**: Can be fully tested by creating, viewing, editing, and deleting asset records independently of any portfolio or transaction data.

**Acceptance Scenarios**:

1. **Given** the user is in the finance section, **When** they navigate to the Assets page, **Then** they see a paginated, sortable, filterable table of all their assets with a toolbar
2. **Given** the Assets page is open, **When** the user clicks "Create", fills in the asset name, and submits, **Then** the new asset appears in the list
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
3. **Given** a portfolio exists, **When** the user opens its detail page and edits its name via the "Portfolio" panel's Edit action, **Then** the change is saved and reflected on the panel and in the list
4. **Given** a portfolio exists, **When** the user attempts to edit the base currency field, **Then** the field is read-only and the system prevents any change
5. **Given** an active portfolio exists, **When** the user marks it as closed, **Then** its state changes to closed and this is reflected in the list
6. **Given** a closed portfolio exists, **When** the user reopens it, **Then** its state returns to active
7. **Given** a portfolio has no associated transactions, **When** the user deletes it from the detail page's "Portfolio" panel (kebab → Delete, then confirms), **Then** it is removed and the user is returned to the Portfolios list
8. **Given** a portfolio has associated transactions, **When** the user attempts to delete it, **Then** they receive an error explaining the dependency
9. **Given** a transaction is created or edited within a portfolio, **When** the save is confirmed, **Then** the portfolio's first_transaction_time and last_transaction_time automatically reflect the earliest and most recent transaction timestamps respectively
10. **Given** the Portfolios list, **When** the user clicks anywhere on a portfolio's row — including middle-click / Ctrl+Click — **Then** the portfolio detail page opens (in a new tab for the modifier clicks); the rows expose no View, Edit, Delete, or Close action, and the list has no Actions column at all
10a. **Given** the Portfolios list, **When** the user selects text in a cell or the row contains an interactive control, **Then** that interaction MUST NOT navigate away
13. **Given** the portfolio detail page's "Portfolio" panel, **When** the user views it, **Then** every field (Name, Base Currency, State, Description, First/Last Transaction) is presented in a responsive `Descriptions` block that reduces its column count as the panel narrows, and the header offers Close/Reopen and Edit as visible buttons with Delete in the kebab
14. **Given** an active portfolio's detail page, **When** the user clicks Close in the panel header, **Then** the portfolio becomes closed and the button becomes Reopen
11. **Given** the portfolio detail page, **When** the user views the top of the page, **Then** a breadcrumb reads Portfolios → current portfolio name, and clicking "Portfolios" returns to the list; no page-level Back/Cancel button exists
12. **Given** the portfolio detail page, **When** the user views the "Portfolio" panel, **Then** it shows the portfolio's fields (name, base currency, state, first/last transaction time) with Edit visible in the panel header and Delete inside the header kebab (⋯) menu

---

### User Story 3 - Record Transactions with Transfers (Priority: P3)

As a user, I want to record financial transactions — each composed of one or more transfers — so that I can track the exact asset flows for every financial event in my portfolio history.

**Why this priority**: Transactions and transfers represent the core financial activity. They depend on both assets and portfolios being set up first.

**Independent Test**: Can be fully tested by creating a transaction with multiple transfers (e.g., sell stock A, receive cash B) and verifying all transfers are recorded correctly.

**Acceptance Scenarios**:

1. **Given** assets and an active portfolio exist, **When** the user creates a transaction with a timestamp and at least one transfer, **Then** the transaction appears in the Transactions list
1a. **Given** a portfolio is closed, **When** the user attempts to create a transaction against it, **Then** the system blocks the action and prompts the user to reopen the portfolio first
2. **Given** a transaction is being created, **When** the user adds multiple transfers each referencing an asset and a signed amount, **Then** all transfers are saved as part of the transaction
3. **Given** a transaction exists in the Transactions table, **When** the user clicks its caret, **Then** its transfers appear as child rows in the SAME table using the SAME columns (no nested header row), each showing the asset, asset change amount, Value Change if provided, and remark
3a. **Given** a transaction with transfers is collapsed, **When** the user reads its row, **Then** the Asset column shows the transfer count and the Value Change column shows the net value change of its transfers
4. **Given** a transaction exists, **When** the user edits it, **Then** they can update the timestamp, description, and modify, add, or remove transfers
5. **Given** a transaction exists, **When** the user deletes it, **Then** all associated transfers are also removed

---

### User Story 4 - Migrate Legacy Finance Data (Priority: P4) *(un-deferred 2026-08-13)*

As a user, I want my legacy finance records — exported as four CSV files (`finance_asset.csv`, `finance_portfolio.csv`, `finance_transaction.csv`, `finance_transfer.csv`) — ported into the new portfolio entities so that I keep my full financial history.

**Why this priority**: Data continuity is essential. Without migration, the user starts with a blank slate and loses history. Depends on Stories 1–3 (accepted) and the model amendments in this iteration.

**Independent Test**: Run the import command against a database and verify record counts, spot-check converted amounts, re-run to prove idempotency.

**Acceptance Scenarios**:

1. **Given** the four legacy CSV files, **When** the operator runs the import command, **Then** 38 assets, 55 portfolios, 359 transactions, and 837 transfers exist as new unihub records, with each record's legacy reference preserved as its unihub ID
2. **Given** raw integer minor-unit amounts, **When** they are imported, **Then** each is divided by 10^decimals of its legacy asset (e.g. an 18-decimals token amount `1579130000000000000000` becomes `1579.13`, and a wei-level fee like `-67305900768` keeps its full 18-decimal precision `-0.000000067305900768`)
3. **Given** a legacy `UPDATE_POSITION` transfer, **When** it is imported, **Then** its Value Change is blank (pure position change); **Given** a `COST`/`EXPENSE`/`REVENUE` transfer, **Then** its Value Change equals the legacy settlement amount ÷ 10^decimals of the portfolio's settlement asset (flow type itself is not stored)
4. **Given** the portfolio named "[Active] 永豐 DCA TW.00918", **When** it is imported, **Then** its state is `active` and its name keeps the "[Active] " prefix verbatim; portfolios without the prefix arrive `closed`
5. **Given** the import has already run, **When** it is run again, **Then** no duplicate records are created and existing unihub records (including previously imported ones) are not modified
6. **Given** any pre-existing unihub data, **When** the import runs, **Then** those records are never modified or deleted (strictly additive); TWD/USD Currency records are created only if missing
7. **Given** the import has completed, **When** the user opens a migrated portfolio's detail page, **Then** its first/last transaction times reflect the earliest/latest imported transaction timestamps

---

### User Story 5 - Current Hub Policy Compliance & Transactions Panel Fix (Priority: P5)

As a user, I want the 013 pages brought up to the hub-wide policies that landed on main (entity views, quick search, shared confirm dialog), and the portfolio detail Transactions panel to actually load, so the new finance pages behave like every other entity table.

**Why this priority**: The Transactions panel currently returns a server error (500) — Story 3's acceptance is broken in the running app; and the new pages predate the 016/019 policies now mandatory across the hub.

**Independent Test**: Open a portfolio detail page and see transactions listed; verify Assets and Portfolios lists expose view tabs and quick search identical to the other entity list pages.

**Acceptance Scenarios**:

1. **Given** a portfolio with transactions, **When** the user opens its detail page, **Then** the Transactions panel lists them (no server error) — filtering the transactions API by portfolio returns results
2. **Given** the Assets or Portfolios list page, **When** the user views the toolbar row, **Then** entity view tabs and the quick-search input are present and behave exactly as on the other entity list pages (same shared components and URL grammar)
3. **Given** a quick-search query on Assets, Portfolios, or the Transactions panel, **When** it is typed, **Then** rows narrow server-side with match highlighting, scoped inside the active filter
4. **Given** any destructive action on the 013 pages (delete asset/portfolio/transaction), **When** the confirmation appears, **Then** it uses the hub's shared confirm dialog (no `Modal.confirm`)

---

### Edge Cases

- What happens when a user attempts to create a transaction with zero transfers?
- How does the system handle a transfer with a zero amount?
- What if the same asset appears in multiple transfers within a single transaction?
- What happens if the user tries to change a portfolio's base currency? → The base currency field is always read-only after creation; no change is possible.
- What if the import command encounters a reference to a missing asset/portfolio/transaction? → It aborts inside a database transaction with a clear message; nothing partial is written. (Verified 2026-08-13: the current CSVs have zero orphan references, zero transactions without transfers, and settlement amount 0 occurs exactly on `UPDATE_POSITION` rows.)
- What if the import is interrupted mid-run? → The command is transaction-wrapped; a failed run leaves the database unchanged and a re-run is safe.

## Requirements

### Functional Requirements

- **FR-001**: Users MUST be able to create, view, edit, and delete asset records
- **FR-002**: Each asset MUST have a name; the former `category` attribute is removed from the entity, its forms, list columns, and API *(amended 2026-08-13)*
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
- **FR-008c**: Transfer amount fields (asset change amount and Value Change) MUST store at least 18 decimal places without precision loss — legacy 18-decimals assets include wei-level values (e.g. −0.000000067305900768 ETH) that the current 8-decimal-place storage would corrupt
- **FR-008d**: Each transfer MAY carry an optional free-text remark, shown in the expanded transfer rows and editable in the transfer editor
- **FR-008e**: Each transaction MAY carry optional `chain_id` and `tx_hash` values, editable in the transaction form; each portfolio MAY carry an optional description, shown and editable on the "Portfolio" panel
- **FR-009**: Deleting an asset that is referenced by existing transfers MUST be prevented and the user MUST receive an explanatory message
- **FR-010**: Deleting a portfolio that has associated transactions MUST be prevented and the user MUST receive an explanatory message
- **FR-011**: All entity list views MUST include a toolbar, column filtering, sorting, and pagination consistent with existing finance app patterns
- **FR-012**: The system MUST provide a legacy-data import command that ports the four legacy CSV files into the new entities *(un-deferred and specified 2026-08-13)*:
  - **FR-012a**: It is an operator-run backend management command taking the CSV directory as an argument; it MUST parse the files as proper CSV (quoted fields with embedded commas occur in the data)
  - **FR-012b**: It is strictly additive and idempotent — legacy references are reused as unihub record IDs so re-runs create no duplicates and never modify existing records; pre-existing unihub data is never altered
  - **FR-012c**: Amounts MUST be converted from raw integer minor units to decimal values by dividing by 10^decimals of the referenced legacy asset; the legacy `decimals` and `is_settleable` attributes themselves are not stored
  - **FR-012d**: Value Change mapping: `UPDATE_POSITION` transfers → blank; `COST`/`EXPENSE`/`REVENUE` transfers → legacy settlement amount ÷ 10^decimals of the portfolio's settlement asset; the legacy flow type is not stored
  - **FR-012e**: Portfolio state derives from the "[Active]" name prefix (prefix present → `active`, else `closed`); names, descriptions, remarks, chain/tx metadata, and timestamps port verbatim (legacy `created_time`/`updated_time` preserved onto the records; `transacted_time` → transaction timestamp); portfolio first/last transaction times are recomputed after import
  - **FR-012f**: Portfolio base currency = the symbol of the legacy settlement asset (TWD/USD), validated against the finance Currency table; missing Currency rows are created (additive)
  - **FR-012g**: The command MUST print a per-entity import/skip count report and abort transaction-wrapped (no partial writes) on any unknown reference or malformed row
  - **FR-012h**: The legacy CSV files contain real personal financial data and MUST NOT be committed to version control; the command reads them from a path outside the repository history
- **FR-016**: Filtering the transactions list by portfolio MUST return results instead of a server error — the three 013 viewsets' filter declarations MUST follow the current core filter contract (`lookup` = ORM field path, as used by the other finance viewsets) *(bug fix; root cause diagnosed 2026-08-13)*
- **FR-017**: The 013 pages MUST adopt the hub-wide table policies that landed on main: entity view tabs (shared components, URL grammar, `viewConfigFromColumns` baseline) and quick search on the Assets and Portfolios list pages; quick search on the portfolio detail Transactions panel; backend `searchable_fields` opt-in on the Asset, Portfolio, and Transaction viewsets; all destructive confirmations via the shared confirm dialog (no `Modal.confirm` anywhere in the 013 pages)
- **FR-013**: In the Portfolios list, the Name cell MUST be a real hyperlink to the portfolio detail page and the row itself MUST navigate there per FR-018; the list rows MUST NOT contain Edit, Delete, or View actions *(amended 2026-08-15: the View action is removed — constitution v1.25.0 supersedes the v1.24.0 wording that made it a hyperlink)*
- **FR-014**: The portfolio detail page MUST navigate via a breadcrumb (Portfolios → current portfolio name) with no page-level Back/Cancel control, and MUST present the portfolio's fields inside a panel titled "Portfolio" whose header carries the entity actions per the constitution's panel-header rule: Close/Reopen and Edit as visible buttons, Delete folded into the kebab (⋯) menu
- **FR-015**: Deleting a portfolio from the detail page MUST use the standard delete confirmation, remain subject to FR-010 (blocked while transactions exist), and on success MUST return the user to the Portfolios list
- **FR-018**: Every entity table whose rows have a detail page MUST make the **whole row** navigate to it with full hyperlink semantics (constitution v1.25.0): plain click navigates in-SPA; Ctrl/Cmd/Shift+click and middle-click open a new tab; `cursor: pointer` signals it. Clicks originating in an interactive control (button, anchor, input, checkbox, expand caret) or made while text is selected MUST NOT navigate. The behaviour MUST come from ONE shared helper feeding `onRow`, not per-page handlers. No entity table may carry a "View" action button.
- **FR-019**: FR-018 MUST be applied to every violating table in the system in this iteration, not deferred: the Portfolios list, the Balance Sheets list (both currently carry a View button), and the Inventory Scenarios list (name links but the row does not). Tables whose rows have no detail page (Currencies, Accounts, Exchange Rates, Assets, and the Inventory Catalog, whose parent rows only expand) MUST NOT become row-clickable.
- **FR-020**: The portfolio Close/Reopen action MUST live on the detail page's "Portfolio" panel header as a visible button beside Edit, and MUST NOT appear in the Portfolios list. With View, Edit, Delete, and Close/Reopen all gone from the list rows, the Portfolios list MUST NOT render an Actions column at all.
- **FR-021**: The "Portfolio" panel MUST present its fields using Ant Design's responsive `Descriptions` component, containing every field (Name, Base Currency, State, Description, First/Last Transaction) with no separate page-level title, and MUST reduce its column count as the panel narrows so no value overflows.
- **FR-023**: Column width sizing MUST live inside `PageTable` (constitution v1.26.0): pages declare that a column is auto-sized (optionally with a bound) and MUST NOT loop their rows calling `measureTextWidth`. All eleven pages currently hand-rolling the `dataWidths` pattern MUST be converted; a page-level `measureTextWidth` call is a violation.
- **FR-024**: Table cells MUST clamp to at most two lines with an ellipsis and a truncation-gated tooltip carrying the full value, detected via `scrollHeight` vs `clientHeight`. This fixes the reproduced Portfolios description defect: a 280px cap with untruncated text produced 69px three-line rows whose content still overflowed to 356px.
- **FR-025**: `Portfolio.description` MUST accept multi-line text — an unbounded `TextField` edited through a text area — and render clamped per FR-024 wherever it appears in a table.
- **FR-026**: A **closed** portfolio MUST reject every mutation except reopening it: creating, editing, or deleting its transactions, and editing its own fields, MUST be blocked **by the backend** (not merely hidden in the UI), returning an explanatory error. Reopening MUST remain available, and deleting the portfolio remains permitted subject to FR-010. The UI MUST disable the corresponding controls so the block is visible before it is attempted.
- **FR-027**: The Portfolios list MUST include the description column but leave it **hidden by default**; users reveal it through the existing Columns control, and that choice participates in saved views like any other column.
- **FR-028**: The portfolio detail Transactions panel footer MUST report both counts — "X transactions, Y transfers" — on the footer's information (left) side, preserving the constitution's footer layout rule.
- **FR-037**: **Transfer is redesigned (breaking).** Each transfer MUST carry an optional `pnl_change` (the portfolio's base currency) plus **exactly one** of: a **currency change** (`currency` + `currency_amount`) or an **asset/position change** (`asset` + `asset_change_amount`). A transfer with both, or with neither, MUST be rejected — enforced by a database constraint as well as serializer validation. `value_change` is renamed `pnl_change`.
- **FR-038**: Currencies MUST NOT be creatable as Assets: creating or renaming an Asset whose name or symbol matches an existing Currency code or name MUST be rejected. The two legacy currency-Assets (新台幣, 美元) MUST be removed and their 301 transfers converted to currency legs (currency + currency_amount, asset cleared), preserving every `pnl_change`. The legacy importer MUST map `is_settleable` assets to currency legs instead of creating Asset rows, so a re-run cannot reintroduce them.
- **FR-039**: `Transfer.remark` MUST be removed, along with its table column and form field.
- **FR-040**: The portfolio detail page MUST present ONE panel with two tabs — **PnL** and **Trend** — replacing the separate value and chart panels.
- **FR-041**: Charts MUST use a fixed semantic palette: **red** for cost/fee, **green** for income, **grey** for position. Amounts MUST show the currency symbol where one is known, via the same `getCurrencySymbol` helper the Balance Sheets list uses.
- **FR-042**: The **PnL tab** MUST be a line chart in the style of the Balance Sheets equity curve, whose final point equals the portfolio's realized PnL (closed) or net PnL to date (open).
- **FR-043**: The **Trend tab** MUST plot one x-axis point per transaction with three y-values — cost, income and position. Negative values MUST extend **downward** (never absolute-valued), and a **"Waterfall" toggle** MUST switch between waterfall (cumulative) and plain-bar mode.
- **FR-044**: The Transactions table column order MUST be **Time, PnL, Position, Description**. A **transaction** row shows the ACCUMULATED balance in each of PnL and Position (e.g. `+ NT$ 666`, and per asset for Position); a **transfer** row shows only its own change (e.g. `+123 0050.TW`).
- **FR-045**: The New/Edit Transaction modal MUST comply with the constitution: its footer places the primary action right with all other actions grouped left (the current default AntD footer violates this), and it MUST be split into **General** and **Transfers** tabs. Transfer rows MUST be laid out as a **table** rather than a list so they cannot overflow the modal, and "Add transfer" MUST be a text/link-style button.
- **FR-030**: Every column in every table MUST render a non-empty header, EXCEPT a control column that is intentionally label-less (the expand caret). Fixes the reproduced defect: the Transactions panel rendered 6 of 8 headers blank.
- **FR-031**: The system MUST compute per-portfolio value aggregates **in the backend over ALL of a portfolio's transfers** — never in the frontend over the loaded page, which is paginated and would silently under-report (the largest portfolio has 49 transactions against a 25-row page). The Portfolio API MUST expose `value_invested` (sum of negative Value Changes), `value_returned` (sum of positive), and `net_value_change`, and MUST allow ordering by the net figure.
- **FR-032**: A **closed** portfolio MUST report a single **Realized PnL** figure (its net Value Change, which for a liquidated portfolio is exactly its profit or loss). An **open** portfolio MUST NOT display any figure labelled "PnL": it reports Invested, Returned, Net invested, and the positions it still holds, together with a statement that unrealized PnL requires market prices the system does not track.
- **FR-033**: The Portfolios list MUST carry a PnL column showing the portfolio's net value change, rendered with its own currency and distinguishing realized (closed) from net-invested (open) so a healthy DCA portfolio is never presented as a loss. Values from different base currencies MUST NEVER be summed into a total.
- **FR-034**: The portfolio detail page MUST show the positions still held — per asset, the net sum of asset change amounts, omitting assets whose net is zero — computed server-side across all transfers.
- **FR-035**: A stock split is recorded as an ordinary position-only transfer (`+N` units, blank Value Change) with the ratio in the remark; no dedicated split entity or form helper is added. Holdings (FR-034) MUST therefore reflect splits automatically, and PnL MUST be unaffected by them.
- **FR-036**: The Edit Portfolio modal MUST NOT offer State or Base Currency fields — state is owned by Close/Reopen (FR-020) and base currency is immutable (FR-004). Base currency remains visible read-only for context.
- **FR-029**: The portfolio detail page MUST offer a tabbed chart Card (Principle XI: AntD `Card` + `tabList`, ECharts, `renderer: 'svg'`) with (a) a **waterfall** of cumulative Value Change across the portfolio's transactions in chronological order, and (b) a **bar breakdown** of Value Change by asset. Both MUST plot Value Change only — never mixed asset amounts — MUST exclude transfers with no Value Change and disclose that exclusion, and MUST render a clean empty state for portfolios with no valued transfers.
- **FR-022**: The Transactions panel MUST render each transaction's transfers as **child rows in the same table, sharing the parent's columns**, following the inventory catalog pattern: a dedicated caret column toggling expansion, `indentSize={0}`, and `showExpandColumn: false` — NOT a nested table with its own header row. A collapsed transaction row MUST summarise its transfers: the Asset column shows the transfer count and the Value Change column shows the net value change of the transaction's transfers.

### Key Entities

- **Asset**: Represents any kind of financial asset (stock, cash, crypto, real estate, etc.). Key attributes: name (no category — removed 2026-08-13). Serves as the foundational reference for transfers.
- **Portfolio**: A named container for tracking asset positions. Key attributes: name, base currency (immutable, references an existing finance Currency record), optional description, state (active or closed, user-togglable), first_transaction_time (derived read-only field, set to the timestamp of the earliest transaction), last_transaction_time (derived read-only field, set to the timestamp of the most recent transaction). A user can have multiple portfolios.
- **Transaction**: An atomic financial event tied to a portfolio at a specific point in time. Key attributes: portfolio, timestamp, description, optional chain_id and tx_hash (blockchain metadata). Contains one or more transfers.
- **Transfer**: A single cash-flow entry within a transaction. Key attributes: asset reference, signed asset change amount (in the asset's native currency, ≥18 decimal places), optional Value Change amount in the portfolio's base currency (provided for cost/expense/income events; omitted for pure position changes), optional remark, parent transaction reference.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can create a new asset, portfolio, and transaction with transfers — and view all records — within 2 minutes of first use with no external instructions
- **SC-002**: The three entity list views (Assets, Portfolios, Transactions) display data with pagination, sorting, and filtering that matches the visual and interaction patterns of the existing finance app. The Transactions list additionally supports row expansion to reveal transfers as inline child rows within the same table.
- **SC-003**: 100% of the legacy records are imported — 38 assets, 55 portfolios, 359 transactions, 837 transfers, verified by count report and spot checks — with no data lost, duplicated, or corrupted, and a second run changing nothing
- **SC-006**: The portfolio detail Transactions panel loads real data without server errors, and the Assets/Portfolios pages pass the same view-tabs/quick-search behaviour checks as the other entity list pages
- **SC-004**: Referential integrity is enforced: attempting to delete a referenced asset or a portfolio with transactions results in a clear user-facing error message, not a crash or silent failure
- **SC-005**: All entity list views load within standard, perceptibly instant response times under normal data volumes
- **SC-007**: No entity table in the system renders a View action button, and every table whose rows have a detail page navigates on row click — verified by a repo-wide grep for the View action plus per-page tests asserting plain-click navigation AND that a Ctrl/middle click opens a new tab instead of navigating in place
- **SC-008**: Clicking a row's Delete button, or selecting text inside a cell, never navigates — asserted directly, because these are the regressions whole-row navigation classically introduces
- **SC-010**: No page under `src/pages/` calls `measureTextWidth` — verified by repo-wide grep — and every table still sizes its columns to its content, asserted by a PageTable-level test rather than eleven page-level ones
- **SC-011**: No table cell renders more than two lines: measured on the real Portfolios list, every description row is ≤2 lines with no content overflowing its cell, and the full text is reachable by tooltip (the pre-fix measurement was 69px/3 lines with 356px of content in a 280px cell)
- **SC-012**: A closed portfolio rejects every mutation attempt at the API — create/edit/delete transaction and edit portfolio all return an error — while reopen succeeds; asserted by backend tests, not only by disabled buttons
- **SC-018**: No Asset row exists whose name or symbol matches a Currency, and attempting to create one is rejected — verified against the real data after migration (assets 40 → 38)
- **SC-019**: Every transfer satisfies "exactly one of currency / asset", enforced at the database level; the 301 converted legacy cash legs retain their original `pnl_change` values, verified against a pre-migration snapshot
- **SC-020**: `Transfer.remark` no longer exists in the model, API, table, or form
- **SC-021**: The Trend chart renders negative bars extending downward (a negative series value, not its absolute value) and the Waterfall toggle changes the option's series shape
- **SC-022**: A transaction row's PnL cell shows an accumulated figure with a currency symbol; its transfer rows show only their own signed change
- **SC-014**: No table renders a blank column header except an intentionally label-less control column — asserted on the Transactions panel, whose header row currently reads 6 blanks out of 8
- **SC-015**: Portfolio value aggregates match a direct database sum over ALL transfers, verified against the real data: `[Active] 永豐 DCA TW.00918` reports invested −474,391 TWD / returned 0 / net −474,391 across 49 transactions, and is NOT described as a loss anywhere in the UI
- **SC-016**: A closed portfolio shows one Realized PnL figure; an open one shows no figure labelled PnL — asserted by tests on both states
- **SC-017**: Recording a 2:1 split as a position-only transfer doubles the reported holding for that asset and leaves the portfolio's PnL figures unchanged
- **SC-013**: The Transactions footer reports counts matching the data (e.g. the 49-transaction portfolio reads "49 transactions, N transfers")
- **SC-009**: The Transactions panel renders transfers as child rows of the same table: a transaction with N transfers contributes exactly N additional rows sharing the parent's columns, with no nested table header in the DOM

## Assumptions

- A user may own multiple portfolios (one-to-many relationship between user and portfolios)
- Transfer amounts are signed decimals — positive values represent asset inflows (acquired), negative values represent asset outflows (disposed)
- The legacy source is the four CSV exports under `migration/` (kept out of version control per FR-012h); the import is operator-run against the target database, not an automatic deployment step
- Cross-currency valuation and FX conversion are out of scope for this feature; the base currency field is informational
- All users with access to the finance section can manage their own assets, portfolios, transactions, and transfers; no additional role hierarchy is introduced in this feature
