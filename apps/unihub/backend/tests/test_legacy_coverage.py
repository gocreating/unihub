"""FR-029d content-coverage sweep: no legacy text may be lost by the parser.

Walks every REAL sheet under data/財產們/ (skipped when the data directory is
absent, e.g. in containers/CI) and asserts that every own (non-rowspan-carried)
項目 cell, 購買地點 cell, and every non-empty 備註 line is findable in the
parser's built payloads. Date/price/currency cells are exempt (transformed by
design and locked by dedicated tests); resolved ``key：value`` 備註 lines pass
when their value tokens survive (e.g. 單價 → cost factors / sku fields).
"""

import pathlib
import re

import pytest

from inventory.management.commands.import_legacy_csv import _load_parser

DATA_DIR = pathlib.Path(__file__).resolve().parents[4] / "data" / "財產們"

pytestmark = pytest.mark.skipif(
    not DATA_DIR.exists(), reason="legacy data directory not present"
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def _sheet_blob(acquisitions) -> str:
    """Every piece of text the parser preserved, joined and normalized."""
    parts: list[str] = []
    for acq in acquisitions:
        parts += [
            acq.source or "",
            acq.request_time or "",
            acq.obtained_at or "",
            getattr(acq, "remark", "") or "",
        ]
        for cf in acq.cost_factors:
            parts += [str(cf.value if cf.value is not None else ""), cf.currency or "", cf.type or ""]
        for item in acq.items:
            parts.append(item.name or "")
            for value in item.fields.values():
                if isinstance(value, dict):
                    parts += [str(v) for v in value.values()]
                else:
                    parts.append(str(value))
    return _norm("|".join(parts))


# Key words the parser CONSUMES into structured fields (their values are
# checked instead); currency spellings map to codes in the payload.
CONSUMED_KEYS = {
    "尺寸", "規格", "顏色", "款式", "重量", "淨重", "長度", "容量", "數量",
    "原價", "單價", "運費", "官網連結", "size", "Size",
}


def _run_covered(run: str, blob: str, parser) -> bool:
    """One lexical run (number / latin word / CJK word) survives somewhere."""
    n = run.replace(",", "")
    if re.fullmatch(r"\d[\d.]*", n):
        candidates = {n, f"{n}.0"}
        try:
            candidates.add(str(float(n)))
            candidates.add(str(int(float(n))))
        except ValueError:
            pass
        return any(c in blob for c in candidates)
    if len(run) == 1:
        return True  # single-char units/particles (m, g, 件, x, …)
    if run in CONSUMED_KEYS:
        return True
    mapped = parser.CURRENCY_TOKENS.get(run) or parser.CURRENCY_TOKENS.get(run.upper()) or parser.CURRENCY_TOKENS.get(run.lower())
    if mapped and _norm(mapped) in blob:
        return True
    return _norm(run) in blob or _norm(run).upper() in blob


def _runs(text: str) -> list[str]:
    return re.findall(r"\d[\d.,]*|[A-Za-z]+|[\u4e00-\u9fff]+", text)


def _line_covered(line: str, blob: str, parser) -> bool:
    if _norm(line) in blob:
        return True
    # Transformed lines (resolved keys, factor amounts) pass when every
    # meaningful lexical run of the line survives into some payload field.
    # A line with NO lexical runs ('-', '??' placeholders) has nothing to lose.
    return all(_run_covered(r, blob, parser) for r in _runs(line))


def _sheet_cases():
    return sorted(DATA_DIR.glob("*.html")) if DATA_DIR.exists() else []


@pytest.mark.parametrize("sheet", _sheet_cases(), ids=lambda p: p.stem)
def test_no_legacy_content_lost(sheet):
    parser = _load_parser()
    acquisitions = parser.build_html(str(sheet))
    blob = _sheet_blob(acquisitions)

    # Re-walk the raw grid exactly like build_html does.
    html_text = sheet.read_text(encoding="utf-8")
    html_parser = parser._SheetHTMLParser(parser._struck_classes(html_text))
    html_parser.feed(html_text)
    col_idx = None
    misses: list[str] = []
    for row_no, grid_row in enumerate(html_parser.rows):
        texts = [c["text"].strip() for c in grid_row]
        if col_idx is None:
            if "項目" in texts:
                col_idx = {h: texts.index(h) for h in parser.HEADERS if h in texts}
            continue

        def cell(header):
            i = col_idx.get(header)
            return grid_row[i] if i is not None and i < len(grid_row) else {"text": "", "link": ""}

        name = cell("項目")["text"].strip()
        price = cell("實際支付價錢")["text"].strip()
        if parser.is_summary([name, price]):
            continue
        # Crossed-out rows are intentionally skipped by the parser (FR-029e).
        if cell("項目").get("struck") and not cell("項目").get("carried"):
            continue

        # 項目: own cells only; cost-factor keyword rows are transformed.
        name_cell = cell("項目")
        if name and not name_cell.get("carried") and not parser.classify_cost_factor(name):
            if _norm(name) not in blob:
                misses.append(f"row {row_no} 項目: {name!r}")

        loc_cell = cell("購買地點")
        location = loc_cell["text"].strip()
        if location and not loc_cell.get("carried") and _norm(location) not in blob:
            misses.append(f"row {row_no} 購買地點: {location!r}")

        # 購買日期 cells joined the sweep in iteration 23 (FR-029e c): date
        # tokens surface as parsed ISO dates; leftovers live in acq.remark.
        date_cell = cell("購買日期")
        if not date_cell.get("carried"):
            for line in date_cell["text"].splitlines():
                line = line.strip()
                if line and not _line_covered(line, blob, parser):
                    misses.append(f"row {row_no} 購買日期 line: {line!r}")

        remark_cell = cell("備註")
        if not remark_cell.get("carried"):
            for line in remark_cell["text"].splitlines():
                line = line.strip()
                if line and not _line_covered(line, blob, parser):
                    misses.append(f"row {row_no} 備註 line: {line!r}")

    assert not misses, f"{sheet.name}: {len(misses)} lost fragment(s):\n" + "\n".join(misses[:25])
