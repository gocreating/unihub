"""Unit tests for inventory measurement conversion helpers."""

from decimal import Decimal

import pytest

from inventory.units import (
    length_from_canonical,
    length_to_canonical,
    volume_from_canonical,
    volume_to_canonical,
    weight_from_canonical,
    weight_to_canonical,
)


class TestUnitConversion:
    def test_length_cm_to_mm(self):
        assert length_to_canonical(Decimal("12.9"), "cm") == Decimal("129.0")

    def test_length_in_to_mm(self):
        assert length_to_canonical(Decimal("1"), "in") == Decimal("25.4")

    def test_weight_kg_to_g(self):
        assert weight_to_canonical(Decimal("0.658"), "kg") == Decimal("658.000")

    def test_weight_lb_to_g(self):
        assert weight_to_canonical(Decimal("1"), "lb") == Decimal("453.592")

    def test_length_roundtrip(self):
        canonical = length_to_canonical(Decimal("3.5"), "m")
        assert length_from_canonical(canonical, "m") == Decimal("3.5")

    def test_weight_roundtrip(self):
        canonical = weight_to_canonical(Decimal("2.25"), "kg")
        assert weight_from_canonical(canonical, "kg") == Decimal("2.25")

    def test_volume_l_to_ml(self):
        assert volume_to_canonical(Decimal("1.2"), "L") == Decimal("1200.0")

    def test_volume_roundtrip(self):
        canonical = volume_to_canonical(Decimal("0.5"), "L")
        assert volume_from_canonical(canonical, "L") == Decimal("0.5")

    def test_none_passthrough(self):
        assert length_to_canonical(None, "cm") is None
        assert weight_from_canonical(None, "kg") is None

    def test_unknown_unit_raises(self):
        with pytest.raises(ValueError):
            length_to_canonical(Decimal("1"), "furlong")
