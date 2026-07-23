"""Tests for data_io registry completeness across all domain apps."""

import pytest


@pytest.mark.django_db
def test_all_domain_tables_registered() -> None:
    """All active domain models must be registered in the data_io registry."""
    from data_io.registry import get_registry

    registry = get_registry()

    expected_labels = {
        # core
        "core.attributedefinition",
        "core.entityview",
        # finance
        "finance.currency",
        "finance.account",
        "finance.balancesheet",
        "finance.exchangerate",
        "finance.balance",
        # language
        "language.language",
        "language.wordcard",
        "language.grammarsheet",
        # music
        "music.song",
        # people
        "people.person",
        "people.relationship",
    }

    missing = expected_labels - set(registry.keys())
    assert not missing, f"Tables missing from registry: {sorted(missing)}"
