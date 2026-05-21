"""Integration tests for data_io import endpoints (preview + confirm)."""


import pytest
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="testuser", password="testpass")
    c = Client()
    c.force_login(user)
    return c


CURRENCY_CSV = "code:string,name:text,symbol:text\nUSD,US Dollar,$\nEUR,Euro,€"


# ─── Preview Tests ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestImportPreview:
    def test_preview_creates_for_new_rows(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["creates"]) == 2
        assert data["updates"] == []
        assert data["errors"] == []

    def test_preview_updates_for_existing_rows(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="USD", name="Old Name", symbol="$")

        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["creates"]) == 1  # EUR
        assert len(data["updates"]) == 1  # USD updated
        updates_pks = [u["pk"] for u in data["updates"]]
        assert "USD" in updates_pks

    def test_preview_schema_error_returns_200_with_errors(self, auth_client):
        bad_csv = "code,name:text,symbol:text\nUSD,US Dollar,$"  # header missing :type
        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": bad_csv},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["errors"]) > 0
        assert data["creates"] == []
        assert data["updates"] == []

    def test_preview_missing_table_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 400

    def test_preview_missing_mode_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "finance.currency", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 400

    def test_preview_no_csv_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "finance.currency", "mode": "upsert"},
        )
        assert resp.status_code == 400

    def test_preview_unknown_table_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "nonexistent.table", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 400

    def test_preview_replace_shows_deletes(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="JPY", name="Yen", symbol="¥")

        resp = auth_client.post(
            "/api/v1/io/import/preview/",
            {"table": "finance.currency", "mode": "replace", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 200
        data = resp.json()
        delete_pks = [d["pk"] for d in data["deletes"]]
        assert "JPY" in delete_pks


# ─── Confirm Upsert Tests ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestImportConfirmUpsert:
    def test_upsert_creates_new_rows(self, auth_client):
        resp = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 2
        assert data["updated"] == 0
        assert data["deleted"] == 0

        from finance.models import Currency

        assert Currency.objects.count() == 2

    def test_upsert_updates_existing_rows(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="USD", name="Old Name", symbol="$")

        resp = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1  # EUR
        assert data["updated"] == 1  # USD

        usd = Currency.objects.get(code="USD")
        assert usd.name == "US Dollar"

    def test_upsert_does_not_delete_unmentioned_rows(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="JPY", name="Yen", symbol="¥")

        auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        assert Currency.objects.filter(code="JPY").exists()

    def test_upsert_idempotent_on_second_run(self, auth_client):
        auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        resp2 = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        data2 = resp2.json()
        assert data2["created"] == 0
        assert data2["updated"] == 0

    def test_confirm_schema_error_returns_400(self, auth_client):
        bad_csv = "code,name:text\nUSD,Dollar"
        resp = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": bad_csv},
        )
        assert resp.status_code == 400

        from finance.models import Currency

        assert Currency.objects.count() == 0  # nothing created


# ─── Confirm Replace Tests ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestImportConfirmReplace:
    def test_replace_deletes_absent_rows(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="JPY", name="Yen", symbol="¥")

        resp = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "replace", "csv_text": CURRENCY_CSV},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] == 1
        assert not Currency.objects.filter(code="JPY").exists()
        assert Currency.objects.count() == 2

    def test_replace_table_matches_csv_exactly(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="JPY", name="Yen", symbol="¥")
        Currency.objects.create(code="GBP", name="Pound", symbol="£")

        auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "replace", "csv_text": CURRENCY_CSV},
        )
        codes = set(Currency.objects.values_list("code", flat=True))
        assert codes == {"USD", "EUR"}

    def test_upsert_never_deletes(self, auth_client):
        from finance.models import Currency

        Currency.objects.create(code="JPY", name="Yen", symbol="¥")

        resp = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.currency", "mode": "upsert", "csv_text": CURRENCY_CSV},
        )
        data = resp.json()
        assert data["deleted"] == 0
        assert Currency.objects.filter(code="JPY").exists()


# ─── AttributeValue upsert ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestImportConfirmAttributeValues:
    def test_upsert_with_user_attr_column(self, auth_client):
        from django.contrib.contenttypes.models import ContentType

        from core.models import AttributeDefinition, AttributeValue
        from finance.models import Account

        ct = ContentType.objects.get_for_model(Account)
        AttributeDefinition.objects.create(
            content_type=ct, name="priority", data_type="single_select", is_system=False
        )

        csv_text = "id:string,name:text,currency:string,open_datetime:datetime,close_datetime:datetime,[priority]:single_select\nabc12345xyz1,Savings,USD,2024-01-01T00:00:00Z,,high"

        resp = auth_client.post(
            "/api/v1/io/import/confirm/",
            {"table": "finance.account", "mode": "upsert", "csv_text": csv_text},
        )
        assert resp.status_code == 200

        account = Account.objects.get(id="abc12345xyz1")
        ct = ContentType.objects.get_for_model(Account)
        ad = AttributeDefinition.objects.get(content_type=ct, name="priority")
        av = AttributeValue.objects.get(
            attribute_definition=ad, content_type=ct, object_id=account.id
        )
        assert av.value == "high"
