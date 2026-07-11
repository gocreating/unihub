"""Shared pytest fixtures for the test suite."""

import pytest
from django.contrib.auth.models import User
from django.test import Client


@pytest.fixture
def auth_client(db):
    """An authenticated Django test client (session auth)."""
    user = User.objects.create_user(username="inv_tester", password="testpass")
    c = Client()
    c.force_login(user)
    return c
