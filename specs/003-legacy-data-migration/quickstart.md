# Quickstart: Legacy Finance Data Migration

## Prerequisites

- Python 3.x (stdlib only, no packages needed)
- Access to the `data_migration/` directory at the repo root

## Running the Script

From the repo root:

```bash
python3 data_migration/migrate.py
```

## Expected Output

The script writes to `data_migration/unihub-ready/` (created or overwritten on
each run):

```
data_migration/unihub-ready/
├── finance_currency.csv      # 2 rows (TWD, USD)
├── finance_account.csv       # 36 rows
├── finance_balancesheet.csv  # 25 rows
├── finance_balance.csv       # 0 rows (header only)
└── finance_exchangerate.csv  # 35 rows
```

## Importing into unihub

1. Open the unihub app and navigate to **System → Import / Export**.
2. Start a new Import.
3. In Step 1 (Select Files), select all files from `data_migration/unihub-ready/`.
4. Proceed through the import wizard. All rows for the in-scope tables should
   import with zero errors.

## Verification

After import, check the unihub Finance app:
- **Currencies**: TWD and USD appear in the currency list.
- **Accounts**: 36 accounts visible with correct names and currencies.
- **Balance Sheets**: 25 monthly snapshots visible.
- **Exchange Rates**: 35 USD/TWD historical rates visible.
- **Balances**: No balance data (expected — leave blank or enter manually).

## Re-running

The script is idempotent. Re-running overwrites `data_migration/unihub-ready/`
with the same result. No side effects on the legacy source files.
