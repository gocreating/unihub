"""
TDD suite for the `import_legacy_finance` management command (FR-012a–h).

Fixtures are SYNTHETIC CSVs mirroring the legacy export schema — the real
files contain personal financial data and never enter the repository.
"""

from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from finance.models import Asset, Currency, Portfolio, Transaction, Transfer

ASSET_HEADER = "reference,created_time,updated_time,user_reference,name,symbol,decimals,is_settleable"
PORTFOLIO_HEADER = "reference,created_time,updated_time,user_reference,name,settlement_asset_reference,description"
TRANSACTION_HEADER = "reference,created_time,updated_time,portfolio_reference,transacted_time,chain_id,tx_hash,remark"
TRANSFER_HEADER = "reference,created_time,updated_time,transaction_reference,flow_type,asset_amount_change,asset_reference,settlement_asset_amount_change,remark"


def write_csvs(tmp_path, assets=None, portfolios=None, transactions=None, transfers=None):
    (tmp_path / "finance_asset.csv").write_text(
        "\n".join([ASSET_HEADER, *(assets or [])]) + "\n", encoding="utf-8"
    )
    (tmp_path / "finance_portfolio.csv").write_text(
        "\n".join([PORTFOLIO_HEADER, *(portfolios or [])]) + "\n", encoding="utf-8"
    )
    (tmp_path / "finance_transaction.csv").write_text(
        "\n".join([TRANSACTION_HEADER, *(transactions or [])]) + "\n", encoding="utf-8"
    )
    (tmp_path / "finance_transfer.csv").write_text(
        "\n".join([TRANSFER_HEADER, *(transfers or [])]) + "\n", encoding="utf-8"
    )
    return tmp_path


@pytest.fixture
def legacy_dir(tmp_path):
    """A small but complete legacy export: 4 assets, 3 portfolios, 3 transactions, 6 transfers."""
    return write_csvs(
        tmp_path,
        assets=[
            "astTWD00,2025-01-01T00:00:00Z,2025-01-01T00:00:00Z,user_cp,新台幣,TWD,0,true",
            "astUSD00,2025-01-01T00:00:00Z,2025-01-01T00:00:00Z,user_cp,美元,USD,2,true",
            "astETH00,2025-02-01T00:00:00Z,2025-02-02T00:00:00Z,user_cp,ETH,ETH,18,false",
            "astSTK00,2025-03-01T00:00:00Z,2025-03-01T00:00:00Z,user_cp,大華優利,00918.TW,0,false",
        ],
        portfolios=[
            'pfACT0000,2025-04-01T00:00:00Z,2025-04-02T00:00:00Z,user_cp,[Active] 永豐 DCA,astTWD00,"每月 06, 16 日"',
            "pfCLS0000,2025-04-01T00:00:00Z,2025-04-01T00:00:00Z,user_cp,Old Launchpool,astTWD00,",
            "pfUSD0000,2025-04-01T00:00:00Z,2025-04-01T00:00:00Z,user_cp,Lending,astUSD00,",
        ],
        transactions=[
            "txn000001,2025-04-10T00:00:00Z,2025-04-10T00:00:00Z,pfACT0000,2024-10-14T00:00:00Z,1,0xabc123,first buy",
            "txn000002,2025-05-10T00:00:00Z,2025-05-10T00:00:00Z,pfACT0000,2025-05-01T00:00:00Z,,,",
            "txn000003,2025-05-11T00:00:00Z,2025-05-11T00:00:00Z,pfUSD0000,2025-05-02T00:00:00Z,,,",
        ],
        transfers=[
            "trf000001,2025-04-10T00:01:00Z,2025-04-10T00:01:00Z,txn000001,COST,-9977,astTWD00,-9977,",
            "trf000002,2025-04-10T00:02:00Z,2025-04-10T00:02:00Z,txn000001,EXPENSE,-1,astTWD00,-1,手續費",
            "trf000003,2025-04-10T00:03:00Z,2025-04-10T00:03:00Z,txn000001,UPDATE_POSITION,419,astSTK00,0,",
            "trf000004,2025-05-10T00:01:00Z,2025-05-10T00:01:00Z,txn000002,EXPENSE,-67305900768,astETH00,-1,",
            "trf000005,2025-05-11T00:01:00Z,2025-05-11T00:01:00Z,txn000003,REVENUE,12345,astUSD00,12345,",
            "trf000006,2025-05-11T00:02:00Z,2025-05-11T00:02:00Z,txn000003,UPDATE_POSITION,5,astSTK00,0,",
        ],
    )


def run(csv_dir):
    out = StringIO()
    call_command("import_legacy_finance", str(csv_dir), stdout=out)
    return out.getvalue()


@pytest.mark.django_db
class TestImportLegacyFinance:
    def test_counts_and_reference_pks(self, legacy_dir):
        out = run(legacy_dir)
        # FR-038: settleable legacy assets (TWD, USD) become Currencies, NOT Assets.
        assert Asset.objects.count() == 2
        assert Portfolio.objects.count() == 3
        assert Transaction.objects.count() == 3
        assert Transfer.objects.count() == 6
        # Legacy references ARE the primary keys (FR-012b)
        assert Asset.objects.filter(pk="astETH00").exists()
        assert not Asset.objects.filter(pk__in=["astTWD00", "astUSD00"]).exists()
        assert Portfolio.objects.filter(pk="pfACT0000").exists()
        assert Transaction.objects.filter(pk="txn000001").exists()
        assert Transfer.objects.filter(pk="trf000004").exists()
        # Report mentions the created counts
        assert "6" in out

    def test_minor_unit_conversion_by_asset_decimals(self, legacy_dir):
        run(legacy_dir)
        # A settleable leg is now a CURRENCY leg.
        cash = Transfer.objects.get(pk="trf000001")
        assert cash.currency_id == "TWD"
        assert cash.currency_amount == Decimal("-9977")
        assert cash.asset_id is None
        # 18-decimals wei value survives exactly (FR-008c/FR-012c)
        assert Transfer.objects.get(pk="trf000004").asset_change_amount == Decimal(
            "-0.000000067305900768"
        )
        assert Transfer.objects.get(pk="trf000004").currency_id is None
        # 2-decimals settleable asset: 12345 minor units → 123.45
        assert Transfer.objects.get(pk="trf000005").currency_amount == Decimal("123.45")

    def test_value_change_mapping(self, legacy_dir):
        run(legacy_dir)
        # UPDATE_POSITION → blank (FR-012d)
        assert Transfer.objects.get(pk="trf000003").pnl_change is None
        assert Transfer.objects.get(pk="trf000006").pnl_change is None
        # COST/EXPENSE in a TWD-settled portfolio (0 decimals)
        assert Transfer.objects.get(pk="trf000001").pnl_change == Decimal("-9977")
        assert Transfer.objects.get(pk="trf000004").pnl_change == Decimal("-1")
        # REVENUE in a USD-settled portfolio (2 decimals): 12345 → 123.45
        assert Transfer.objects.get(pk="trf000005").pnl_change == Decimal("123.45")

    def test_portfolio_state_from_prefix_names_verbatim(self, legacy_dir):
        run(legacy_dir)
        active = Portfolio.objects.get(pk="pfACT0000")
        assert active.state == "active"
        assert active.name == "[Active] 永豐 DCA"  # verbatim, prefix kept
        assert active.description == "每月 06, 16 日"  # quoted CSV field with comma
        assert Portfolio.objects.get(pk="pfCLS0000").state == "closed"

    def test_optional_fields_ported(self, legacy_dir):
        run(legacy_dir)
        txn = Transaction.objects.get(pk="txn000001")
        assert txn.chain_id == "1"
        assert txn.tx_hash == "0xabc123"
        assert txn.description == "first buy"
        assert Transfer.objects.get(pk="trf000002").currency_id == "TWD"

    def test_timestamps_preserved_and_derived_times_recomputed(self, legacy_dir):
        run(legacy_dir)
        eth = Asset.objects.get(pk="astETH00")
        assert eth.created_at.isoformat() == "2025-02-01T00:00:00+00:00"
        assert eth.updated_at.isoformat() == "2025-02-02T00:00:00+00:00"
        txn = Transaction.objects.get(pk="txn000001")
        assert txn.timestamp.isoformat() == "2024-10-14T00:00:00+00:00"
        active = Portfolio.objects.get(pk="pfACT0000")
        assert active.first_transaction_time.isoformat() == "2024-10-14T00:00:00+00:00"
        assert active.last_transaction_time.isoformat() == "2025-05-01T00:00:00+00:00"

    def test_currency_ensured_but_existing_untouched(self, legacy_dir):
        Currency.objects.create(code="TWD", name="My Custom TWD Name", symbol="NT$")
        run(legacy_dir)
        # Pre-existing row untouched (strictly additive)
        twd = Currency.objects.get(code="TWD")
        assert twd.name == "My Custom TWD Name"
        assert twd.symbol == "NT$"
        # Missing settlement currency created from the legacy asset row
        usd = Currency.objects.get(code="USD")
        assert usd.name == "美元"
        # Portfolios reference the codes
        assert Portfolio.objects.get(pk="pfUSD0000").base_currency == "USD"

    def test_idempotent_rerun_creates_and_modifies_nothing(self, legacy_dir):
        run(legacy_dir)
        before = (
            Asset.objects.count(),
            Portfolio.objects.count(),
            Transaction.objects.count(),
            Transfer.objects.count(),
        )
        updated_before = Portfolio.objects.get(pk="pfACT0000").updated_at
        out = run(legacy_dir)
        assert (
            Asset.objects.count(),
            Portfolio.objects.count(),
            Transaction.objects.count(),
            Transfer.objects.count(),
        ) == before
        assert Portfolio.objects.get(pk="pfACT0000").updated_at == updated_before
        assert "skipped" in out.lower()

    def test_pre_existing_records_untouched(self, legacy_dir):
        keep = Asset.objects.create(name="My Manual Asset")
        run(legacy_dir)
        keep.refresh_from_db()
        assert keep.name == "My Manual Asset"
        assert Asset.objects.count() == 3  # 2 imported + 1 pre-existing

    def test_unknown_reference_aborts_atomically(self, tmp_path):
        csv_dir = write_csvs(
            tmp_path,
            assets=["astTWD00,2025-01-01T00:00:00Z,2025-01-01T00:00:00Z,user_cp,新台幣,TWD,0,true"],
            portfolios=["pfACT0000,2025-04-01T00:00:00Z,2025-04-01T00:00:00Z,user_cp,P,astTWD00,"],
            transactions=[
                "txn000001,2025-04-10T00:00:00Z,2025-04-10T00:00:00Z,pfACT0000,2024-10-14T00:00:00Z,,,",
            ],
            transfers=[
                # references an asset absent from the asset CSV
                "trf000001,2025-04-10T00:01:00Z,2025-04-10T00:01:00Z,txn000001,COST,-1,astMISSING,-1,",
            ],
        )
        with pytest.raises(CommandError):
            run(csv_dir)
        # Atomic: NOTHING was written (FR-012g)
        assert Asset.objects.count() == 0
        assert Portfolio.objects.count() == 0
        assert Transaction.objects.count() == 0
        assert Transfer.objects.count() == 0

    def test_missing_csv_file_errors(self, tmp_path):
        with pytest.raises(CommandError):
            run(tmp_path)
