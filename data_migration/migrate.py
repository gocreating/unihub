"""Legacy finance data migration: converts legacy CSVs to unihub import format."""

import csv
import hashlib
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LEGACY_DIR = SCRIPT_DIR / "2026_05_17_legacy"
OUTPUT_DIR = SCRIPT_DIR / "unihub-ready"

# unihub primary keys: 12-char alphanumeric only (A-Za-z0-9, no - or _)
_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def derive_id(ref: str) -> str:
    """Derive a stable 12-char alphanumeric ID from a legacy reference via SHA-256."""
    num = int(hashlib.sha256(ref.encode()).hexdigest(), 16)
    chars: list[str] = []
    for _ in range(12):
        num, rem = divmod(num, 62)
        chars.append(_BASE62[rem])
    return "".join(chars)


def build_asset_maps() -> tuple[dict[str, str], dict[str, int]]:
    """Build symbol map {reference: symbol} and decimals map {reference: decimals}."""
    symbol_map: dict[str, str] = {}
    decimals_map: dict[str, int] = {}
    with open(LEGACY_DIR / "finance_asset.csv", newline="") as f:
        for row in csv.DictReader(f):
            symbol_map[row["reference"]] = row["symbol"]
            decimals_map[row["reference"]] = int(row["decimals"])
    return symbol_map, decimals_map


def build_account_decimals_map(asset_decimals: dict[str, int]) -> dict[str, int]:
    """Build {account_reference: decimals} for integer-to-decimal amount conversion."""
    account_dec: dict[str, int] = {}
    with open(LEGACY_DIR / "finance_account.csv", newline="") as f:
        for row in csv.DictReader(f):
            asset_ref = row["settlement_asset_reference"]
            if asset_ref not in asset_decimals:
                sys.exit(f"ERROR: settlement_asset_reference {asset_ref!r} not in asset decimals map")
            account_dec[row["reference"]] = asset_decimals[asset_ref]
    return account_dec


def write_currencies(symbol_map: dict[str, str]) -> None:
    """Write finance_currency.csv from settleable assets only."""
    with (
        open(LEGACY_DIR / "finance_asset.csv", newline="") as src,
        open(OUTPUT_DIR / "finance_currency.csv", "w", newline="") as dst,
    ):
        writer = csv.writer(dst)
        writer.writerow(["code:string", "name:text", "symbol:text"])
        for row in csv.DictReader(src):
            if row["is_settleable"] == "true":
                writer.writerow([row["symbol"], row["name"], row["symbol"]])


def write_accounts(symbol_map: dict[str, str]) -> None:
    """Write finance_account.csv with currency codes resolved from asset references."""
    with (
        open(LEGACY_DIR / "finance_account.csv", newline="") as src,
        open(OUTPUT_DIR / "finance_account.csv", "w", newline="") as dst,
    ):
        writer = csv.writer(dst)
        writer.writerow([
            "id:string",
            "name:text",
            "currency:string",
            "open_datetime:datetime",
            "close_datetime:datetime",
        ])
        for row in csv.DictReader(src):
            ref = row["settlement_asset_reference"]
            if ref not in symbol_map:
                sys.exit(f"ERROR: settlement_asset_reference {ref!r} not in symbol map")
            writer.writerow([
                derive_id(row["reference"]),
                row["name"],
                symbol_map[ref],
                row["opened_time"],
                row["closed_time"],
            ])


def write_balance_sheets() -> None:
    """Write finance_balancesheet.csv from legacy finance_balance_sheet.csv."""
    with (
        open(LEGACY_DIR / "finance_balance_sheet.csv", newline="") as src,
        open(OUTPUT_DIR / "finance_balancesheet.csv", "w", newline="") as dst,
    ):
        writer = csv.writer(dst)
        writer.writerow(["id:string", "date:datetime"])
        for row in csv.DictReader(src):
            writer.writerow([derive_id(row["reference"]), row["balanced_time"]])


def write_balances(account_decimals: dict[str, int]) -> None:
    """Write finance_balance.csv from finance_balance_entry.csv.

    Converts legacy integer amounts to decimal using each account's settlement
    asset decimal count (e.g. TWD decimals=0 → no change, USD decimals=2 → ÷100).
    """
    with (
        open(LEGACY_DIR / "finance_balance_entry.csv", newline="") as src,
        open(OUTPUT_DIR / "finance_balance.csv", "w", newline="") as dst,
    ):
        writer = csv.writer(dst)
        writer.writerow([
            "id:string",
            "account_id:string",
            "balance_sheet_id:string",
            "amount:decimal",
        ])
        for row in csv.DictReader(src):
            acct_ref = row["account_reference"]
            if acct_ref not in account_decimals:
                sys.exit(f"ERROR: account_reference {acct_ref!r} not in account decimals map")
            decimals = account_decimals[acct_ref]
            amount = Decimal(row["amount"]) / Decimal(10) ** decimals
            writer.writerow([
                derive_id(row["reference"]),
                derive_id(acct_ref),
                derive_id(row["balance_sheet_reference"]),
                amount,
            ])


def write_exchange_rates(symbol_map: dict[str, str]) -> None:
    """Write finance_exchangerate.csv with currency codes and 6-decimal rates."""
    with (
        open(LEGACY_DIR / "finance_price.csv", newline="") as src,
        open(OUTPUT_DIR / "finance_exchangerate.csv", "w", newline="") as dst,
    ):
        writer = csv.writer(dst)
        writer.writerow([
            "id:string",
            "base_currency:string",
            "quote_currency:string",
            "rate:decimal",
            "date:datetime",
        ])
        for row in csv.DictReader(src):
            base_ref = row["base_asset_reference"]
            quote_ref = row["quote_asset_reference"]
            if base_ref not in symbol_map:
                sys.exit(f"ERROR: base_asset_reference {base_ref!r} not in symbol map")
            if quote_ref not in symbol_map:
                sys.exit(f"ERROR: quote_asset_reference {quote_ref!r} not in symbol map")
            rate = Decimal(row["value"]).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            writer.writerow([
                derive_id(row["reference"]),
                symbol_map[base_ref],
                symbol_map[quote_ref],
                rate,
                row["confirmed_time"],
            ])


def main() -> None:
    """Run all migration steps and write output CSVs to OUTPUT_DIR."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    symbol_map, decimals_map = build_asset_maps()
    account_decimals = build_account_decimals_map(decimals_map)
    write_currencies(symbol_map)
    write_accounts(symbol_map)
    write_balance_sheets()
    write_balances(account_decimals)
    write_exchange_rates(symbol_map)
    print(f"Migration complete. Output written to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
