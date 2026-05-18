"""Integration tests for the core attribute system."""

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.contrib.contenttypes.models import ContentType

from core.models import AttributeDefinition
from finance.models import Account


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(username="coretest", password="testpass")
    c = Client()
    c.force_login(user)
    return c


@pytest.mark.django_db
class TestAttributeDefinitions:
    def test_list_attrs_for_content_type(self, auth_client):
        resp = auth_client.get("/api/v1/core/attribute-definitions/?content_type=finance.account")
        assert resp.status_code == 200
        # System attrs were seeded by migration
        names = [a["name"] for a in resp.json()]
        assert "name" in names
        assert "account_type" in names
        assert "currency" in names

    def test_create_user_defined_attr(self, auth_client):
        ct = ContentType.objects.get_for_model(Account)
        resp = auth_client.post(
            "/api/v1/core/attribute-definitions/",
            {"content_type": ct.id, "name": "Bank", "data_type": "text"},
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Bank"
        assert resp.json()["is_system"] is False

    def test_delete_user_defined_attr_with_confirm(self, auth_client):
        ct = ContentType.objects.get_for_model(Account)
        resp = auth_client.post(
            "/api/v1/core/attribute-definitions/",
            {"content_type": ct.id, "name": "Notes", "data_type": "long_text"},
            content_type="application/json",
        )
        attr_id = resp.json()["id"]

        # Without confirm returns 400
        resp = auth_client.delete(f"/api/v1/core/attribute-definitions/{attr_id}/")
        assert resp.status_code == 400

        # With confirm deletes
        resp = auth_client.delete(f"/api/v1/core/attribute-definitions/{attr_id}/?confirm=true")
        assert resp.status_code == 204

    def test_cannot_delete_system_attr(self, auth_client):
        ct = ContentType.objects.get_for_model(Account)
        system_attr = AttributeDefinition.objects.get(content_type=ct, name="name", is_system=True)
        resp = auth_client.delete(
            f"/api/v1/core/attribute-definitions/{system_attr.id}/?confirm=true"
        )
        assert resp.status_code == 400
