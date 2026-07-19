"""HTML (Google-Sheets export) legacy-import parser — Format v2 regression tests.

Locks: colspan expansion (merged empty cells shift positions), name <a href> → url,
備註 key-value resolution (規格→spec, 原價→sku_price, AxBxC→dims, 運費→shipping factor,
官網連結→url), and unresolvable lines preserved in remark.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

PARSER_PATH = (
    Path(__file__).resolve().parents[4]
    / "specs"
    / "014-inventory-app"
    / "scripts"
    / "preview_legacy_import.py"
)


@pytest.fixture(scope="module")
def parser():
    spec = importlib.util.spec_from_file_location("legacy_preview_test", PARSER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


FIXTURE = """
<table class="waffle"><tbody>
<tr><td></td><td>A</td><td></td><td>B</td><td>C</td><td>D</td><td>E</td><td>F</td></tr>
<tr><td>1</td><td>項目</td><td></td><td>實際支付價錢</td><td>貨幣</td><td>購買地點</td><td>購買日期</td><td>備註</td></tr>
<tr><td>2</td>
  <td><a href="https://example.com/boot">健行靴</a></td><td></td>
  <td>199.9</td><td>RMB</td>
  <td rowspan="2">迪卡儂</td><td rowspan="2">2026/01/18</td>
  <td>規格：44 歐碼<br>原價：299 RMB<br>10 x 20 x 30 cm<br>運費：15<br>型號：NH100<br>神秘的一行</td>
</tr>
<tr><td>3</td>
  <td>退稅</td><td></td>
  <td>-4.65</td><td>USD</td>
  <td>-735yen</td>
</tr>
<tr><td>4</td>
  <td>官網物品</td>
  <td colspan="4"></td>
  <td>2026/02/01</td>
  <td>官網連結：https://example.com/direct</td>
</tr>
</tbody></table>
"""


@pytest.fixture()
def acquisitions(parser, tmp_path):
    f = tmp_path / "fixture.html"
    f.write_text(FIXTURE, encoding="utf-8")
    return parser.build_html(str(f))


class TestHtmlLegacyParser:
    def test_groups_two_acquisitions(self, acquisitions):
        assert len(acquisitions) == 2
        assert acquisitions[0].source == "迪卡儂"
        assert [i.name for i in acquisitions[0].items] == ["健行靴"]
        assert [i.name for i in acquisitions[1].items] == ["官網物品"]

    def test_rowspan_covered_row_stays_an_attachment(self, acquisitions):
        """Regression: the 退稅 row sits under rowspanned location/date cells.
        The occupancy must activate AFTER the declaring row, so the covered
        row reads empty location/date → a tax_refund factor on the SAME
        acquisition (not a bogus new acquisition with source '-735yen')."""
        refunds = [c for c in acquisitions[0].cost_factors if c.type == "tax_refund"]
        assert len(refunds) == 1
        assert refunds[0].value == -4.65 and refunds[0].currency == "USD"
        assert not any(a.source == "-735yen" for a in acquisitions)

    def test_name_href_becomes_url(self, acquisitions):
        assert acquisitions[0].items[0].fields["url"] == "https://example.com/boot"

    def test_remark_keys_resolve_to_fields(self, acquisitions):
        f = acquisitions[0].items[0].fields
        assert f["spec"] == "44 歐碼"
        # Iteration 39: 原價 is the pre-discount list price and never sets the
        # sku — the row's own paid amount (199.9) derives it instead.
        assert f["sku_price"] == 199.9 and f["sku_price_currency"] == "RMB"
        assert f["length"] == {"value": "10", "unit": "cm"}
        assert f["width"] == {"value": "20", "unit": "cm"}
        assert f["height"] == {"value": "30", "unit": "cm"}

    def test_simple_shipping_line_becomes_cost_factor(self, acquisitions):
        shipping = [c for c in acquisitions[0].cost_factors if c.type == "shipping"]
        assert len(shipping) == 1
        assert shipping[0].value == 15.0
        # currency inherited from the acquisition's paid currency
        assert shipping[0].currency == "RMB"

    def test_unresolvable_lines_kept_verbatim(self, acquisitions):
        # FR-029f b: the whole 備註 is preserved verbatim — on the acquisition
        # remark for a single-item acquisition, on item.spec for multi-item.
        acq = acquisitions[0]
        haystack = acq.remark if len(acq.items) == 1 else acq.items[0].fields.get("spec", "")
        assert "型號：NH100" in haystack
        assert "神秘的一行" in haystack

    def test_colspan_expansion_keeps_remark_column_aligned(self, acquisitions):
        # The second acquisition's row uses colspan=4 over its empty
        # price/currency/location cells; 備註 must still land in the remark column.
        second = acquisitions[1].items[0]
        assert second.fields["url"] == "https://example.com/direct"
