"""Iteration 15: legacy HTML parser regression tests (FR-029a).

Locks the confirmed defects: rowspan-merged 購買日期 cells must reach every
spanned acquisition WITHOUT breaking continuation-row grouping; bare keyless
備註 lines (代買) must survive into the item remark; date ranges still split
into request/obtained.
"""

import pytest

from inventory.management.commands.import_legacy_csv import _load_parser

HEADER = (
    "<tr><td></td><td>項目</td><td>實際支付價錢</td><td>貨幣</td>"
    "<td>購買地點</td><td>購買日期</td><td>備註</td></tr>"
)

# ShopA: two continuation items (price/currency/location/date rowspan over both
# rows). ShopB: its OWN location/price but the DATE cell is the tail of a
# rowspan shared with ShopA's block (the MUJI 武商夢時代 case). ShopC: a range
# date and a BLANK paid column.
FIXTURE = f"""
<table>
{HEADER}
<tr><td>1</td><td><a href="http://x/a1">ItemA1</a></td><td rowspan="2">100</td>
<td rowspan="2">RMB</td><td rowspan="2">ShopA</td><td rowspan="3">2026/04/25</td>
<td>單價：50 RMB</td></tr>
<tr><td>2</td><td>ItemA2</td><td>單價：30 RMB</td></tr>
<tr><td>3</td><td>ItemB</td><td>0</td><td>RMB</td><td>ShopB</td>
<td>單價：80 RMB<br>代買</td></tr>
<tr><td>4</td><td>ItemC</td><td></td><td>RMB</td><td>ShopC</td>
<td>2026/06/25~2026/06/26</td><td>單價：63 RMB</td></tr>
</table>
"""


@pytest.fixture(scope="module")
def parser():
    return _load_parser()


@pytest.fixture()
def acquisitions(parser, tmp_path):
    path = tmp_path / "fixture.html"
    path.write_text(FIXTURE, encoding="utf-8")
    return parser.build_html(str(path))


def test_rowspan_covered_rows_stay_continuations(acquisitions):
    """Carried price/location/date cells must NOT split a multi-item acquisition."""
    shop_a = next(a for a in acquisitions if a.source == "ShopA")
    assert [it.name for it in shop_a.items] == ["ItemA1", "ItemA2"]


def test_rowspan_date_reaches_following_acquisition(acquisitions):
    """The MUJI 武商夢時代 case: a new acquisition under a spanned date cell keeps the date."""
    shop_b = next(a for a in acquisitions if a.source == "ShopB")
    assert shop_b.obtained_at == "2026-04-25"
    assert [it.name for it in shop_b.items] == ["ItemB"]


def test_bare_remark_lines_survive(acquisitions):
    """代買 (keyless 備註 line) lands in the item remark — no data loss."""
    shop_b = next(a for a in acquisitions if a.source == "ShopB")
    assert shop_b.items[0].fields.get("remark") == "代買"
    assert shop_b.items[0].fields.get("sku_price") == 80.0


def test_date_range_still_splits(acquisitions):
    shop_c = next(a for a in acquisitions if a.source == "ShopC")
    assert shop_c.request_time == "2026-06-25"
    assert shop_c.obtained_at == "2026-06-26"


def test_blank_paid_yields_none_not_zero(acquisitions):
    """A blank 實際支付價錢 must surface as None (unrecorded), never 0 (FR-029a c)."""
    shop_c = next(a for a in acquisitions if a.source == "ShopC")
    accumulated = [cf for cf in shop_c.cost_factors if cf.type == "accumulated"]
    assert all(cf.value is None for cf in accumulated) or not accumulated
    # ShopB's explicit 0 stays an explicit 0.
    shop_b = next(a for a in acquisitions if a.source == "ShopB")
    explicit = [cf for cf in shop_b.cost_factors if cf.type == "accumulated"]
    assert explicit and explicit[0].value == 0.0


@pytest.mark.django_db
class TestImportCommand:
    """FR-029a (c) + --wipe: blank paid keeps the derived accumulated; wipe re-imports cleanly."""

    def _run(self, tmp_path, *flags):
        from django.core.management import call_command

        path = tmp_path / "fixture.html"
        path.write_text(FIXTURE, encoding="utf-8")
        call_command("import_legacy_csv", str(path), *flags)

    def test_blank_paid_keeps_derived_accumulated(self, tmp_path, auth_client):
        from inventory.models import Acquisition

        self._run(tmp_path, "--commit")
        shop_c = Acquisition.objects.get(source="ShopC")
        acc = shop_c.cost_factors.filter(type="accumulated")
        # Derived from the item's 單價 63 CNY — NOT a fabricated zero.
        assert acc.count() == 1
        assert float(acc.first().value) == 63.0
        # ShopB's explicit 0 stays an explicit 0 override.
        shop_b = Acquisition.objects.get(source="ShopB")
        assert float(shop_b.cost_factors.get(type="accumulated").value) == 0.0
        # Bare 備註 line survived into the item remark.
        assert shop_b.items.first().remark == "代買"
        # Rowspan-shared date reached ShopB.
        assert shop_b.obtained_at is not None

    def test_wipe_reimport_is_idempotent(self, tmp_path, auth_client):
        from inventory.models import Acquisition, Item

        self._run(tmp_path, "--commit")
        first = (Acquisition.objects.count(), Item.objects.count())
        self._run(tmp_path, "--commit", "--wipe")
        assert (Acquisition.objects.count(), Item.objects.count()) == first


# Iteration 17 (FR-029b): the 2025 sheet carries float-derived tax refunds with
# more than 4 decimal places (e.g. -762.675402 JPY) on their own keyword row —
# the importer must round to the CostFactor field's 4dp precision instead of
# failing serializer validation.
LONG_DECIMAL_FIXTURE = f"""
<table>
{HEADER}
<tr><td>1</td><td>ItemJ</td><td>3740</td><td>JPY</td><td>ShopJ</td>
<td>2025/10/05</td><td>單價：3740 JPY</td></tr>
<tr><td>2</td><td>退稅</td><td>-762.675402</td><td>JPY</td><td></td><td></td><td></td></tr>
</table>
"""


@pytest.mark.django_db
def test_long_decimal_factor_rounds_to_4dp(tmp_path, auth_client):
    from django.core.management import call_command

    from inventory.models import Acquisition

    path = tmp_path / "fixture.html"
    path.write_text(LONG_DECIMAL_FIXTURE, encoding="utf-8")
    call_command("import_legacy_csv", str(path), "--commit")
    shop_j = Acquisition.objects.get(source="ShopJ")
    refund = shop_j.cost_factors.exclude(type="accumulated").get()
    assert float(refund.value) == pytest.approx(-762.6754)


# Iteration 20 (FR-029d): a rowspan-carried 項目 row must NOT mint a new item —
# its own 備註 content merges into the current item's spec (the LG 24MP68VQ-P
# ×4 duplication regression).
CONTINUATION_FIXTURE = f"""
<table>
{HEADER}
<tr><td>1</td><td rowspan="3">LG Monitor</td><td rowspan="3">6099</td>
<td rowspan="3">TWD</td><td rowspan="3">ShopF</td><td rowspan="3">2016/11/11</td>
<td>2019/03/04 嚴重閃爍故障</td></tr>
<tr><td>2</td><td>2019/03/12 報修，維修單號: RNP123</td></tr>
<tr><td>3</td><td>2019/03/15 更換面板後送回</td></tr>
<tr><td>4</td><td>OtherThing</td><td>100</td><td>TWD</td><td>ShopG</td>
<td>2016/12/01</td><td></td></tr>
</table>
"""


@pytest.fixture()
def continuation_acqs(parser, tmp_path):
    path = tmp_path / "cont.html"
    path.write_text(CONTINUATION_FIXTURE, encoding="utf-8")
    return parser.build_html(str(path))


def test_carried_item_rows_merge_remarks_into_spec(continuation_acqs):
    shop_f = next(a for a in continuation_acqs if a.source == "ShopF")
    assert len(shop_f.items) == 1
    item = shop_f.items[0]
    assert item.name == "LG Monitor"
    # Continuation-row 備註 lines land in spec, newline-joined, sheet order.
    spec = item.fields.get("spec", "")
    assert "2019/03/12 報修，維修單號: RNP123" in spec
    assert "2019/03/15 更換面板後送回" in spec
    assert spec.index("2019/03/12") < spec.index("2019/03/15")
    # The own-row bare line keeps the iteration-15 rule (remark).
    assert "2019/03/04 嚴重閃爍故障" in item.fields.get("remark", "")
    # The following acquisition is untouched.
    shop_g = next(a for a in continuation_acqs if a.source == "ShopG")
    assert len(shop_g.items) == 1


def test_date_rules_locked(parser):
    # Single date → obtained only; open range → requested only; same-day
    # range → both; ??~date → obtained only.
    assert parser.parse_date("2026/07/10")[:2] == (None, "2026-07-10")
    assert parser.parse_date("2026/07/10~")[:2] == ("2026-07-10", None)
    assert parser.parse_date("2026/07/09~2026/07/09")[:2] == ("2026-07-09", "2026-07-09")
    req, obt = parser.parse_date("??~2016/11/03")[:2]
    assert obt == "2016-11-03"
    assert req is None  # garbage left side never becomes a date


# Iteration 20 (FR-029d, sweep-surfaced): no 備註 content may be lost.
def test_colonless_price_with_qty_expression(parser):
    fields, _ = parser.parse_remark("單價 179 * 2 件")
    assert fields.get("quantity") == 2
    assert fields.get("sku_price") == 179.0  # the price part must not be lost


def test_variant_quantity_line_survives_in_remark(parser):
    fields, flags = parser.parse_remark("數量：深藍x2，灰色x1")
    assert any(f.startswith("variant_qty") for f in flags)
    # The descriptive text persists (remark) — flags alone are not storage.
    assert "深藍x2，灰色x1" in fields.get("remark", "")


def test_prose_around_matched_keys_survives(parser):
    # A line with prose AROUND resolved keys keeps the full line in remark
    # (extraction is a bonus, never a licence to drop context — FR-029d).
    fields, _ = parser.parse_remark("大傘，可兩人撐，原價850，搭配活動折價125")
    assert fields.get("sku_price") == 850.0
    assert "大傘，可兩人撐" in fields.get("remark", "")
    assert "搭配活動折價125" in fields.get("remark", "")
    # A fully-consumed key:value line still leaves NO residue.
    clean, _ = parser.parse_remark("尺寸：L")
    assert "remark" not in clean


def test_factor_amounts_with_currency_adornments(parser, tmp_path):
    # 退稅-style factor rows carry their amount in 備註 with unicode minus /
    # currency symbols / words — the amount must survive into the factor.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>ItemK</td><td>1500</td><td>JPY</td><td>ShopK</td>
<td>2026/01/05</td><td>單價：1500 JPY</td></tr>
<tr><td>2</td><td>退稅</td><td></td><td></td><td></td><td></td><td>−￥1,450</td></tr>
<tr><td>3</td><td>折價</td><td></td><td></td><td></td><td></td><td>-735yen</td></tr>
</table>
"""
    path = tmp_path / "factors.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    values = {cf.type: (cf.value, cf.currency) for cf in acq.cost_factors if cf.type != "accumulated"}
    assert values["tax_refund"] == (-1450.0, "JPY")
    assert values["discount"] == (-735.0, "JPY")


# Iteration 23 (FR-029e): date-cell no-data-loss + strikethrough skip.
def test_dayless_date_resolves_to_month_end(parser, tmp_path):
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>Luggage</td><td>1400</td><td>TWD</td><td>ShopL</td>
<td>2016/02/??</td><td></td></tr>
</table>
"""
    path = tmp_path / "d.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    assert acq.request_time is None
    assert acq.obtained_at == "2016-02-29"  # leap-aware month end


def test_multiline_date_cell_latest_wins_and_text_survives(parser, tmp_path):
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>Sofa</td><td>4930</td><td>TWD</td><td>momo</td>
<td>2020/05/09<br>~2020/05/10(本體)<br>~2020/05/11(椅套)</td><td></td></tr>
</table>
"""
    path = tmp_path / "m.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    assert acq.request_time == "2020-05-09"
    assert acq.obtained_at == "2020-05-11"  # the LATEST date
    # The full original cell text survives (本體/椅套 annotations).
    assert "本體" in acq.remark and "椅套" in acq.remark


def test_missing_dates_default_to_sheet_year_end(parser, tmp_path):
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>Glasses</td><td>13000</td><td>TWD</td><td>ShopG</td>
<td>-</td><td>賽璐珞材質</td></tr>
</table>
"""
    path = tmp_path / "2015.html"  # sheet year from the FILENAME
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    assert acq.obtained_at == "2015-12-31"
    assert "defaulted_eoy" in acq.flags


def test_struck_item_rows_are_skipped(parser, tmp_path):
    fixture = f"""
<html><head><style>
.x .y .s9 {{ text-decoration: line-through; color: #999; }}
</style></head><body>
<table>
{HEADER}
<tr><td>1</td><td class="s9">Dead item</td><td>100</td><td>TWD</td><td>ShopD</td>
<td>2019/01/05</td><td>skip me</td></tr>
<tr><td>2</td><td>Alive item</td><td>200</td><td>TWD</td><td>ShopA</td>
<td>2019/01/06</td><td></td></tr>
</table>
</body></html>
"""
    path = tmp_path / "s.html"
    path.write_text(fixture, encoding="utf-8")
    acqs = parser.build_html(str(path))
    names = [i.name for a in acqs for i in a.items]
    assert "Dead item" not in names
    assert "Alive item" in names
    # A struck HEADER still creates its acquisition so live continuation
    # items under its rowspans survive (the 2019 H&M case).
    shop_d = next(a for a in acqs if a.source == "ShopD")
    assert shop_d.items == []
    assert shop_d.obtained_at == "2019-01-05"
