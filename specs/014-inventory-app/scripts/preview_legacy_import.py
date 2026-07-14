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
RE_COLOR = re.compile(r"(?:顏色|款式)[:：]\s*(.+)")
RE_PRICE = re.compile(r"(?:原價|單價)[:：]?\s*([\d.,]+)\s*([A-Za-z]+|元|円|¥|￥)?")
RE_WEIGHT = re.compile(r"(?:重量|淨重)[:：]\s*([\d.]+)\s*(g|kg|克)?")
RE_LENGTH = re.compile(r"長度[:：]\s*([\d.]+)\s*(mm|cm|m)?")
RE_VOLUME = re.compile(r"容量[:：]\s*([\d.]+)\s*(mL|ml|L|毫升|公升)")
RE_URL_KEY = re.compile(r"官網連結[:：]\s*(\S+)")
RE_DIMS = re.compile(r"(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?")
RE_QTY = re.compile(r"數量[:：]\s*(\d+)")
RE_QTY_EXPR = re.compile(r"\*\s*(\d+)\s*件")
RE_VARIANT = re.compile(r"x\s*\d+.*[，,].*x\s*\d+")  # e.g. 深藍x2，灰色x1
# Simple shipping note (whole line) → a shipping cost factor on the acquisition.
# Complex combos (運費60-國慶折抵70…) intentionally do NOT match → remark.
RE_SHIPPING = re.compile(r"^運費[:：]?\s*([¥￥$]?)([\d.,]+)\s*(元|RMB|TWD|USD|NT)?$")


def parse_remark(remark: str) -> tuple[dict, list[str]]:
    """Extract structured item fields; return (fields, flags). Residue → remark.

    Acquisition-level extractions use reserved keys the builder lifts out:
    ``_shipping`` → a shipping cost factor.
    """
    fields: dict = {}
    flags: list[str] = []
    residue: list[str] = []

    for raw in remark.splitlines():
        line = raw.strip()
        if not line:
            continue
        matched = False
        spans: list[tuple[int, int]] = []

        if m := RE_URL_KEY.search(line):
            fields.setdefault("url", m.group(1).strip())
            matched = True
            spans.append(m.span())
        elif m := RE_SHIPPING.match(line):
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

        if m := RE_SIZE.search(line):
            fields["size"] = m.group(1).strip()
            matched = True
            spans.append(m.span())
        if m := RE_SPEC.search(line):
            fields["spec"] = m.group(1).strip()
            matched = True
            spans.append(m.span())
        if m := RE_COLOR.search(line):
            fields.setdefault("color", m.group(1).strip())
            matched = True
            spans.append(m.span())
        if m := RE_PRICE.search(line):
            fields["sku_price"] = norm_num(m.group(1))
            cur = parse_currency(line) or (m.group(2) or "").upper() or None
            if cur:
                fields["sku_price_currency"] = CURRENCY_TOKENS.get(cur, cur)
            matched = True
            spans.append(m.span())
        if m := RE_WEIGHT.search(line):
            fields["weight"] = {"value": m.group(1), "unit": m.group(2) or "g"}
            matched = True
            spans.append(m.span())
        if m := RE_LENGTH.search(line):
            fields["length"] = {"value": m.group(1), "unit": m.group(2) or "m"}
            matched = True
            spans.append(m.span())
        if m := RE_VOLUME.search(line):
            unit = {"ml": "mL", "毫升": "mL", "公升": "L"}.get(m.group(2), m.group(2))
            fields["volume"] = {"value": m.group(1), "unit": unit}
            matched = True
            spans.append(m.span())
        if m := RE_DIMS.search(line):
            unit = m.group(4) or "cm"
            fields["length"] = {"value": m.group(1), "unit": unit}
            fields["width"] = {"value": m.group(2), "unit": unit}
            fields["height"] = {"value": m.group(3), "unit": unit}
            matched = True
            spans.append(m.span())
        if mv := RE_VARIANT.search(line):
            flags.append(f"variant_qty:{line}")
            fields.setdefault("quantity", 1)
            matched = True
            spans.append(mv.span())
        elif m := RE_QTY.search(line):
            fields["quantity"] = int(m.group(1))
            matched = True
            spans.append(m.span())
        elif m := RE_QTY_EXPR.search(line):
            fields["quantity"] = int(m.group(1))
            matched = True
            spans.append(m.span())

        if not matched:
            residue.append(line)
        else:
            # No-data-loss (FR-029d): if meaningful content remains OUTSIDE
            # the matched key/value spans, keep the WHOLE line as remark —
            # extraction must never drop surrounding prose.
            blanked = list(line)
            for start, end in spans:
                for i in range(start, end):
                    blanked[i] = " "
            leftover = "".join(blanked)
            if re.search(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{2,}|\d", leftover):
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
            pv = norm_num(price)
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
            val = norm_num(price)
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
            pv = norm_num(price)
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
