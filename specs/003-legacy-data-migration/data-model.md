# Data Model: Legacy Finance Data Migration

## Overview

The migration transforms 4 legacy tables into 5 output CSVs. All output headers
use the unihub import format (column names include `:type` annotations). Legacy
metadata columns (`OP`, `user_reference`, `created_time`, `updated_time`) are
always dropped from output.

---

## finance_currency.csv

**Source**: `finance_asset.csv` where `is_settleable = true`

| Output Column | Type | Source Column | Transformation |
|---|---|---|---|
| `code` | string | `symbol` | Direct copy (e.g., `TWD`, `USD`) |
| `name` | text | `name` | Direct copy (e.g., `新台幣`, `美元`) |
| `symbol` | text | `symbol` | Same as `code` (no display symbol in legacy) |

**Filter**: `is_settleable == "true"` — excludes securities and crypto assets.

**Expected output rows**: 2 (TWD, USD)

---

## finance_account.csv

**Source**: `finance_account.csv` (all rows)

**Lookup**: Asset reference map `{reference → code}` built from `finance_asset.csv`.

| Output Column | Type | Source Column | Transformation |
|---|---|---|---|
| `id` | string | `reference` | Direct copy (8-char NanoID) |
| `name` | text | `name` | Direct copy |
| `currency` | string | `settlement_asset_reference` | Resolve via asset map → currency code |
| `open_datetime` | datetime | `opened_time` | Direct copy (ISO 8601) |
| `close_datetime` | datetime | `closed_time` | Direct copy; empty string if absent |

**Expected output rows**: 36

---

## finance_balancesheet.csv

**Source**: `finance_balance_sheet.csv` (all rows)

| Output Column | Type | Source Column | Transformation |
|---|---|---|---|
| `id` | string | `reference` | Direct copy (8-char NanoID) |
| `date` | datetime | `balanced_time` | Direct copy (ISO 8601) |

**Expected output rows**: 25

---

## finance_balance.csv

**Source**: None — not available in legacy data.

| Output Column | Type | Notes |
|---|---|---|
| `id` | string | — |
| `account_id` | string | — |
| `balance_sheet_id` | string | — |
| `amount` | decimal | — |

**Output**: Header row only (0 data rows). The legacy system stores journal
entries per transaction, not per-account balance snapshots. Computing balances
from raw journal entries is out of scope.

---

## finance_exchangerate.csv

**Source**: `finance_price.csv` (all rows)

**Lookup**: Asset reference map `{reference → code}` built from `finance_asset.csv`.

| Output Column | Type | Source Column | Transformation |
|---|---|---|---|
| `id` | string | `reference` | Direct copy (8-char NanoID) |
| `base_currency` | string | `base_asset_reference` | Resolve via asset map → currency code |
| `quote_currency` | string | `quote_asset_reference` | Resolve via asset map → currency code |
| `rate` | decimal | `value` | Round to 6 decimal places (ROUND_HALF_UP) |
| `date` | datetime | `confirmed_time` | Direct copy (ISO 8601) |

**Expected output rows**: 35

---

## Excluded Legacy Tables

| Legacy File | Reason for Exclusion |
|---|---|
| `finance_asset.csv` (non-settleable rows) | Securities/crypto not implemented in unihub |
| `finance_portfolio.csv` | Portfolio feature not implemented in unihub |
| `finance_transaction.csv` | Transaction feature not implemented in unihub |
| `finance_transfer.csv` | Transfer feature not implemented in unihub |
| `finance_balance_entry.csv` | Same data as transfers; excluded for same reason |
| `integration_operator.csv` | Integration feature not implemented in unihub |

---

## Asset Reference Map (internal lookup table)

Built at runtime from `finance_asset.csv`. Used to resolve `*_reference` FK
fields in account and exchange rate outputs.

```
{
  "yRLSZ6Vt": "TWD",
  "VVrWhwsU": "USD",
  ...
}
```

Only settleable asset references appear as FK targets in the in-scope tables
(accounts reference TWD/USD; all prices are USD/TWD). Non-settleable asset
references in excluded tables do not need resolution.
