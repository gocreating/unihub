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
