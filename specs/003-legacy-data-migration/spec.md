# Feature Specification: Legacy Finance Data Migration

**Feature Branch**: `003-legacy-data-migration`

**Created**: 2026-05-21

**Status**: Draft

**Input**: Migrate legacy finance data into unihub's finance app format for GitHub issue #1.

## Clarifications

### Session 2026-05-21

- Q: Are user stories ordered to respect import dependencies? → A: Yes — currencies (P1) must be imported before accounts and exchange rates (P2) because both hold a foreign key to currency.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import currencies (Priority: P1)

The user imports the migrated `finance_currency.csv` and sees TWD and USD available as currencies in unihub.

**Why this priority**: Currencies are foundational — both accounts and exchange rates reference them as foreign keys. They must be importable first and independently before any dependent data can be loaded.

**Independent Test**: Can be fully tested by importing only `finance_currency.csv` and verifying TWD and USD appear in the unihub currency list.

**Acceptance Scenarios**:

1. **Given** a migrated `finance_currency.csv`, **When** imported into unihub, **Then** TWD and USD appear as currencies with correct names and codes.
2. **Given** the legacy `finance_asset` records where `is_settleable = false` (securities), **When** the migration is run, **Then** those assets do NOT appear in `finance_currency.csv`.

---

### User Story 2 — Import accounts, balance sheets, and exchange rates (Priority: P2)

The user imports the remaining migrated files and sees all finance accounts, balance sheet snapshots, and historical USD/TWD exchange rates in unihub.

**Why this priority**: Accounts depend on currencies (P1 must complete first). Balance sheets are independent but make sense to import alongside accounts. Exchange rates also depend on currencies and complete the historical record.

**Independent Test**: Can be fully tested by importing `finance_account.csv`, `finance_balancesheet.csv`, and `finance_exchangerate.csv` after P1, and verifying the records appear in the unihub finance UI.

**Acceptance Scenarios**:

1. **Given** a migrated `finance_account.csv`, **When** imported into unihub, **Then** all accounts appear with correct names, currencies, and open/close dates.
2. **Given** an account whose legacy `settlement_asset_reference` points to TWD, **When** imported, **Then** the account's currency field shows TWD (resolved from currency code, not legacy NanoID).
3. **Given** a migrated `finance_balancesheet.csv`, **When** imported into unihub, **Then** all 25 balance sheet snapshots appear with their correct dates.
4. **Given** a migrated `finance_exchangerate.csv` with 35 records, **When** imported, **Then** all USD/TWD exchange rates appear with correct dates and rates rounded to appropriate decimal precision.
5. **Given** a legacy price record with a float value like `32.32279968261719`, **When** migrated, **Then** the rate is stored as a decimal value with no floating-point artifacts.

---

### Edge Cases

- What happens when a legacy account's `settlement_asset_reference` points to a non-settleable asset (security)? — Such accounts are excluded from migration since the currency field in the new system only accepts currencies, not securities.
- What happens to legacy data with no unihub equivalent (portfolios, transactions, transfers, securities, integration operators)? — These are silently excluded from the output directory.
- How are integer legacy amounts with a `decimals` field handled? — The `decimals` field is used only to note that `finance_balance.csv` is out of scope (see Assumptions); no amount conversion is required for the in-scope tables.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The migrated output MUST be a directory of CSV files structured to match unihub's import format exactly (column names, types, and ordering as specified in the unihub export template).
- **FR-002**: `finance_currency.csv` MUST contain one row per legacy `finance_asset` record where `is_settleable = true`.
- **FR-003**: Each currency row MUST map: legacy `symbol` → `code`, legacy `name` → `name`, and use the legacy `symbol` value also as `symbol` (e.g., TWD, USD).
- **FR-004**: `finance_account.csv` MUST contain one row per legacy account, mapping: legacy `reference` → `id`, `name` → `name`, resolved currency code (via `settlement_asset_reference` → currency `code`) → `currency`, `opened_time` → `open_datetime`, `closed_time` → `close_datetime`.
- **FR-005**: `finance_balancesheet.csv` MUST contain one row per legacy `finance_balance_sheet` record, mapping: `reference` → `id`, `balanced_time` → `date`.
- **FR-006**: `finance_exchangerate.csv` MUST contain one row per legacy `finance_price` record, mapping: `reference` → `id`, resolved base currency code → `base_currency`, resolved quote currency code → `quote_currency`, `value` (rounded to 6 decimal places) → `rate`, `confirmed_time` → `date`.
- **FR-007**: `finance_balance.csv` MUST be included in the output as an empty file with only the header row (see Assumptions — balance snapshot data is not available in the legacy export).
- **FR-008**: All legacy tables with no unihub equivalent MUST be excluded from the output: `finance_asset` (non-settleable), `finance_portfolio`, `finance_transaction`, `finance_transfer`, `finance_balance_entry`, and `integration_operator`.
- **FR-009**: The output MUST NOT include legacy metadata fields (`OP`, `user_reference`, `created_time`, `updated_time`) that are not part of the unihub import format.
- **FR-010**: All FK relationships MUST be resolved by value substitution (e.g., `settlement_asset_reference` NanoID → currency `code` string) so that the output files are self-consistent without relying on the legacy ID space.

### Key Entities

- **Currency** (`finance_currency.csv`): A fiat or crypto currency accepted as a settlement unit. Identified by its code (e.g., TWD, USD). Source: legacy `finance_asset` where `is_settleable = true`.
- **Account** (`finance_account.csv`): A financial account (brokerage, savings, etc.) denominated in a single currency. Source: legacy `finance_account`.
- **Balance Sheet** (`finance_balancesheet.csv`): A point-in-time snapshot record. Source: legacy `finance_balance_sheet`.
- **Balance** (`finance_balance.csv`): The amount held in a specific account on a specific balance sheet date. Source: not available in legacy — output as empty header-only file.
- **Exchange Rate** (`finance_exchangerate.csv`): A historical exchange rate between two currencies at a given date. Source: legacy `finance_price`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 5 output CSV files are present in the output directory (`finance_currency.csv`, `finance_account.csv`, `finance_balancesheet.csv`, `finance_balance.csv`, `finance_exchangerate.csv`).
- **SC-002**: Importing the output directory into unihub's Import flow completes with zero errors and zero skipped rows for the in-scope tables.
- **SC-003**: The number of rows in each output file matches expectations derived from the legacy source: 2 currencies, 36 accounts, 25 balance sheets, 0 balances (header only), 35 exchange rates.
- **SC-004**: All exchange rate values in the output differ from their legacy float source values by no more than 0.000001 (six decimal places of precision).
- **SC-005**: No legacy-system NanoID reference appears in any FK field of the output — all cross-table references are resolved to their value equivalents (currency codes, etc.).

## Assumptions

- The `symbol` field in the new system's `finance_currency.csv` is treated as the ISO currency code (e.g., TWD, USD), matching the legacy asset's `symbol` field. No separate display symbol (NT$, $) is included, as the legacy data does not store one.
- `finance_balance.csv` is out of scope for migration. The legacy system stores journal entries (transfers) per transaction, not per-account balance snapshots per balance sheet. Computing snapshot balances from raw journal entries is a separate, complex analytical task beyond this migration.
- Only legacy assets marked `is_settleable = true` are migrated as currencies. Non-settleable assets (equities, crypto derivatives, stablecoins) are excluded because unihub's finance app does not yet implement a securities or crypto asset domain.
- All legacy accounts reference only settleable assets (TWD, USD) as their settlement currency. No accounts reference non-settleable assets.
- The legacy `finance_balance_entry.csv` and `finance_transfer.csv` contain the same records under different names. Both are excluded from migration as unihub's transaction/transfer feature is not yet implemented.
- ID format: the new system's `id:string` field accepts the legacy's 8-character NanoID references directly. No ID regeneration or padding is required.
- The output files use the unihub export template column names and ordering as ground truth for the import format.
