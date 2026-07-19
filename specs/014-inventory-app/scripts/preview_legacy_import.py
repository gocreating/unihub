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
from pathlib import Path
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


def extract_amount(s: str) -> float | None:
    """Signed amount from currency-adorned text (e.g. "−￥1,450", "-735yen")."""
    cleaned = s.strip().replace(",", "").replace("，", "").replace("−", "-")
    cleaned = cleaned.replace("¥", "").replace("￥", "").replace("$", "")
    m = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    return float(m.group(0)) if m else None


def parse_currency(text: str) -> str | None:
    for tok, code in CURRENCY_TOKENS.items():
        if tok in text:
            return code
    return None


RE_DATE_TOKEN = re.compile(r"(\d{4})[/\-.](\d{1,2})(?:[/\-.](\d{1,2}|\?{1,2}))?")


def _date_token_iso(m: "re.Match") -> str:
    """Normalise one date token; a missing/?? day resolves to the month end."""
    import calendar

    year, month = int(m.group(1)), int(m.group(2))
    day_raw = m.group(3)
    if not day_raw or "?" in day_raw:
        day = calendar.monthrange(year, month)[1]
    else:
        day = int(day_raw)
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_date(cell: str, default_year: int | None = None):
    """Return (request_time, obtained_at, flags, leftover_text).

    Rules (FR-029e): simple forms — single date → obtained only; ``d~`` →
    requested only (pending); ``d~d`` → both; garbage-left ``??~d`` →
    obtained only. A token with a missing/``??`` day resolves to the LAST DAY
    of its month. A COMPLEX cell (extra text / extra dates, e.g. the MUJI
    multiline case) uses the LATEST date as obtained (a leading ``date~`` as
    requested) and returns the FULL cell text as leftover so the caller
    preserves it in acquisition.remark. No dates at all → obtained defaults
    to Dec 31 of the sheet year (``defaulted_eoy``).
    """
    cell = cell.strip()
    flags: list[str] = []
    tokens = list(RE_DATE_TOKEN.finditer(cell))
    dates = [_date_token_iso(m) for m in tokens]

    if not dates:
        if default_year:
            flags.append("defaulted_eoy")
            keep = cell if re.search(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{2,}|\d{2,}", cell) else ""
            return None, f"{default_year}-12-31", flags, keep
        return None, None, flags, ""

    # Simple form when nothing but the tokens, ``~`` separators, and
    # placeholder junk (?? / -) remains.
    stripped = cell
    for m in tokens:
        stripped = stripped.replace(m.group(0), "", 1)
    residue = stripped.replace("~", "").replace("?", "").replace("-", "").strip()

    if residue == "":
        if "~" in cell:
            left = cell.split("~", 1)[0]
            left_has_date = bool(RE_DATE_TOKEN.search(left))
            if len(dates) >= 2:
                return dates[0], dates[-1], flags, ""
            if left_has_date:
                flags.append("pending(open_range)")
                return dates[0], None, flags, ""
            return None, dates[0], flags, ""
        return None, dates[0], flags, ""

    # Complex cell: latest date wins as obtained; a LEADING ``date~`` is the
    # requested side; the whole original text is preserved by the caller.
    first = tokens[0]
    leads = cell[: first.start()].strip() == "" and "~" in cell[first.end() : first.end() + 3]
    request = dates[0] if (leads and len(dates) > 1) else None
    flags.append("complex_date_cell")
    return request, max(dates), flags, cell


# ── 備註 parsing ─────────────────────────────────────────────────────────
RE_SIZE = re.compile(r"(?:尺寸|[Ss]ize)[:：]\s*(.+)")
RE_SPEC = re.compile(r"規格[:：]\s*(.+)")
RE_COLOR = re.compile(r"(?:顏色|款式|[Cc]olor)[:：]\s*(.+)")
# 單價 (the actual unit price) extracts as sku — colon form, or colonless with
# the quantity expression. 原價 is the PRE-DISCOUNT list price and NEVER sets
# the sku directly (iteration 39); with a ，N折 note it computes the sku for
# shared-total rows (RE_DISCOUNT → _finalize).
RE_PRICE = re.compile(r"單價[:：]\s*([\d.,]+)\s*([A-Za-z]+|元|円|¥|￥)?")
RE_PRICE_QTY = re.compile(r"單價[:：]?\s*([\d.,]+)()(?=\s*\*\s*\d+\s*件)")
RE_DISCOUNT = re.compile(r"原價\s*[:：]?\s*([\d.,]+)\s*[，,]\s*([\d.]+)\s*折")
# Keyed numeric values may be min~max/min-max ranges (FR-029h, iterations
# 28→30) — the whole range text is captured verbatim; the backend computes
# min/max. The SIGNED grammar (temperature) allows negative bounds with `~`
# (dash separators keep a non-negative max, mirroring core.attributes).
_NUM_OR_RANGE = r"[\d.]+(?:\s*[~-]\s*[\d.]+)?"
_SIGNED_NUM_OR_RANGE = r"-?[\d.]+(?:\s*~\s*-?[\d.]+|\s*-\s*[\d.]+)?"
RE_WEIGHT = re.compile(rf"(?:重量|淨重)[:：]\s*({_NUM_OR_RANGE})\s*(g|kg|克)?")
RE_LENGTH = re.compile(rf"長度[:：]\s*({_NUM_OR_RANGE})\s*(mm|cm|m)?")
RE_WIDTH_KEY = re.compile(rf"寬度[:：]\s*({_NUM_OR_RANGE})\s*(mm|cm|m)?")
RE_HEIGHT_KEY = re.compile(rf"高度[:：]\s*({_NUM_OR_RANGE})\s*(mm|cm|m)?")
RE_DIAMETER = re.compile(rf"直徑[:：]\s*({_NUM_OR_RANGE})\s*(mm|cm|m)?")
RE_WAIST = re.compile(rf"腰圍[:：]?\s*({_NUM_OR_RANGE})\s*(mm|cm|m)?")
# Acquisition-level per-item 原價 listing by NAME FRAGMENT (iteration 42):
# "被套原價1390，抹布原價119，衣架原價99*2組" / arithmetic variants.
RE_NAME_LIST_PRICE = re.compile(
    r"([一-鿿A-Za-z0-9]{1,8}?)原價\s*([\d.,]+)(?:\s*\*\s*(\d+)\s*[組件個])?"
)
RE_VOLUME = re.compile(rf"容量[:：]\s*({_NUM_OR_RANGE})\s*(mL|ml|L|毫升|公升)")
RE_TEMP = re.compile(rf"耐溫[:：]\s*({_SIGNED_NUM_OR_RANGE})\s*(度C|℃|°C|度)?")
RE_URL_KEY = re.compile(r"官網連結[:：]\s*(\S+)")
# A dims part may itself be a range ("18~28") — iteration 42.
_DIM_N = r"\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?"
RE_DIMS = re.compile(
    rf"({_DIM_N})\s*[x×X*]\s*({_DIM_N})\s*[x×X*]\s*({_DIM_N})\s*(mm|cm|m)?"
)
# Two-part 長×寬 (e.g. 37*19.8cm) — the unit is REQUIRED so bare "a x b" text
# (variant counts, quantities) never turns dimensional.
RE_DIMS2 = re.compile(rf"({_DIM_N})\s*[x×X*]\s*({_DIM_N})\s*(mm|cm|m)\b")
# Per-unit dims (iteration 36): the unit rides EACH number — "50cm * 75cm",
# "172cm x 58 cm x 4 mm" (mixed units kept per part), "183cmx 61cm" (no \b:
# 'cmx' chains must split; mm|cm|m longest-first).
_NUM_U = rf"({_DIM_N})\s*(mm|cm|m)"
RE_DIMS_U3 = re.compile(rf"{_NUM_U}\s*[x×X*]\s*{_NUM_U}\s*[x×X*]\s*{_NUM_U}")
RE_DIMS_U2 = re.compile(rf"{_NUM_U}\s*[x×X*]\s*{_NUM_U}")
RE_QTY = re.compile(r"數量[:：]\s*(\d+)")
RE_QTY_EXPR = re.compile(r"\*\s*(\d+)\s*件")
RE_VARIANT = re.compile(r"x\s*\d+.*[，,].*x\s*\d+")  # e.g. 深藍x2，灰色x1
# Simple shipping note (whole line) → a shipping cost factor on the acquisition.
# Complex combos (運費60-國慶折抵70…) intentionally do NOT match → remark.
RE_SHIPPING = re.compile(r"^運費[:：]?\s*([¥￥$]?)([\d.,]+)\s*(元|RMB|TWD|USD|NT)?$")
# Segment delimiters (FR-029j): ，/、 and SPACED slashes — a bare slash stays
# inside values ("43/46", "180ml/灰色登山扣款").
RE_SEGMENT_SPLIT = re.compile(r"\s*[，、]\s*|\s+/\s+")


def _size_fully_dimensional(size_match: re.Match, dims_match: re.Match) -> bool:
    """True when the 尺寸 content is nothing but the matched dims expression.

    Only then may the size param be dropped in favour of 長/寬/高 (FR-029g);
    any extra prose keeps the verbatim size content (FR-029d).
    """
    start, end = size_match.start(1), size_match.end(1)
    if dims_match.start() < start or dims_match.end() > end:
        return False
    content = size_match.string[start:end]
    blanked = (
        content[: dims_match.start() - start]
        + " " * (dims_match.end() - dims_match.start())
        + content[dims_match.end() - start :]
    )
    # ANY letter/han/digit is meaningful (iteration 36 — "S" is a real size).
    return not re.search(r"[一-鿿]|[A-Za-z]|\d", blanked)


def _apply_unit(text: str, fields: dict, flags: list, residue: list) -> None:
    """Run every key pattern over one text unit (a whole line or a segment);
    unconsumed/leftover content appends to ``residue`` (FR-029d/FR-029j)."""
    matched = False
    spans: list[tuple[int, int]] = []

    if m := RE_URL_KEY.search(text):
        fields.setdefault("url", m.group(1).strip())
        matched = True
        spans.append(m.span())
    elif m := RE_SHIPPING.match(text):
        value = norm_num(m.group(2))
        if value is not None:
            sym, suffix = m.group(1), (m.group(3) or "")
            currency = None
            if suffix in ("TWD", "NT"):
                currency = "TWD"
            elif suffix in ("USD",):
                currency = "USD"
            elif suffix in ("RMB", "元") or sym in ("¥", "￥"):
                currency = "RMB"
            fields.setdefault("_shipping", []).append({"value": value, "currency": currency})
            matched = True
        spans.append(m.span())

    size_m = RE_SIZE.search(text)
    size_paren = False
    if size_m:
        content = size_m.group(1).strip()
        pm = re.match(r"^(.{0,10}?)\s*[（(](.+)[)）]$", content)
        if pm:
            # LABEL（annotation） (iteration 42): the annotation processes as
            # its own unit (dims/keyed measures extract; leftovers → remark)
            # and the size keeps ONLY the label.
            label, inner = pm.group(1).strip(), pm.group(2).strip()
            _apply_unit(inner, fields, flags, residue)
            if label:
                fields["size"] = label
            else:
                fields.pop("size", None)
            size_paren = True
        else:
            fields["size"] = content
        matched = True
        spans.append(size_m.span())
    if m := RE_SPEC.search(text):
        fields["spec"] = m.group(1).strip()
        matched = True
        spans.append(m.span())
    if m := RE_COLOR.search(text):
        fields.setdefault("color", m.group(1).strip())
        matched = True
        spans.append(m.span())
    if m := RE_DISCOUNT.search(text):
        fields["_list_price"] = norm_num(m.group(1))
        digits = m.group(2)
        base = float(digits)
        # 9折 → ×0.9; 79折 → ×0.79; 8.5折 → ×0.85.
        fields["_discount_factor"] = base / (100 if ("." not in digits and len(digits) == 2) else 10)
        matched = True
        spans.append(m.span())
    if m := (RE_PRICE.search(text) or RE_PRICE_QTY.search(text)):
        fields["sku_price"] = norm_num(m.group(1))
        cur = parse_currency(text) or (m.group(2) or "").upper() or None
        if cur:
            fields["sku_price_currency"] = CURRENCY_TOKENS.get(cur, cur)
        matched = True
        spans.append(m.span())
    if m := RE_WEIGHT.search(text):
        fields["weight"] = {"value": m.group(1), "unit": m.group(2) or "g"}
        matched = True
        spans.append(m.span())
    if m := RE_LENGTH.search(text):
        fields["length"] = {"value": m.group(1), "unit": m.group(2) or "m"}
        matched = True
        spans.append(m.span())
    if m := RE_WIDTH_KEY.search(text):
        fields["width"] = {"value": m.group(1), "unit": m.group(2) or "cm"}
        matched = True
        spans.append(m.span())
    if m := RE_HEIGHT_KEY.search(text):
        fields["height"] = {"value": m.group(1), "unit": m.group(2) or "cm"}
        matched = True
        spans.append(m.span())
    if m := RE_DIAMETER.search(text):
        fields["diameter"] = {"value": m.group(1), "unit": m.group(2) or "cm"}
        matched = True
        spans.append(m.span())
    if m := RE_WAIST.search(text):
        fields["waist"] = {"value": m.group(1), "unit": m.group(2) or "cm"}
        matched = True
        spans.append(m.span())
    if m := RE_TEMP.search(text):
        # 度C/℃/度 all normalize to the family's canonical °C symbol.
        fields["temperature"] = {"value": m.group(1), "unit": "°C"}
        matched = True
        spans.append(m.span())
    if m := RE_VOLUME.search(text):
        unit = {"ml": "mL", "毫升": "mL", "公升": "L"}.get(m.group(2), m.group(2))
        fields["volume"] = {"value": m.group(1), "unit": unit}
        matched = True
        spans.append(m.span())
    if m := RE_DIMS_U3.search(text):
        fields["length"] = {"value": m.group(1), "unit": m.group(2)}
        fields["width"] = {"value": m.group(3), "unit": m.group(4)}
        fields["height"] = {"value": m.group(5), "unit": m.group(6)}
        matched = True
        spans.append(m.span())
        if size_m and not size_paren and _size_fully_dimensional(size_m, m):
            fields.pop("size", None)
    elif m := RE_DIMS_U2.search(text):
        fields["length"] = {"value": m.group(1), "unit": m.group(2)}
        fields["width"] = {"value": m.group(3), "unit": m.group(4)}
        matched = True
        spans.append(m.span())
        if size_m and not size_paren and _size_fully_dimensional(size_m, m):
            fields.pop("size", None)
    elif m := RE_DIMS.search(text):
        unit = m.group(4) or "cm"
        fields["length"] = {"value": m.group(1), "unit": unit}
        fields["width"] = {"value": m.group(2), "unit": unit}
        fields["height"] = {"value": m.group(3), "unit": unit}
        matched = True
        spans.append(m.span())
        if size_m and not size_paren and _size_fully_dimensional(size_m, m):
            fields.pop("size", None)
    elif m := RE_DIMS2.search(text):
        unit = m.group(3)
        fields["length"] = {"value": m.group(1), "unit": unit}
        fields["width"] = {"value": m.group(2), "unit": unit}
        matched = True
        spans.append(m.span())
        if size_m and not size_paren and _size_fully_dimensional(size_m, m):
            fields.pop("size", None)
    if mv := RE_VARIANT.search(text):
        flags.append(f"variant_qty:{text}")
        fields.setdefault("quantity", 1)
        matched = True
        spans.append(mv.span())
    elif m := RE_QTY.search(text):
        fields["quantity"] = int(m.group(1))
        matched = True
        spans.append(m.span())
    elif m := RE_QTY_EXPR.search(text):
        fields["quantity"] = int(m.group(1))
        matched = True
        spans.append(m.span())

    if not matched:
        residue.append(text)
    else:
        # No-data-loss (FR-029d): if meaningful content remains OUTSIDE
        # the matched key/value spans, keep the WHOLE text as remark —
        # extraction must never drop surrounding prose.
        blanked = list(text)
        for start, end in spans:
            for i in range(start, end):
                blanked[i] = " "
        leftover = "".join(blanked)
        if re.search(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{2,}|\d", leftover):
            residue.append(text)


def parse_remark(remark: str) -> tuple[dict, list[str]]:
    """Extract structured item fields; return (fields, flags). Residue → remark.

    FR-029j: lines split into segments on ，/、/spaced-`/` with per-segment
    matching (unconsumed segments → remark); forms whose patterns SPAN
    delimiters (原價X，N折, variant counts, whole-line 運費) keep whole-line
    processing. Acquisition-level extractions use reserved keys the builder
    lifts out: ``_shipping`` → a shipping cost factor.
    """
    fields: dict = {}
    flags: list[str] = []
    residue: list[str] = []

    for raw in remark.splitlines():
        line = raw.strip()
        if not line:
            continue
        if RE_DISCOUNT.search(line) or RE_VARIANT.search(line) or RE_SHIPPING.match(line):
            _apply_unit(line, fields, flags, residue)
            continue
        segments = [seg.strip() for seg in RE_SEGMENT_SPLIT.split(line) if seg.strip()]
        if len(segments) <= 1:
            _apply_unit(line, fields, flags, residue)
        else:
            for seg in segments:
                _apply_unit(seg, fields, flags, residue)

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
    remark: str = ""
    items: list[Item] = field(default_factory=list)
    cost_factors: list[CostFactor] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


def is_summary(row: list[str]) -> bool:
    name = (row[0] if row else "").strip()
    return name == "" or name == "總支出" or "總支出" in (row[1] if len(row) > 1 else "")


def _add_item(acq: Acquisition, name: str, remark: str, url: str) -> None:
    """Parse the 備註 and append an Item; lift acquisition-level extractions."""
    fields, iflags = parse_remark(remark)
    if url and "url" not in fields:
        fields["url"] = url
    # Simple `運費N` notes belong to the acquisition, not the item.
    acq_currency = next((cf.currency for cf in acq.cost_factors if cf.currency), None)
    for shipping in fields.pop("_shipping", []):
        acq.cost_factors.append(
            CostFactor("shipping", shipping["value"], shipping["currency"] or acq_currency)
        )
    acq.items.append(Item(name=name, fields=fields, flags=iflags))


def build_from_rows(
    rows: list[tuple], default_year: int | None = None
) -> list[Acquisition]:
    """Group (name, price, currency, location, date, remark, url) rows into acquisitions."""
    acquisitions: list[Acquisition] = []
    last_source = ""
    skipped_struck: list[str] = []
    own_prices: dict[int, list] = {}
    global LAST_SKIPPED_STRUCK

    for row in rows:
        name, price, currency, location, date, remark, url, *rest = row
        if is_summary([name, price]):
            continue

        # A row starts a NEW acquisition only on its OWN (non-rowspan-carried)
        # location/date context; carried cells provide values (e.g. a merged
        # 購買日期 shared across acquisitions) without splitting groups.
        has_ctx = rest[0] if rest else bool(location or date)
        own_name = rest[1] if len(rest) > 1 else True
        struck = rest[2] if len(rest) > 2 else False
        own_price = rest[3] if len(rest) > 3 else bool(price)

        # Crossed-out ITEMS are intentionally SKIPPED (FR-029e b) — but a
        # struck HEADER row still creates its acquisition (source/date/paid),
        # because live continuation items may follow under its rowspans.
        skip_item_only = False
        if struck and own_name:
            skipped_struck.append(name)
            if not has_ctx:
                continue
            skip_item_only = True

        # A rowspan-carried 項目 row is NOT a new item (FR-029d): its own 備註
        # content belongs to the CURRENT item — merged into spec, sheet order.
        if not own_name and not has_ctx:
            if acquisitions and acquisitions[-1].items and remark:
                fields = acquisitions[-1].items[-1].fields
                fields["_cont_spec"] = "\n".join(
                    part for part in (fields.get("_cont_spec", ""), remark) if part
                )
            continue

        if has_ctx:
            src = location or last_source
            flags = [] if location else ["inherited_source"]
            if location:
                last_source = location
            req, obt, dflags, date_leftover = parse_date(date, default_year)
            acq = Acquisition(source=src, request_time=req, obtained_at=obt, flags=flags + dflags)
            if date_leftover:
                # No-data-loss (FR-029e): unconsumed date-cell text survives.
                acq.remark = date_leftover
            acquisitions.append(acq)
            # header row's paid amount → per-currency accumulated (override)
            pv = extract_amount(price)  # paid cells may be adorned ("¥4,200")
            if pv is not None and currency:
                acq.cost_factors.append(CostFactor("accumulated", pv, currency))
            # the header row is itself an item — unless it is crossed out.
            if not skip_item_only:
                _add_item(acq, name, remark, url)
                acq.items[-1].fields["_raw_remark"] = remark
                if own_price and pv is not None:
                    own_prices.setdefault(id(acq), []).append((acq.items[-1], pv, currency or None))
            elif own_price and pv is not None:
                # A struck item's paid amount still belongs to the acquisition.
                own_prices.setdefault(id(acq), []).append((None, pv, currency or None))
            continue

        # attachment row (no location, no date)
        if not acquisitions:
            # orphan before any acquisition — start a sourceless one
            acquisitions.append(Acquisition(source="", request_time=None, obtained_at=None,
                                            flags=["orphan_no_acquisition"]))
        acq = acquisitions[-1]

        ftype = classify_cost_factor(name)
        if ftype:
            val = extract_amount(price)  # adorned amounts parse too (iteration 35)
            cur = currency or None
            remark_used_for_value = False
            if val is None:  # value may live in the remark (e.g. −￥1,450)
                val = extract_amount(remark)
                cur = cur or parse_currency(remark)
                remark_used_for_value = val is not None
            acq.cost_factors.append(CostFactor(ftype, val, cur))
            # No-data-loss (FR-029d): factor-row 備註 prose survives on the
            # acquisition remark. A remark FULLY consumed as the factor's
            # amount (number + currency adornments only) needs no copy.
            if remark:
                leftover = remark
                if remark_used_for_value:
                    cleaned = (remark.replace(",", "").replace("，", "")
                               .replace("−", "-").replace("¥", " ")
                               .replace("￥", " ").replace("$", " "))
                    cleaned = re.sub(r"-?\d+(?:\.\d+)?", " ", cleaned, count=1)
                    for token in CURRENCY_TOKENS:
                        cleaned = cleaned.replace(token, " ")
                    leftover = cleaned
                if re.search(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{2,}|\d{2,}", leftover):
                    acq.remark = f"{acq.remark}\n{remark}".strip() if acq.remark else remark
        else:
            _add_item(acq, name, remark, url)
            acq.items[-1].fields["_raw_remark"] = remark
            pv = extract_amount(price)  # paid cells may be adorned ("¥4,200")
            if own_price and pv is not None:
                own_prices.setdefault(id(acq), []).append((acq.items[-1], pv, currency or None))

    _finalize(acquisitions, own_prices)
    LAST_SKIPPED_STRUCK = skipped_struck
    return acquisitions


def _finalize(acquisitions: list["Acquisition"], own_prices: dict[int, list]) -> None:
    """FR-029f: per-row prices → skus (+ summed override) and verbatim 備註.

    (a) Item rows with OWN price cells feed ``sku_price`` (÷ quantity when
    qty > 1 and 備註 gave no explicit 單價); when TWO or more rows carried own
    prices, the acquisition's paid override becomes their per-currency SUM
    (the old header-only override under-counted multi-priced orders).
    (b) Item-row 備註 is preserved VERBATIM — ``item.spec`` when the
    acquisition holds several items, ``acquisition.remark`` when it holds
    exactly one; continuation-row 備註 keeps appending to the item's spec.
    """
    for acq in acquisitions:
        own = own_prices.get(id(acq), [])
        if len(own) >= 2:
            sums: dict = {}
            for _item, value, cur in own:
                key = cur or "?"
                sums[key] = sums.get(key, 0.0) + value
            acq.cost_factors = [cf for cf in acq.cost_factors if cf.type != "accumulated"]
            for cur, total in sums.items():
                acq.cost_factors.append(
                    CostFactor("accumulated", round(total, 4), None if cur == "?" else cur)
                )
        for item, value, cur in own:
            if item is None or item.fields.get("sku_price") is not None:
                continue
            qty = item.fields.get("quantity") or 1
            item.fields["sku_price"] = round(value / qty, 4) if qty > 1 else value
            if cur:
                item.fields.setdefault("sku_price_currency", cur)

        # (c') Name-matched 原價 listings (iteration 42, FR-029k): when the
        # own-price rows do NOT cover every item, a shared 備註 listing
        # "<fragment>原價<amount>[*N 組/件/個]" assigns sku (+quantity) to the
        # item whose name contains the fragment (progressively shortened from
        # the left until a UNIQUE match; ambiguous/unmatched fragments skip).
        # These assignments override a shared-rowspan total that leaked onto
        # the header item.
        own_item_count = sum(1 for t in own if t[0] is not None)
        assigned_by_name: set = set()
        if own_item_count < len(acq.items):
            blob = "\n".join(
                part
                for part in (
                    *(i.fields.get("_raw_remark", "") for i in acq.items),
                    acq.remark or "",
                )
                if part
            )
            entries = [
                (m.group(1), norm_num(m.group(2)), m.group(3))
                for m in RE_NAME_LIST_PRICE.finditer(blob)
                if norm_num(m.group(2)) is not None
            ]

            def candidates(fragment):
                frag = fragment
                while frag:
                    hits = [
                        i for i in acq.items if frag in i.name and id(i) not in assigned_by_name
                    ]
                    if hits:
                        return hits
                    frag = frag[1:]
                return []

            # Constraint propagation: resolve fragments with a UNIQUE unassigned
            # candidate first; repeat — "衣夾" claims PC衣夾, freeing "衣架".
            pending = list(entries)
            progress = True
            while pending and progress:
                progress = False
                for entry in list(pending):
                    hits = candidates(entry[0])
                    if len(hits) == 1:
                        target = hits[0]
                        target.fields["sku_price"] = entry[1]
                        if entry[2]:
                            target.fields["quantity"] = int(entry[2])
                        assigned_by_name.add(id(target))
                        pending.remove(entry)
                        progress = True

        # (c) 原價X，N折 computes skus when the own-price rows do NOT cover
        # every item (a shared rowspan total): the "own" total row's ÷qty sku
        # is overridden by its computed value too (iteration 39, FR-029i).
        if own_item_count < len(acq.items):
            for item in acq.items:
                lp = item.fields.get("_list_price")
                fac = item.fields.get("_discount_factor")
                if lp is not None and fac is not None and id(item) not in assigned_by_name:
                    item.fields["sku_price"] = round(lp * fac, 4)
        acq_currency = next((cf.currency for cf in acq.cost_factors if cf.currency), None)
        for item in acq.items:
            item.fields.pop("_list_price", None)
            item.fields.pop("_discount_factor", None)
            # Derived skus inherit the acquisition currency (iteration 39).
            if item.fields.get("sku_price") is not None and not item.fields.get("sku_price_currency"):
                if acq_currency:
                    item.fields["sku_price_currency"] = acq_currency

        multi = len(acq.items) > 1
        for item in acq.items:
            raw = (item.fields.pop("_raw_remark", "") or "").strip()
            cont = (item.fields.pop("_cont_spec", "") or "").strip()
            if multi:
                parts = [p for p in (raw, cont) if p]
                if parts:
                    item.fields["spec"] = "\n".join(parts)
                item.fields.pop("remark", None)
            else:
                if raw:
                    acq.remark = f"{acq.remark}\n{raw}".strip() if acq.remark else raw
                    item.fields.pop("remark", None)
                if cont:
                    existing = item.fields.get("spec", "")
                    item.fields["spec"] = f"{existing}\n{cont}".strip() if existing else cont


LAST_SKIPPED_STRUCK: list[str] = []


def build(csv_path: str) -> list[Acquisition]:
    """v1: per-year CSV (no URLs)."""
    with open(csv_path, encoding="utf-8") as fh:
        raw = list(csv.reader(fh))
    rows = []
    for row in raw[1:]:  # skip header
        row = (row + [""] * 6)[:6]
        name, price, currency, location, date, remark = (c.strip() for c in row)
        rows.append((name, price, currency, location, date, remark, "", bool(location or date), True, False, bool(price)))
    return build_from_rows(rows)


# ── HTML (Google Sheets export) parsing — Format v2 ──────────────────────
from html.parser import HTMLParser  # noqa: E402


class _SheetHTMLParser(HTMLParser):
    """Extract the sheet grid: per-cell text (with <br> newlines) + first link.

    Google Sheets merges cells with colspan AND rowspan (vertically-merged
    price/location/date cells span the followup item rows). Normalise into a
    stable grid: colspans pad the current row; rowspans occupy their column(s)
    in the following rows with EMPTY placeholders — deliberately empty, so
    covered rows read as continuation items of the same acquisition rather
    than starting a new one.
    """

    def __init__(self, struck_classes: frozenset[str] = frozenset()) -> None:
        super().__init__(convert_charrefs=True)
        self._struck_classes = struck_classes
        self.rows: list[list[dict]] = []
        self._row: list[dict] | None = None
        self._cell: dict | None = None
        self._colspan = 1
        self._rowspan = 1
        # grid column index → (rows still occupied, source cell) for an active
        # rowspan. Declarations stage in _new_spans and only activate AFTER the
        # declaring row ends (they cover the FOLLOWING rows, not their own).
        # Covered positions receive a CARRIED copy of the source cell so a new
        # acquisition under a merged 購買日期 keeps the date (FR-029a a), while
        # the grouping logic ignores carried location/date for new-acquisition
        # detection so continuation rows keep grouping (see build_html).
        self._occupied: dict[int, tuple[int, dict]] = {}
        self._new_spans: dict[int, tuple[int, dict]] = {}

    @staticmethod
    def _empty() -> dict:
        return {"text": "", "link": ""}

    @staticmethod
    def _carried(src: dict) -> dict:
        return {
            "text": src["text"],
            "link": src["link"],
            "carried": True,
            "struck": src.get("struck", False),
        }

    def _next_free_col(self) -> int:
        col = len(self._row)
        while col in self._occupied and self._occupied[col][0] > 0:
            self._row.append(self._carried(self._occupied[col][1]))
            col = len(self._row)
        return col

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._next_free_col()
            classes = set((a.get("class") or "").split())
            self._cell = {
                "text": "",
                "link": "",
                "struck": bool(classes & self._struck_classes),
            }
            self._colspan = max(1, int(a.get("colspan") or 1))
            self._rowspan = max(1, int(a.get("rowspan") or 1))
        elif self._cell is not None and tag == "a" and not self._cell["link"]:
            self._cell["link"] = a.get("href", "")
        elif self._cell is not None and tag == "br":
            self._cell["text"] += "\n"
        elif self._cell is not None and tag == "div" and self._cell["text"]:
            self._cell["text"] += "\n"

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None:
            col = len(self._row)
            self._row.append(self._cell)
            for _ in range(self._colspan - 1):
                self._row.append(self._empty())
            if self._rowspan > 1:
                for c in range(col, col + self._colspan):
                    self._new_spans[c] = (self._rowspan - 1, self._row[col])
            self._cell = None
            self._colspan = 1
            self._rowspan = 1
        elif tag == "tr" and self._row is not None:
            # Fill any trailing rowspan-occupied columns (carried content).
            while any(
                self._occupied.get(c, (0, None))[0] > 0
                for c in range(len(self._row), max(self._occupied, default=-1) + 1)
            ):
                col = len(self._row)
                src = self._occupied.get(col, (0, None))[1]
                self._row.append(self._carried(src) if src else self._empty())
            self.rows.append(self._row)
            # Consume one covered row from active spans, then activate the
            # spans declared in THIS row (they cover the following rows).
            self._occupied = {c: (n - 1, src) for c, (n, src) in self._occupied.items() if n > 1}
            for c, (n, src) in self._new_spans.items():
                if n >= self._occupied.get(c, (0, None))[0]:
                    self._occupied[c] = (n, src)
            self._new_spans = {}
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell["text"] += data


HEADERS = ["項目", "實際支付價錢", "貨幣", "購買地點", "購買日期", "備註"]


def _struck_classes(html_text: str) -> frozenset[str]:
    """CSS classes carrying text-decoration: line-through (crossed-out rows)."""
    return frozenset(
        re.findall(r"\.(s\d+)\s*\{[^}]*line-through[^}]*\}", html_text)
    )


def build_html(html_path: str) -> list[Acquisition]:
    """v2: Google-Sheets HTML export (keeps item URLs from name links)."""
    with open(html_path, encoding="utf-8") as fh:
        html_text = fh.read()
    parser = _SheetHTMLParser(_struck_classes(html_text))
    parser.feed(html_text)
    year_match = re.search(r"(20\d{2})", Path(html_path).stem)
    default_year = int(year_match.group(1)) if year_match else None

    # Locate the header row and derive each logical column's index from it —
    # robust to the row-number column and any spacer columns between years.
    col_idx: dict[str, int] | None = None
    rows = []
    for grid_row in parser.rows:
        texts = [c["text"].strip() for c in grid_row]
        if col_idx is None:
            if "項目" in texts:
                col_idx = {h: texts.index(h) for h in HEADERS if h in texts}
            continue

        def cell(header: str) -> dict:
            i = col_idx.get(header)
            return grid_row[i] if i is not None and i < len(grid_row) else {"text": "", "link": ""}

        name_cell = cell("項目")

        def own(header: str) -> bool:
            c = cell(header)
            return bool(c["text"].strip()) and not c.get("carried", False)

        rows.append(
            (
                name_cell["text"].strip(),
                cell("實際支付價錢")["text"].strip(),
                cell("貨幣")["text"].strip(),
                cell("購買地點")["text"].strip(),
                cell("購買日期")["text"].strip(),
                cell("備註")["text"].strip(),
                name_cell["link"].strip(),
                own("購買地點") or own("購買日期"),
                own("項目"),
                bool(name_cell.get("struck")) and not name_cell.get("carried", False),
                own("實際支付價錢"),
            )
        )
    if col_idx is None:
        raise ValueError(f"No 項目 header row found in {html_path}")
    return build_from_rows(rows, default_year=default_year)


def build_any(path: str) -> list[Acquisition]:
    """Dispatch on file extension: .html → v2 sheet export, else v1 CSV."""
    return build_html(path) if path.lower().endswith((".html", ".htm")) else build(path)


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
    acqs = build_any(path)

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
