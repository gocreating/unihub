"""Import the legacy finance CSV export into the portfolio entities (FR-012).

Strictly additive and idempotent: legacy references are reused as primary
keys, a row whose key already exists is skipped (never updated), and existing
records — including Currency rows — are never modified. The whole run is
transaction-wrapped, so any unknown reference or malformed row aborts with
nothing written. The CSVs hold real personal financial data and live outside
version control (FR-012h); the directory is passed as an argument.
"""

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_datetime

from finance.models import (
    PORTFOLIO_STATE_ACTIVE,
    PORTFOLIO_STATE_CLOSED,
    Asset,
    Currency,
    Portfolio,
    Transaction,
    Transfer,
)

ACTIVE_PREFIX = "[Active]"
FILE_NAMES = ("asset", "portfolio", "transaction", "transfer")


class Command(BaseCommand):
    help = (
        "Import the four legacy finance_*.csv files (assets, portfolios, "
        "transactions, transfers). Additive + idempotent: re-runs skip "
        "existing records and never modify anything."
    )

    def add_arguments(self, parser):
        parser.add_argument("csv_dir", help="Directory containing the finance_*.csv files")

    def handle(self, *args, **options):
        csv_dir = Path(options["csv_dir"])
        rows = {}
        for name in FILE_NAMES:
            path = csv_dir / f"finance_{name}.csv"
            if not path.exists():
                raise CommandError(f"Missing CSV file: {path}")
            with path.open(newline="", encoding="utf-8") as f:
                rows[name] = list(csv.DictReader(f))

        # Legacy asset metadata: decimals drive amount conversion; symbol
        # provides the Currency code for settlement assets (FR-012c/f).
        legacy_assets = {r["reference"]: r for r in rows["asset"]}
        txn_portfolio = {r["reference"]: r["portfolio_reference"] for r in rows["transaction"]}
        portfolio_settlement = {
            r["reference"]: r["settlement_asset_reference"] for r in rows["portfolio"]
        }

        created = dict.fromkeys(["assets", "currencies", "portfolios", "transactions", "transfers"], 0)
        skipped = dict.fromkeys(created, 0)

        with transaction.atomic():
            self._import_assets(rows["asset"], created, skipped)
            self._ensure_currencies(rows["portfolio"], legacy_assets, created)
            self._import_portfolios(rows["portfolio"], legacy_assets, created, skipped)
            self._import_transactions(rows["transaction"], created, skipped)
            self._import_transfers(
                rows["transfer"], legacy_assets, txn_portfolio, portfolio_settlement, created, skipped
            )
            # Authoritative recompute after timestamp preservation — the
            # post_save signal ran mid-import, but only this final pass sees
            # every imported transaction (FR-012e).
            for portfolio in Portfolio.objects.filter(pk__in=portfolio_settlement.keys()):
                portfolio.refresh_transaction_times()

        for entity in created:
            self.stdout.write(f"{entity}: {created[entity]} created / {skipped[entity]} skipped")

    # ── entity passes ────────────────────────────────────────────────────

    def _import_assets(self, asset_rows, created, skipped):
        for r in asset_rows:
            # FR-038: a settleable legacy asset IS a currency. Creating an Asset
            # for it is what conflated the two concepts in the first place; its
            # transfers become currency legs instead (see _import_transfers).
            if r["is_settleable"].strip().lower() == "true":
                skipped["assets"] += 1
                continue
            if Asset.objects.filter(pk=r["reference"]).exists():
                skipped["assets"] += 1
                continue
            Asset.objects.create(id=r["reference"], name=r["name"])
            self._stamp(Asset, r)
            created["assets"] += 1

    def _ensure_currencies(self, portfolio_rows, legacy_assets, created):
        refs = {r["settlement_asset_reference"] for r in portfolio_rows}
        # Every settleable asset becomes a Currency (FR-038), whether or not a
        # portfolio settles in it — its transfers need the code to point at.
        refs |= {
            ref
            for ref, a in legacy_assets.items()
            if a["is_settleable"].strip().lower() == "true"
        }
        for ref in sorted(refs):
            legacy = legacy_assets.get(ref)
            if legacy is None:
                raise CommandError(f"Portfolio settlement asset not in asset CSV: {ref}")
            code = legacy["symbol"]
            # get_or_create only — existing Currency rows are never modified.
            _, was_created = Currency.objects.get_or_create(
                code=code, defaults={"name": legacy["name"], "symbol": code}
            )
            if was_created:
                created["currencies"] += 1

    def _import_portfolios(self, portfolio_rows, legacy_assets, created, skipped):
        for r in portfolio_rows:
            if Portfolio.objects.filter(pk=r["reference"]).exists():
                skipped["portfolios"] += 1
                continue
            settlement = legacy_assets[r["settlement_asset_reference"]]
            state = (
                PORTFOLIO_STATE_ACTIVE
                if r["name"].startswith(ACTIVE_PREFIX)
                else PORTFOLIO_STATE_CLOSED
            )
            Portfolio.objects.create(
                id=r["reference"],
                name=r["name"],  # verbatim, "[Active] " prefix kept (clarified 2026-08-13)
                base_currency=settlement["symbol"],
                description=r.get("description") or "",
                state=state,
            )
            self._stamp(Portfolio, r)
            created["portfolios"] += 1

    def _import_transactions(self, transaction_rows, created, skipped):
        for r in transaction_rows:
            if Transaction.objects.filter(pk=r["reference"]).exists():
                skipped["transactions"] += 1
                continue
            if not Portfolio.objects.filter(pk=r["portfolio_reference"]).exists():
                raise CommandError(
                    f"Transaction {r['reference']} references unknown portfolio "
                    f"{r['portfolio_reference']}"
                )
            Transaction.objects.create(
                id=r["reference"],
                portfolio_id=r["portfolio_reference"],
                timestamp=self._dt(r["transacted_time"], r["reference"]),
                description=r.get("remark") or "",
                chain_id=r.get("chain_id") or "",
                tx_hash=r.get("tx_hash") or "",
            )
            self._stamp(Transaction, r)
            created["transactions"] += 1

    def _import_transfers(
        self, transfer_rows, legacy_assets, txn_portfolio, portfolio_settlement, created, skipped
    ):
        for r in transfer_rows:
            if Transfer.objects.filter(pk=r["reference"]).exists():
                skipped["transfers"] += 1
                continue
            asset = legacy_assets.get(r["asset_reference"])
            if asset is None:
                raise CommandError(
                    f"Transfer {r['reference']} references unknown asset {r['asset_reference']}"
                )
            portfolio_ref = txn_portfolio.get(r["transaction_reference"])
            if portfolio_ref is None:
                raise CommandError(
                    f"Transfer {r['reference']} references unknown transaction "
                    f"{r['transaction_reference']}"
                )
            amount = self._convert(r["asset_amount_change"], asset["decimals"], r["reference"])
            if r["flow_type"] == "UPDATE_POSITION":
                pnl = None  # pure position change → no PnL impact (FR-012d)
            else:
                settlement = legacy_assets[portfolio_settlement[portfolio_ref]]
                pnl = self._convert(
                    r["settlement_asset_amount_change"], settlement["decimals"], r["reference"]
                )
            # FR-037: exactly one leg kind. A settleable legacy asset is cash.
            is_cash = asset["is_settleable"].strip().lower() == "true"
            Transfer.objects.create(
                id=r["reference"],
                transaction_id=r["transaction_reference"],
                currency_id=asset["symbol"] if is_cash else None,
                currency_amount=amount if is_cash else None,
                asset_id=None if is_cash else r["asset_reference"],
                asset_change_amount=None if is_cash else amount,
                pnl_change=pnl,
            )
            self._stamp(Transfer, r)
            created["transfers"] += 1

    # ── helpers ──────────────────────────────────────────────────────────

    def _stamp(self, model, row):
        """Preserve legacy created/updated times — QuerySet.update bypasses auto_now*."""
        model.objects.filter(pk=row["reference"]).update(
            created_at=self._dt(row["created_time"], row["reference"]),
            updated_at=self._dt(row["updated_time"], row["reference"]),
        )

    def _dt(self, raw, reference):
        parsed = parse_datetime(raw or "")
        if parsed is None:
            raise CommandError(f"Row {reference}: unparseable datetime {raw!r}")
        return parsed

    def _convert(self, raw, decimals, reference):
        """Minor-unit integer (or decimal) string → Decimal value (÷ 10^decimals)."""
        try:
            return Decimal(raw) / (Decimal(10) ** int(decimals))
        except (InvalidOperation, ValueError) as exc:
            raise CommandError(f"Row {reference}: bad amount {raw!r}: {exc}") from exc
