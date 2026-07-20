"""Tests for the preview diff digest — pins a confirm to its preview."""

from __future__ import annotations

from sync.services.digest import diff_digest


def _sample_changes() -> list[dict]:
    return [
        {
            "table": "inventory.item",
            "display_name": "Items",
            "added": 1,
            "modified": 0,
            "deleted": 0,
            "rows": [
                {
                    "pk": "abc",
                    "operation": "create",
                    "before": None,
                    "after": {"id:string": "abc", "name:string": "Cup"},
                    "changed_fields": [],
                }
            ],
        }
    ]


def test_diff_digest_is_deterministic() -> None:
    assert diff_digest(_sample_changes()) == diff_digest(_sample_changes())


def test_diff_digest_is_hex_sha256() -> None:
    digest = diff_digest(_sample_changes())
    assert len(digest) == 64
    int(digest, 16)  # must be valid hex


def test_diff_digest_ignores_dict_key_order() -> None:
    reordered = [
        {
            "rows": [
                {
                    "changed_fields": [],
                    "after": {"name:string": "Cup", "id:string": "abc"},
                    "before": None,
                    "operation": "create",
                    "pk": "abc",
                }
            ],
            "deleted": 0,
            "modified": 0,
            "added": 1,
            "display_name": "Items",
            "table": "inventory.item",
        }
    ]
    assert diff_digest(_sample_changes()) == diff_digest(reordered)


def test_diff_digest_changes_when_a_row_value_changes() -> None:
    mutated = _sample_changes()
    mutated[0]["rows"][0]["after"]["name:string"] = "Mug"
    assert diff_digest(_sample_changes()) != diff_digest(mutated)


def test_diff_digest_changes_when_a_row_is_added() -> None:
    grown = _sample_changes()
    grown[0]["rows"].append(
        {
            "pk": "def",
            "operation": "delete",
            "before": {"id:string": "def"},
            "after": None,
            "changed_fields": [],
        }
    )
    assert diff_digest(_sample_changes()) != diff_digest(grown)


def test_diff_digest_empty_changes_is_stable() -> None:
    assert diff_digest([]) == diff_digest([])
    assert diff_digest([]) != diff_digest(_sample_changes())
