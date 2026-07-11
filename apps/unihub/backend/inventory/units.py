"""Measurement unit conversion for Inventory items.

Lengths are normalized to millimetres (mm); weights to grams (g); volumes to
millilitres (mL). The canonical value is what the database stores and
sorts/filters on; the display unit is kept so the user's chosen unit round-trips.
"""

from decimal import Decimal

LENGTH_UNITS: dict[str, Decimal] = {
    "mm": Decimal("1"),
    "cm": Decimal("10"),
    "m": Decimal("1000"),
    "in": Decimal("25.4"),
}

WEIGHT_UNITS: dict[str, Decimal] = {
    "g": Decimal("1"),
    "kg": Decimal("1000"),
    "lb": Decimal("453.592"),
}

VOLUME_UNITS: dict[str, Decimal] = {
    "mL": Decimal("1"),
    "L": Decimal("1000"),
}

DEFAULT_LENGTH_UNIT = "mm"
DEFAULT_WEIGHT_UNIT = "g"
DEFAULT_VOLUME_UNIT = "mL"


def _factor(unit: str, table: dict[str, Decimal]) -> Decimal:
    """Return the base-unit conversion factor for ``unit``.

    Args:
        unit: The unit symbol (e.g. "cm", "kg").
        table: The unit table to look the factor up in.

    Returns:
        The multiplier that converts a value in ``unit`` to the base unit.

    Raises:
        ValueError: If ``unit`` is not present in ``table``.
    """
    if unit not in table:
        raise ValueError(f"Unsupported unit: {unit!r}")
    return table[unit]


def to_canonical(value: Decimal | None, unit: str, table: dict[str, Decimal]) -> Decimal | None:
    """Convert a display value in ``unit`` to its canonical base-unit value.

    Args:
        value: The value as entered by the user, or None.
        unit: The unit the value is expressed in.
        table: LENGTH_UNITS or WEIGHT_UNITS.

    Returns:
        The value in the base unit (mm or g), or None when ``value`` is None.
    """
    if value is None:
        return None
    return Decimal(value) * _factor(unit, table)


def from_canonical(
    canonical: Decimal | None, unit: str, table: dict[str, Decimal]
) -> Decimal | None:
    """Convert a canonical base-unit value back to a display value in ``unit``.

    Args:
        canonical: The stored base-unit value, or None.
        unit: The unit to express the result in.
        table: LENGTH_UNITS or WEIGHT_UNITS.

    Returns:
        The value in ``unit``, or None when ``canonical`` is None.
    """
    if canonical is None:
        return None
    return Decimal(canonical) / _factor(unit, table)


def length_to_canonical(value: Decimal | None, unit: str) -> Decimal | None:
    """Convert a length value in ``unit`` to millimetres."""
    return to_canonical(value, unit, LENGTH_UNITS)


def length_from_canonical(canonical: Decimal | None, unit: str) -> Decimal | None:
    """Convert a millimetre value to a length in ``unit``."""
    return from_canonical(canonical, unit, LENGTH_UNITS)


def weight_to_canonical(value: Decimal | None, unit: str) -> Decimal | None:
    """Convert a weight value in ``unit`` to grams."""
    return to_canonical(value, unit, WEIGHT_UNITS)


def weight_from_canonical(canonical: Decimal | None, unit: str) -> Decimal | None:
    """Convert a gram value to a weight in ``unit``."""
    return from_canonical(canonical, unit, WEIGHT_UNITS)


def volume_to_canonical(value: Decimal | None, unit: str) -> Decimal | None:
    """Convert a volume value in ``unit`` to millilitres."""
    return to_canonical(value, unit, VOLUME_UNITS)


def volume_from_canonical(canonical: Decimal | None, unit: str) -> Decimal | None:
    """Convert a millilitre value to a volume in ``unit``."""
    return from_canonical(canonical, unit, VOLUME_UNITS)
