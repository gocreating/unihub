"""Import a legacy `財產們` assets CSV into the Inventory domain.

Reuses the dry-run parser at
`specs/014-inventory-app/scripts/preview_legacy_import.py` (single source of
truth for grouping/classification/備註-parsing) and writes through
`AcquisitionSerializer` so all validation, per-currency accumulated, and unit
normalization apply. Currency stays a code string (Principle II — no finance FK).

Usage (from apps/unihub/backend/):
    uv run python manage.py import_legacy_csv "data/財產們 - 2026.csv"            # dry-run
    uv run python manage.py import_legacy_csv "data/財產們 - 2026.csv" --commit    # write
"""

from __future__ import annotations

import importlib.util
import sys
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from inventory.serializers import AcquisitionSerializer

REPO_ROOT = Path(settings.BASE_DIR).resolve().parents[2]
PARSER_PATH = REPO_ROOT / "specs" / "014-inventory-app" / "scripts" / "preview_legacy_import.py"


def _load_parser():
    spec = importlib.util.spec_from_file_location("legacy_preview", PARSER_PATH)
    if spec is None or spec.loader is None:
        raise CommandError(f"Cannot load parser at {PARSER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # let @dataclass resolve the module during exec
    spec.loader.exec_module(module)
    return module


def _iso(date_str: str | None) -> str | None:
    """The parser yields YYYY-MM-DD; DRF wants a datetime — pin to 00:00 UTC."""
    return f"{date_str}T00:00:00Z" if date_str else None


def _item_payload(item) -> dict:
    f = item.fields
    payload: dict = {"name": item.name.replace("\n", " ").strip()[:200]}
    if "quantity" in f:
        payload["quantity"] = int(f["quantity"])
    if "size" in f:
        payload["size"] = str(f["size"])[:100]
    if "color" in f:
        payload["color"] = str(f["color"])[:50]
    if f.get("sku_price") is not None:
        payload["sku_price"] = str(f["sku_price"])
        if f.get("sku_price_currency"):
            payload["sku_price_currency"] = str(f["sku_price_currency"])[:3]
    for measure in ("weight", "length", "width", "height", "volume"):
        if measure in f and isinstance(f[measure], dict):
            payload[measure] = {"value": str(f[measure]["value"]), "unit": f[measure]["unit"]}
    if "remark" in f:
        payload["remark"] = str(f["remark"])
    return payload


def _factor_payloads(acq) -> tuple[list[dict], list[dict]]:
    """Return (accumulated_factors, manual_factors) from the parsed acquisition.

    The legacy actual-paid (header 實際支付價錢) is the accumulated value — an
    override of the item-price-derived default — so it is written on the update
    pass. 退稅/折價/運費 become manual factors.
    """
    accumulated, manual = [], []
    for cf in acq.cost_factors:
        value = Decimal(str(cf.value)) if cf.value is not None else Decimal("0")
        row = {"type": cf.type, "value": str(value), "currency": (cf.currency or "")[:3]}
        (accumulated if cf.type == "accumulated" else manual).append(row)
    if not accumulated:
        accumulated.append({"type": "accumulated", "value": "0", "currency": ""})
    return accumulated, manual


class Command(BaseCommand):
    help = "Import a legacy 財產們 assets CSV into Inventory (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="Path to the CSV (absolute or repo-root-relative).")
        parser.add_argument(
            "--commit", action="store_true", help="Write to the DB (default: dry-run)."
        )

    def handle(self, *args, **opts):
        raw = opts["csv_path"]
        csv_path = Path(raw)
        if not csv_path.is_absolute():
            csv_path = (REPO_ROOT / raw) if (REPO_ROOT / raw).exists() else Path.cwd() / raw
        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        parser = _load_parser()
        acquisitions = parser.build(str(csv_path))

        planned = [a for a in acquisitions if a.items]
        skipped = [a for a in acquisitions if not a.items]

        n_items = sum(len(a.items) for a in planned)
        n_factors = sum(len(a.cost_factors) for a in planned)
        self.stdout.write(
            f"Parsed {len(planned)} acquisitions, {n_items} items, {n_factors} cost factors "
            f"({len(skipped)} skipped: no items)."
        )

        # Per-currency checksum against the sheet's 總支出 footer.
        totals: dict[str, Decimal] = {}
        for a in planned:
            for cf in a.cost_factors:
                if cf.value is not None:
                    totals[cf.currency or "?"] = totals.get(
                        cf.currency or "?", Decimal("0")
                    ) + Decimal(str(cf.value))
        self.stdout.write(
            "Per-currency net (should match 總支出): "
            + ", ".join(f"{v} {k}" for k, v in sorted(totals.items()))
        )

        if not opts["commit"]:
            self.stdout.write(
                self.style.WARNING("DRY-RUN — no data written. Re-run with --commit.")
            )
            for a in planned[:5]:
                self.stdout.write(f"  · {a.source or '(no source)'}: {len(a.items)} item(s)")
            return

        created = 0
        with transaction.atomic():
            for a in planned:
                items = [_item_payload(it) for it in a.items]
                acc, manual = _factor_payloads(a)
                create_ser = AcquisitionSerializer(
                    data={
                        "source": (a.source or "")[:200],
                        "request_time": _iso(a.request_time),
                        "obtained_at": _iso(a.obtained_at),
                        "items": items,
                    }
                )
                create_ser.is_valid(raise_exception=True)
                instance = create_ser.save()
                # Override the derived accumulated with the legacy actual-paid + manual factors.
                update_ser = AcquisitionSerializer(
                    instance, data={"cost_factors": acc + manual}, partial=True
                )
                update_ser.is_valid(raise_exception=True)
                update_ser.save()
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f"Imported {created} acquisitions from {csv_path.name}.")
        )
