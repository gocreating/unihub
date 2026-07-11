#!/usr/bin/env python3
"""Dry-run previewer for the legacy assets spreadsheet → Inventory model.

Reads `財產們 - 2026.csv`, reconstructs Acquisitions/Items/CostFactors per
`migration-import.md`, and prints a human-readable grouping plus a JSON plan and
a flagged-rows report. **No database writes.** Pure stdlib.

Usage:
    python3 preview_legacy_import.py "path/to/財產們 - 2026.csv" [--json]
"""

from __future__ import annotations

import csv
import json
import re
import sys
from dataclasses import dataclass, field, asdict

# ── Classification keywords (M2) ─────────────────────────────────────────
COST_FACTOR_KEYWORDS = {
    "tax_refund": ["退稅", "退税", "退款"],
    "discount": ["折價", "折扣", "優惠", "折价"],
    "shipping": ["運費", "运费", "運送", "freight", "shipping"],
}

CURRENCY_TOKENS = {
    "RMB": "RMB", "USD": "USD", "TWD": "TWD",
    "yen": "JPY", "円": "JPY", "¥": "JPY", "￥": "JPY",
}


def classify_cost_factor(name: str) -> str | None:
    for ftype, words in COST_FACTOR_KEYWORDS.items():
        if any(w in name for w in words):
            return ftype
    return None


def norm_num(s: str) -> float | None:
    s = s.strip().replace(",", "").replace("，", "").replace("−", "-")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_currency(text: str) -> str | None:
    for tok, code in CURRENCY_TOKENS.items():
        if tok in text:
            return code
    return None


def parse_date(cell: str) -> tuple[str | None, str | None, list[str]]:
    """Return (request_time, obtained_at, flags). Dates normalised to YYYY-MM-DD."""
    cell = cell.strip()
    flags: list[str] = []
    if not cell:
        return None, None, flags

    def iso(d: str) -> str | None:
        d = d.strip().replace("/", "-")
        return d or None

    if "~" in cell:
        left, right = (cell.split("~", 1) + [""])[:2]
        req, obt = iso(left), iso(right)
        if req and not obt:
            flags.append("pending(open_range)")
        return req, obt, flags
    return None, iso(cell), flags  # single date → obtained_at


# ── 備註 parsing ─────────────────────────────────────────────────────────
RE_SIZE = re.compile(r"尺寸[:：]\s*(.+)")
RE_COLOR = re.compile(r"顏色[:：]\s*(.+)")
RE_PRICE = re.compile(r"(?:原價|單價)[:：]\s*([\d.,]+)\s*([A-Za-z]+|元|円|¥|￥)?")
RE_WEIGHT = re.compile(r"(?:重量|淨重)[:：]\s*([\d.]+)\s*(g|kg|克)?")
RE_LENGTH = re.compile(r"長度[:：]\s*([\d.]+)\s*(mm|cm|m)?")
RE_DIMS = re.compile(r"(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?")
RE_QTY = re.compile(r"數量[:：]\s*(\d+)")
RE_QTY_EXPR = re.compile(r"\*\s*(\d+)\s*件")
RE_VARIANT = re.compile(r"x\s*\d+.*[，,].*x\s*\d+")  # e.g. 深藍x2，灰色x1


def parse_remark(remark: str) -> tuple[dict, list[str]]:
    """Extract structured item fields; return (fields, flags). Residue → remark."""
    fields: dict = {}
    flags: list[str] = []
    residue: list[str] = []

    for raw in remark.splitlines():
        line = raw.strip()
        if not line:
            continue
        matched = False

        if m := RE_SIZE.search(line):
            fields["size"] = m.group(1).strip()
            matched = True
        if m := RE_COLOR.search(line):
            fields["color"] = m.group(1).strip()
            matched = True
        if m := RE_PRICE.search(line):
            fields["sku_price"] = norm_num(m.group(1))
            cur = parse_currency(line) or (m.group(2) or "").upper() or None
            if cur:
                fields["sku_price_currency"] = CURRENCY_TOKENS.get(cur, cur)
            matched = True
        if m := RE_WEIGHT.search(line):
            fields["weight"] = {"value": m.group(1), "unit": m.group(2) or "g"}
            matched = True
        if m := RE_LENGTH.search(line):
            fields["length"] = {"value": m.group(1), "unit": m.group(2) or "m"}
            matched = True
        if m := RE_DIMS.search(line):
            unit = m.group(4) or "cm"
            fields["length"] = {"value": m.group(1), "unit": unit}
            fields["width"] = {"value": m.group(2), "unit": unit}
            fields["height"] = {"value": m.group(3), "unit": unit}
            matched = True
        if RE_VARIANT.search(line):
            flags.append(f"variant_qty:{line}")
            fields.setdefault("quantity", 1)
            matched = True
        elif m := RE_QTY.search(line):
            fields["quantity"] = int(m.group(1))
            matched = True
        elif m := RE_QTY_EXPR.search(line):
            fields["quantity"] = int(m.group(1))
            matched = True

        if not matched:
            residue.append(line)

    if residue:
        fields["remark"] = " / ".join(residue)
    return fields, flags


# ── Data classes ─────────────────────────────────────────────────────────
@dataclass
class Item:
    name: str
    fields: dict
    flags: list[str] = field(default_factory=list)


@dataclass
class CostFactor:
    type: str
    value: float | None
    currency: str | None


@dataclass
class Acquisition:
    source: str
    request_time: str | None
    obtained_at: str | None
    items: list[Item] = field(default_factory=list)
    cost_factors: list[CostFactor] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


def is_summary(row: list[str]) -> bool:
    name = (row[0] if row else "").strip()
    return name == "" or name == "總支出" or "總支出" in (row[1] if len(row) > 1 else "")


def build(csv_path: str) -> list[Acquisition]:
    acquisitions: list[Acquisition] = []
    last_source = ""

    with open(csv_path, encoding="utf-8") as fh:
        rows = list(csv.reader(fh))

    for row in rows[1:]:  # skip header
        row = (row + [""] * 6)[:6]
        name, price, currency, location, date, remark = (c.strip() for c in row)
        if is_summary(row):
            continue

        has_ctx = bool(location or date)

        if has_ctx:
            src = location or last_source
            flags = [] if location else ["inherited_source"]
            if location:
                last_source = location
            req, obt, dflags = parse_date(date)
            acq = Acquisition(source=src, request_time=req, obtained_at=obt, flags=flags + dflags)
            acquisitions.append(acq)
            # header row's paid amount → per-currency accumulated (override)
            pv = norm_num(price)
            if pv is not None and currency:
                acq.cost_factors.append(CostFactor("accumulated", pv, currency))
            # the header row is itself an item
            fields, iflags = parse_remark(remark)
            acq.items.append(Item(name=name, fields=fields, flags=iflags))
            continue

        # attachment row (no location, no date)
        if not acquisitions:
            # orphan before any acquisition — start a sourceless one
            acquisitions.append(Acquisition(source="", request_time=None, obtained_at=None,
                                            flags=["orphan_no_acquisition"]))
        acq = acquisitions[-1]

        ftype = classify_cost_factor(name)
        if ftype:
            val = norm_num(price)
            cur = currency or None
            if val is None:  # value may live in the remark (e.g. −￥1,450)
                val = norm_num(remark)
                cur = cur or parse_currency(remark)
            acq.cost_factors.append(CostFactor(ftype, val, cur))
        else:
            fields, iflags = parse_remark(remark)
            acq.items.append(Item(name=name, fields=fields, flags=iflags))

    return acquisitions


def merge_accumulated(acq: Acquisition) -> dict:
    """Per-currency net (Total) across all factors."""
    totals: dict = {}
    for cf in acq.cost_factors:
        if cf.value is None:
            continue
        totals[cf.currency or "?"] = round(totals.get(cf.currency or "?", 0.0) + cf.value, 4)
    return totals


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    want_json = "--json" in sys.argv
    acqs = build(path)

    if want_json:
        print(json.dumps([asdict(a) for a in acqs], ensure_ascii=False, indent=2))
        return

    # ── Human-readable report ──
    n_items = sum(len(a.items) for a in acqs)
    n_cf = sum(len(a.cost_factors) for a in acqs)
    flagged = []

    for i, a in enumerate(acqs, 1):
        head = f"[{i:>3}] {a.source or '(no source)'}"
        dates = f"req={a.request_time or '—'} obt={a.obtained_at or '—'}"
        print(f"{head:<48} {dates}  {' '.join('⚑' + f for f in a.flags)}")
        for cf in a.cost_factors:
            print(f"        $ {cf.type:<12} {str(cf.value):>10} {cf.currency or '—'}")
        for it in a.items:
            extra = {k: v for k, v in it.fields.items() if k != "remark"}
            print(f"        • {it.name[:40]:<40} {extra}")
            for f in it.flags:
                flagged.append((i, it.name, f))
        tot = merge_accumulated(a)
        if tot:
            print(f"        = Total: {tot}")
        if a.flags:
            flagged.extend((i, "(acquisition)", f) for f in a.flags)

    print("\n" + "=" * 70)
    print(f"Acquisitions: {len(acqs)} | Items: {n_items} | CostFactors: {n_cf}")
    print(f"Flagged rows needing review: {len(flagged)}")
    for i, name, f in flagged:
        print(f"  ⚑ acq#{i} {name[:30]:<30} {f}")


if __name__ == "__main__":
    main()
