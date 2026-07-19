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
    # FR-029f b: ShopB has ONE item — its whole 備註 (incl. the bare 代買
    # line) is preserved verbatim on the ACQUISITION remark.
    shop_b = next(a for a in acquisitions if a.source == "ShopB")
    assert "代買" in shop_b.remark
    assert "單價：80 RMB" in shop_b.remark
    # Extraction still ran on top (單價 → sku).
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
        # Bare 備註 line survived verbatim on the acquisition remark.
        assert "代買" in shop_b.remark
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
    # The own-row 備註 is preserved verbatim on the acquisition (single-item
    # acquisition, FR-029f b).
    shop_f_acq = next(a for a in continuation_acqs if a.source == "ShopF")
    assert "2019/03/04 嚴重閃爍故障" in shop_f_acq.remark
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
    # Colonless 原價/單價 inside prose is NOT a key-value pair (iteration 35) —
    # nothing extracts; every prose segment survives in remark (FR-029d/029j).
    fields, _ = parser.parse_remark("大傘，可兩人撐，原價850，搭配活動折價125")
    assert "sku_price" not in fields
    for piece in ("大傘", "可兩人撐", "原價850", "搭配活動折價125"):
        assert piece in fields.get("remark", "")
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


# Iteration 25 (FR-029f a+b): per-row prices + verbatim 備註 destinations.
MATADOR_FIXTURE = f"""
<table>
{HEADER}
<tr><td>1</td><td>Matador Tube</td><td>479</td><td>TWD</td>
<td rowspan="3">蝦皮S</td><td rowspan="3">2025/12/09~2025/12/11</td>
<td>顏色：黑</td></tr>
<tr><td>2</td><td>Matador Case</td><td>999</td><td>TWD</td><td>顏色：黑 重量：28.8g</td></tr>
<tr><td>3</td><td>Matador Bag</td><td>1299</td><td>TWD</td><td>容量：30L</td></tr>
</table>
"""


def test_per_row_prices_become_skus_and_sum_override(parser, tmp_path):
    path = tmp_path / "mat.html"
    path.write_text(MATADOR_FIXTURE, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    skus = {i.name: i.fields.get("sku_price") for i in acq.items}
    assert skus == {"Matador Tube": 479.0, "Matador Case": 999.0, "Matador Bag": 1299.0}
    # Paid override = per-currency SUM of the own row prices (not just 479).
    acc = [cf for cf in acq.cost_factors if cf.type == "accumulated"]
    assert len(acc) == 1 and acc[0].value == 479.0 + 999.0 + 1299.0 and acc[0].currency == "TWD"
    # Verbatim 備註 → item.spec (multi-item acquisition).
    case = next(i for i in acq.items if i.name == "Matador Case")
    assert "顏色：黑 重量：28.8g" in case.fields.get("spec", "")
    # Extraction still runs on top.
    assert case.fields.get("weight", {}).get("value") == "28.8"


def test_single_row_price_becomes_sku(parser, tmp_path):
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>ASUS Zenfone 3</td><td>5600</td><td>TWD</td><td>ShopZ</td>
<td>2016/08/06</td><td>忘記實際花了多少錢，約5600</td></tr>
</table>
"""
    path = tmp_path / "z.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    assert acq.items[0].fields.get("sku_price") == 5600.0
    # Verbatim 備註 → acquisition.remark (single-item acquisition).
    assert "忘記實際花了多少錢" in acq.remark


def test_qty_row_price_divides_into_unit_sku(parser, tmp_path):
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>Socks</td><td>300</td><td>TWD</td><td>ShopQ</td>
<td>2020/01/05</td><td>數量：3</td></tr>
</table>
"""
    path = tmp_path / "q.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    item = acq.items[0]
    assert item.fields.get("quantity") == 3
    assert item.fields.get("sku_price") == 100.0  # 300 / 3


def test_rowspan_total_style_unchanged(parser, tmp_path):
    # ShopA style: price cell rowspans (a TOTAL), items get 備註 單價.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>ItemA1</td><td rowspan="2">100</td><td rowspan="2">RMB</td>
<td rowspan="2">ShopT</td><td rowspan="2">2026/04/25</td><td>單價：50 RMB</td></tr>
<tr><td>2</td><td>ItemA2</td><td>單價：30 RMB</td></tr>
</table>
"""
    path = tmp_path / "t.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    acc = [cf for cf in acq.cost_factors if cf.type == "accumulated"]
    assert len(acc) == 1 and acc[0].value == 100.0  # the header TOTAL stands
    skus = {i.name: i.fields.get("sku_price") for i in acq.items}
    assert skus == {"ItemA1": 50.0, "ItemA2": 30.0}


# Iteration 25 (FR-029f c): stable-ref UPSERT — re-imports preserve item PKs.
UPSERT_FIXTURE_V1 = f"""
<table>
{HEADER}
<tr><td>1</td><td>KeeperA</td><td>100</td><td>TWD</td><td>ShopU</td>
<td>2021/03/05</td><td>first note</td></tr>
<tr><td>2</td><td>KeeperB</td><td>200</td><td>TWD</td><td>ShopV</td>
<td>2021/03/06</td><td></td></tr>
</table>
"""
UPSERT_FIXTURE_V2 = UPSERT_FIXTURE_V1.replace("first note", "edited note")
UPSERT_FIXTURE_V3 = f"""
<table>
{HEADER}
<tr><td>1</td><td>KeeperA</td><td>100</td><td>TWD</td><td>ShopU</td>
<td>2021/03/05</td><td>first note</td></tr>
</table>
"""


@pytest.mark.django_db
class TestUpsertImport:
    def _run(self, tmp_path, content, *flags):
        from django.core.management import call_command

        path = tmp_path / "2021.html"
        path.write_text(content, encoding="utf-8")
        call_command("import_legacy_csv", str(path), "--commit", *flags)

    def test_reimport_preserves_item_pks_and_memberships(self, tmp_path, auth_client):
        from inventory.models import Item, Scenario, ScenarioItem

        self._run(tmp_path, UPSERT_FIXTURE_V1)
        keeper = Item.objects.get(name="KeeperA")
        assert keeper.legacy_ref == "2021:0:0"
        # Attach a scenario membership (the data re-imports must never clear).
        scenario = Scenario.objects.create(name="Trip")
        membership = ScenarioItem.objects.create(scenario=scenario, item=keeper)
        # Re-import with an edited 備註 → UPDATE IN PLACE.
        self._run(tmp_path, UPSERT_FIXTURE_V2)
        keeper.refresh_from_db()
        assert Item.objects.get(name="KeeperA").pk == keeper.pk
        assert "edited note" in keeper.acquisition.remark
        assert ScenarioItem.objects.filter(pk=membership.pk, item=keeper).exists()
        # A row removed from the sheet deletes its (and only its) records.
        self._run(tmp_path, UPSERT_FIXTURE_V3)
        assert Item.objects.filter(name="KeeperA").exists()
        assert not Item.objects.filter(name="KeeperB").exists()

    def test_manual_records_untouched_and_alias_preserved(self, tmp_path, auth_client):
        from inventory.models import Acquisition, Item

        self._run(tmp_path, UPSERT_FIXTURE_V1)
        # Alias set by the user must survive a re-import.
        keeper = Item.objects.get(name="KeeperA")
        keeper.alias_name = "My keeper"
        keeper.save(update_fields=["alias_name"])
        # A manual (ref-less) acquisition must be untouched by re-imports.
        manual = Acquisition.objects.create(source="Manual")
        Item.objects.create(acquisition=manual, name="Manual item")
        self._run(tmp_path, UPSERT_FIXTURE_V1)
        assert Item.objects.get(name="KeeperA").alias_name == "My keeper"
        assert Item.objects.filter(name="Manual item").exists()

    def test_legacy_ref_not_in_api_payload(self, tmp_path, auth_client):
        self._run(tmp_path, UPSERT_FIXTURE_V1)
        data = auth_client.get("/api/v1/inventory/items/").json()["results"][0]
        assert "legacy_ref" not in data
        acq = auth_client.get("/api/v1/inventory/acquisitions/").json()["results"][0]
        assert "legacy_ref" not in acq


# Iteration 26 (FR-029g): 尺寸 triplets/pairs split into 長/寬/高 parameters.
def test_size_triplet_splits_into_lwh(parser):
    fields, _ = parser.parse_remark("尺寸：14 x 15 x 5cm")
    assert fields.get("length") == {"value": "14", "unit": "cm"}
    assert fields.get("width") == {"value": "15", "unit": "cm"}
    assert fields.get("height") == {"value": "5", "unit": "cm"}
    assert "size" not in fields  # fully consumed → no separate size param
    assert "remark" not in fields


def test_size_uppercase_and_star_separators(parser):
    fields, _ = parser.parse_remark("14X15X5cm")
    assert fields.get("length") == {"value": "14", "unit": "cm"}
    assert fields.get("width") == {"value": "15", "unit": "cm"}
    assert fields.get("height") == {"value": "5", "unit": "cm"}
    pair, _ = parser.parse_remark("尺寸：37*19.8cm")
    assert pair.get("length") == {"value": "37", "unit": "cm"}
    assert pair.get("width") == {"value": "19.8", "unit": "cm"}
    assert "height" not in pair
    assert "size" not in pair


def test_size_triplet_honours_unit(parser):
    fields, _ = parser.parse_remark("尺寸：10 × 20 × 30 mm")
    assert fields.get("length") == {"value": "10", "unit": "mm"}
    assert fields.get("width") == {"value": "20", "unit": "mm"}
    assert fields.get("height") == {"value": "30", "unit": "mm"}


def test_non_dimensional_size_stays_size_param(parser):
    fields, _ = parser.parse_remark("尺寸：L")
    assert fields.get("size") == "L"
    assert "length" not in fields


def test_size_with_extra_prose_keeps_verbatim_size(parser):
    # Dims still extracted, but un-consumed prose means the verbatim size
    # content must survive (FR-029d — extraction never drops context).
    fields, _ = parser.parse_remark("尺寸：14 x 15 x 5cm 附收納袋")
    assert fields.get("length") == {"value": "14", "unit": "cm"}
    assert fields.get("size") == "14 x 15 x 5cm 附收納袋"


# Iteration 28 (FR-029h): keyed numeric 備註 patterns capture min~max ranges.
def test_keyed_length_range_captured_verbatim(parser):
    fields, _ = parser.parse_remark("長度：74~164cm")
    assert fields.get("length") == {"value": "74~164", "unit": "cm"}
    assert "remark" not in fields  # fully consumed — nothing left over


def test_keyed_weight_and_volume_ranges(parser):
    w, _ = parser.parse_remark("重量：30-45g")
    assert w.get("weight") == {"value": "30-45", "unit": "g"}
    v, _ = parser.parse_remark("容量：1~2L")
    assert v.get("volume") == {"value": "1~2", "unit": "L"}


def test_keyed_single_values_unchanged(parser):
    fields, _ = parser.parse_remark("長度：74cm")
    assert fields.get("length") == {"value": "74", "unit": "cm"}
    w, _ = parser.parse_remark("重量：26.5g")
    assert w.get("weight") == {"value": "26.5", "unit": "g"}


# Iteration 30 (FR-029h): 寬度/高度/直徑/耐溫 keyed extraction, signed ranges.
def test_keyed_width_height_diameter(parser):
    w, _ = parser.parse_remark("寬度：3.3cm")
    assert w.get("width") == {"value": "3.3", "unit": "cm"}
    h, _ = parser.parse_remark("高度：1.8~8cm")
    assert h.get("height") == {"value": "1.8~8", "unit": "cm"}
    d, _ = parser.parse_remark("直徑：5.5~9cm")
    assert d.get("diameter") == {"value": "5.5~9", "unit": "cm"}
    assert "remark" not in d  # fully consumed


def test_keyed_temperature_with_signed_range_and_unit_normalization(parser):
    t, _ = parser.parse_remark("耐溫：-40~230度C")
    assert t.get("temperature") == {"value": "-40~230", "unit": "°C"}
    assert "remark" not in t
    t2, _ = parser.parse_remark("耐溫：120℃")
    assert t2.get("temperature") == {"value": "120", "unit": "°C"}


# Iteration 35 (FR-029f): price extraction requires a key-value form.
def test_colon_price_still_extracts(parser):
    # 單價 (the actual unit price) extracts; 原價 (pre-discount list price)
    # NEVER sets the sku directly (iteration 39).
    unit, _ = parser.parse_remark("單價：7.74 RMB")
    assert unit.get("sku_price") == 7.74
    listp, _ = parser.parse_remark("原價：850")
    assert "sku_price" not in listp


def test_colonless_prose_price_does_not_extract(parser):
    # 2025 雨傘王: "原價 650，舊換新打8折 = 520" — prose, not a pair.
    fields, _ = parser.parse_remark("原價 650，舊換新打8折 = 520")
    assert "sku_price" not in fields
    assert "原價 650" in fields.get("remark", "")


def test_colonless_qty_expression_price_still_extracts(parser):
    # The quantity-expression form stays colonless for 單價 ("單價 179 * 2 件");
    # 原價 in the same shape contributes ONLY the quantity (iteration 39).
    fields, _ = parser.parse_remark("單價 179 * 2 件")
    assert fields.get("sku_price") == 179.0
    assert fields.get("quantity") == 2
    muji, _ = parser.parse_remark("原價 199 * 3 件 - 折價券 30")
    assert "sku_price" not in muji
    assert muji.get("quantity") == 3


def test_adorned_paid_cell_parses(parser):
    # "¥4,200" in the 實際支付價錢 column → 4200 (currency from its own column).
    assert parser.extract_amount("¥4,200") == 4200.0
    assert parser.norm_num("¥4,200") is None  # documents why extract_amount is used


def test_adorned_paid_cell_full_pipeline(parser, tmp_path):
    # 2016 東京迪士尼: the paid cell is "¥4,200" with JPY in the currency
    # column — 4200 JPY, and the single-row price becomes the item's sku.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>維尼披風</td><td>¥4,200</td><td>JPY</td><td>東京迪士尼</td>
<td>2016/03/21</td><td></td></tr>
</table>
"""
    path = tmp_path / "yen.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    assert acq.items[0].fields.get("sku_price") == 4200.0
    assert any(cf.value == 4200.0 and cf.currency == "JPY" for cf in acq.cost_factors)


def test_umbrella_prose_price_uses_paid_not_prose(parser, tmp_path):
    # 2016 雨傘王: 備註 has NO key-value pair — the sku derives from the paid
    # column (725), never from "原價850" inside prose (iteration 35).
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>雨傘王雨傘</td><td>725</td><td>TWD</td><td>新竹光復路一段雨傘王專店</td>
<td>2016/1/15</td><td>大傘，可兩人撐，原價850，搭配活動折價125</td></tr>
</table>
"""
    path = tmp_path / "umb.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    assert acq.items[0].fields.get("sku_price") == 725.0
    assert "原價850" in acq.remark


# Iteration 36 (FR-029g): per-unit dims — the unit rides EACH number.
def test_per_unit_two_part_dims(parser):
    fields, _ = parser.parse_remark("50cm * 75cm")
    assert fields.get("length") == {"value": "50", "unit": "cm"}
    assert fields.get("width") == {"value": "75", "unit": "cm"}
    tight, _ = parser.parse_remark("183cmx 61cm")
    assert tight.get("length") == {"value": "183", "unit": "cm"}
    assert tight.get("width") == {"value": "61", "unit": "cm"}
    mm, _ = parser.parse_remark("3.5mmx1.3mm 60cm")
    assert mm.get("length") == {"value": "3.5", "unit": "mm"}
    assert mm.get("width") == {"value": "1.3", "unit": "mm"}


def test_per_unit_triplet_keeps_mixed_units(parser):
    fields, _ = parser.parse_remark("172cm x 58 cm x 4 mm")
    assert fields.get("length") == {"value": "172", "unit": "cm"}
    assert fields.get("width") == {"value": "58", "unit": "cm"}
    assert fields.get("height") == {"value": "4", "unit": "mm"}


def test_size_label_with_parenthesised_dims_keeps_label(parser):
    # 尺寸：S (40cm x 80cm) — the dims extract and the size keeps ONLY the
    # label (iteration 42 supersedes the verbatim-keep rule).
    fields, _ = parser.parse_remark("尺寸：S (40cm x 80cm)")
    assert fields.get("length") == {"value": "40", "unit": "cm"}
    assert fields.get("width") == {"value": "80", "unit": "cm"}
    assert fields.get("size") == "S"


# Iteration 39 (FR-029i): 原價 is never the sku; discounts compute; currency inherits.
def test_own_paid_divided_by_qty_beats_list_price(parser, tmp_path):
    # HEATTECH: paid 760 for 2 pieces; 原價590 is the pre-discount list price.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>(一灰一白)HEATTECH9分袖發熱衣</td><td>760</td><td>TWD</td>
<td>Uniqlo感謝祭</td><td>2016/12/16</td><td>發熱衣原價590 * 2件，尺寸XL，折後760</td></tr>
</table>
"""
    path = tmp_path / "ht.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    f = acq.items[0].fields
    assert f.get("quantity") == 2
    assert f.get("sku_price") == 380.0  # 760 / 2 — never 原價 590
    assert f.get("sku_price_currency") == "TWD"


def test_underwear_own_paid_divides(parser, tmp_path):
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>內褲*2</td><td>318</td><td>TWD</td><td>NET</td>
<td>2018/06/02</td><td>原價159 * 2件，size: L</td></tr>
</table>
"""
    path = tmp_path / "uw.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    f = acq.items[0].fields
    assert f.get("quantity") == 2
    assert f.get("sku_price") == 159.0
    assert f.get("sku_price_currency") == "TWD"


def test_shared_total_with_discount_notes_computes_skus(parser, tmp_path):
    # 失落文明 + 霍金: ONE rowspan paid (702) covers both books; each 備註
    # carries 原價X，9折 → skus 252 / 450 (they sum to the shared total).
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>《失落文明大百科》</td><td rowspan="2">702</td>
<td rowspan="2">TWD</td><td rowspan="2">嘉義鴻圖書局</td><td rowspan="2">2019/04/03</td>
<td>原價280，9折</td></tr>
<tr><td>2</td><td>《霍金大見解》</td><td>原價500，9折</td></tr>
</table>
"""
    path = tmp_path / "bk.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    skus = {i.name: (i.fields.get("sku_price"), i.fields.get("sku_price_currency")) for i in acq.items}
    assert skus["《失落文明大百科》"] == (252.0, "TWD")
    assert skus["《霍金大見解》"] == (450.0, "TWD")
    assert any(cf.type == "accumulated" and cf.value == 702.0 for cf in acq.cost_factors)


def test_single_row_paid_beats_discount_computation(parser, tmp_path):
    # 盜墓筆記: own paid 179; 原價199，9折 would compute 179.1 — paid wins.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>《盜墓筆記之1》</td><td>179</td><td>TWD</td><td>嘉義鴻圖書局</td>
<td>2019/02/09</td><td>原價199，9折</td></tr>
</table>
"""
    path = tmp_path / "dm.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    f = acq.items[0].fields
    assert f.get("sku_price") == 179.0
    assert f.get("sku_price_currency") == "TWD"


def test_two_digit_discount_factor(parser):
    fields, _ = parser.parse_remark("原價399，79折")
    assert fields.get("_list_price") == 399.0
    assert fields.get("_discount_factor") == 0.79
    one, _ = parser.parse_remark("原價280，9折")
    assert one.get("_discount_factor") == 0.9


# Iteration 40 (FR-029j): segmented 備註 key-value parsing.
def test_slash_separated_pairs_both_extract(parser):
    fields, _ = parser.parse_remark("size: L / 顏色: 00 WHITE")
    assert fields.get("size") == "L"
    assert fields.get("color") == "00 WHITE"
    assert "remark" not in fields


def test_comma_separated_size_with_prose_residue(parser):
    fields, _ = parser.parse_remark("size: L，白色")
    assert fields.get("size") == "L"
    assert fields.get("remark") == "白色"


def test_comma_separated_pairs_and_english_color_key(parser):
    a, _ = parser.parse_remark("Size: XL，顏色:09 BLACK")
    assert a.get("size") == "XL"
    assert a.get("color") == "09 BLACK"
    b, _ = parser.parse_remark("color: SKY BLUE，size: L")
    assert b.get("color") == "SKY BLUE"
    assert b.get("size") == "L"


def test_bare_slashes_stay_inside_values(parser):
    a, _ = parser.parse_remark("size: 43/46")
    assert a.get("size") == "43/46"
    b, _ = parser.parse_remark("規格：180ml/灰色登山扣款")
    assert b.get("spec") == "180ml/灰色登山扣款"


def test_segmented_mixed_line_keeps_unmatched_segments(parser):
    fields, _ = parser.parse_remark("size: L，原價450，指定商品8折")
    assert fields.get("size") == "L"
    assert "sku_price" not in fields
    assert "原價450" in fields.get("remark", "")
    assert "指定商品8折" in fields.get("remark", "")


# Iteration 42 (FR-029k): paren size annotations, range dims parts, 腰圍,
# name-matched 原價 listings.
def test_size_label_with_range_triplet_in_fullwidth_parens(parser):
    fields, _ = parser.parse_remark("尺寸：Q（160x200x18~28cm）")
    assert fields.get("size") == "Q"
    assert fields.get("length") == {"value": "160", "unit": "cm"}
    assert fields.get("width") == {"value": "200", "unit": "cm"}
    assert fields.get("height") == {"value": "18~28", "unit": "cm"}


def test_size_label_with_waist_annotation(parser):
    fields, _ = parser.parse_remark("size: L(腰圍 84~92cm)，偏緊")
    assert fields.get("size") == "L"
    assert fields.get("waist") == {"value": "84~92", "unit": "cm"}
    assert fields.get("remark") == "偏緊"


def test_name_matched_list_prices_assign_by_fragment(parser, tmp_path):
    # 2020:46 — ONE rowspan total; the shared 備註 lists per-item 原價 by name.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>棉法蘭絨被套窗格紋混墨灰色/Ｓ</td><td rowspan="3">1536</td>
<td rowspan="3">TWD</td><td rowspan="3">MUJI無印良品 統一時代百貨台北門市</td>
<td rowspan="3">2020/11/15</td><td rowspan="3">被套原價1390，抹布原價119，衣架原價99*2組，統一時代會員限時9折優惠</td></tr>
<tr><td>2</td><td>超細纖維抹布/2片組</td></tr>
<tr><td>3</td><td>鋁製衣架/3支組/寬41cm</td></tr>
</table>
"""
    path = tmp_path / "muji46.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    got = {
        i.name: (i.fields.get("sku_price"), i.fields.get("sku_price_currency"), i.fields.get("quantity") or 1)
        for i in acq.items
    }
    assert got["棉法蘭絨被套窗格紋混墨灰色/Ｓ"] == (1390.0, "TWD", 1)
    assert got["超細纖維抹布/2片組"] == (119.0, "TWD", 1)
    assert got["鋁製衣架/3支組/寬41cm"] == (99.0, "TWD", 2)
    assert any(cf.type == "accumulated" and cf.value == 1536.0 for cf in acq.cost_factors)


def test_name_matched_arithmetic_listing_with_fragment_fallback(parser, tmp_path):
    # 2020:51 — arithmetic listing; 牛仔褲 matches 丹寧窄版褲 via the 褲 fallback.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>[MUJI 無印良品]鋁製衣架/3支組/寬41cm</td><td rowspan="3">2167</td>
<td rowspan="3">TWD</td><td rowspan="3">MUJI無印良品 統一時代百貨台北門市</td>
<td rowspan="3">2020/11/29</td><td rowspan="3">(衣架原價99*3組 + 枕頭原價1390 + (牛仔褲原價1390 - 周末優惠391)) * 統一時代會員限時9折優惠</td></tr>
<tr><td>2</td><td>頭部支撐舒適枕頭</td></tr>
<tr><td>3</td><td>男有機棉混縱橫彈性丹寧窄版褲 暗藍36吋</td></tr>
</table>
"""
    path = tmp_path / "muji51.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    got = {i.name: (i.fields.get("sku_price"), i.fields.get("quantity") or 1) for i in acq.items}
    assert got["[MUJI 無印良品]鋁製衣架/3支組/寬41cm"] == (99.0, 3)
    assert got["頭部支撐舒適枕頭"] == (1390.0, 1)
    assert got["男有機棉混縱橫彈性丹寧窄版褲 暗藍36吋"] == (1390.0, 1)


def test_name_matched_pair_with_discount_tail(parser, tmp_path):
    # 2020:49-style two-item block; unmatched prose stays in remark.
    fixture = f"""
<table>
{HEADER}
<tr><td>1</td><td>[MUJI 無印良品]鋁製衣架/3支組/寬41cm</td><td rowspan="2">667</td>
<td rowspan="2">TWD</td><td rowspan="2">MUJI無印良品 微風廣場門市</td>
<td rowspan="2">2020/11/21</td><td rowspan="2">衣架原價99*7組，衣夾原價49，統一時代會員限時9折優惠</td></tr>
<tr><td>2</td><td>PC衣夾.鋁角衣架用/8A 10個</td></tr>
</table>
"""
    path = tmp_path / "muji49.html"
    path.write_text(fixture, encoding="utf-8")
    (acq,) = parser.build_html(str(path))
    got = {i.name: (i.fields.get("sku_price"), i.fields.get("quantity") or 1) for i in acq.items}
    assert got["[MUJI 無印良品]鋁製衣架/3支組/寬41cm"] == (99.0, 7)
    assert got["PC衣夾.鋁角衣架用/8A 10個"] == (49.0, 1)
