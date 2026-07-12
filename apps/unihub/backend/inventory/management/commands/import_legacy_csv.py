"""Import a legacy `財產們` assets CSV into the Inventory domain.

Reuses the dry-run parser at
`specs/014-inventory-app/scripts/preview_legacy_import.py` (single source of
truth for grouping/classification/備註-parsing) and writes through
`AcquisitionSerializer` so all validation, per-currency accumulated, and unit
normalization apply. Currency stays a code string (Principle II — no finance FK).

Usage (from apps/unihub/backend/): CSV (v1) or Google-Sheets HTML export (v2):
    uv run python manage.py import_legacy_csv "data/財產們/2026.html"            # dry-run
    uv run python manage.py import_legacy_csv "data/財產們/2026.html" --commit    # write
"""

from __future__ import annotations

import importlib.util
import re
import sys
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from inventory.models import Acquisition
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


# unihub's canonical currency codes — the legacy sheet uses colloquial aliases.
CURRENCY_ALIASES = {"RMB": "CNY"}


def _norm_currency(code: str | None) -> str:
    code = (code or "")[:3]
    return CURRENCY_ALIASES.get(code, code)


_DATE_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")


def _iso(date_str: str | None) -> str | None:
    """Normalise the parser's date to a DRF datetime (00:00 UTC).

    Legacy sheets contain unpadded (2016-1-15) and junk date cells — pad what
    is recoverable, drop the rest to None rather than failing the whole import.
    """
    if not date_str:
        return None
    m = _DATE_RE.match(date_str.strip())
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}T00:00:00Z"


def _parameter_definitions() -> dict[str, str]:
    """Map the seeded system parameter names to their definition ids."""
    from django.contrib.contenttypes.models import ContentType

    from core.models import AttributeDefinition

    item_ct = ContentType.objects.get(app_label="inventory", model="item")
    return {
        d.name: d.id
        for d in AttributeDefinition.objects.filter(content_type=item_ct, is_system=True)
    }


def _item_payload(item) -> dict:
    f = item.fields
    definitions = _parameter_definitions()
    payload: dict = {"name": item.name.replace("\n", " ").strip()[:200]}
    parameters: list[dict] = []
    if "quantity" in f:
        payload["quantity"] = int(f["quantity"])
    if "size" in f:
        parameters.append({"definition_id": definitions["size"], "value": str(f["size"])[:100]})
    if "spec" in f:
        payload["spec"] = str(f["spec"])
    if "url" in f:
        payload["url"] = str(f["url"])[:500]
    if "color" in f:
        parameters.append({"definition_id": definitions["color"], "value": str(f["color"])[:50]})
    if f.get("sku_price") is not None:
        payload["sku_price"] = str(f["sku_price"])
        if f.get("sku_price_currency"):
            payload["sku_price_currency"] = _norm_currency(str(f["sku_price_currency"]))
    for measure in ("weight", "length", "width", "height", "volume"):
        if measure in f and isinstance(f[measure], dict):
            parameters.append(
                {
                    "definition_id": definitions[measure],
                    "value": str(f[measure]["value"]),
                    "unit": f[measure]["unit"],
                }
            )
    if "remark" in f:
        payload["remark"] = str(f["remark"])
    if parameters:
        payload["parameters"] = parameters
    return payload


def _factor_payloads(acq) -> tuple[list[dict], list[dict]]:
    """Return (accumulated_factors, manual_factors) from the parsed acquisition.

    The legacy actual-paid (header 實際支付價錢) is the accumulated value — an
    override of the item-price-derived default — so it is written on the update
    pass. 退稅/折價/運費 become manual factors.
    """
    accumulated, manual = [], []
    for cf in acq.cost_factors:
        if cf.value is None:
            # Blank legacy amount = unrecorded (FR-029a c): keep the derived
            # item-price accumulated instead of fabricating a 0 override.
            continue
        row = {
            "type": cf.type,
            "value": str(Decimal(str(cf.value))),
            "currency": _norm_currency(cf.currency),
        }
        (accumulated if cf.type == "accumulated" else manual).append(row)
    return accumulated, manual


class Command(BaseCommand):
    help = "Import a legacy 財產們 assets CSV into Inventory (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="Path to the CSV (absolute or repo-root-relative).")
        parser.add_argument(
            "--commit", action="store_true", help="Write to the DB (default: dry-run)."
        )
        parser.add_argument(
            "--wipe",
            action="store_true",
            help="Delete ALL existing acquisitions (and their items, via cascade) before importing.",
        )

    def handle(self, *args, **opts):
        raw = opts["csv_path"]
        csv_path = Path(raw)
        if not csv_path.is_absolute():
            csv_path = (REPO_ROOT / raw) if (REPO_ROOT / raw).exists() else Path.cwd() / raw
        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        parser = _load_parser()
        acquisitions = parser.build_any(str(csv_path))

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
                    cur = _norm_currency(cf.currency) or "?"
                    totals[cur] = totals.get(cur, Decimal("0")) + Decimal(str(cf.value))
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
            if opts["wipe"]:
                wiped = Acquisition.objects.count()
                Acquisition.objects.all().delete()
                self.stdout.write(self.style.WARNING(f"Wiped {wiped} existing acquisitions."))
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
                # Override the derived accumulated with the legacy actual-paid +
                # manual factors — only when the sheet actually recorded amounts.
                if acc or manual:
                    update_ser = AcquisitionSerializer(
                        instance, data={"cost_factors": acc + manual}, partial=True
                    )
                    update_ser.is_valid(raise_exception=True)
                    update_ser.save()
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f"Imported {created} acquisitions from {csv_path.name}.")
        )
