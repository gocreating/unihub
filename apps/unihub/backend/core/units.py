"""Measurement unit conversion for dimension-typed attributes (shared, core).

Lengths are normalized to millimetres (mm); weights to grams (g); volumes to
millilitres (mL); times to seconds (s); battery capacities to milliamp-hours
(mAh); temperatures to degrees Celsius (°C — affine, not factor-based). The
canonical value is what the database stores and sorts/filters on; the display
unit is kept so the user's chosen unit round-trips.
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

TIME_UNITS: dict[str, Decimal] = {
    "s": Decimal("1"),
    "min": Decimal("60"),
    "h": Decimal("3600"),
}

BATTERY_UNITS: dict[str, Decimal] = {
    "mAh": Decimal("1"),
    "Ah": Decimal("1000"),
}

# Temperature converts affinely (°F = °C × 9/5 + 32), so it has no factor
# table; its unit symbols live here and conversion in family_to/from_canonical.
TEMPERATURE_UNITS: tuple[str, ...] = ("°C", "°F")

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


# Unit-family registry for dimension-typed AttributeDefinitions (factor-based
# families only — temperature is affine and handled by the family_* functions).
FAMILY_UNITS: dict[str, dict[str, Decimal]] = {
    "length": LENGTH_UNITS,
    "weight": WEIGHT_UNITS,
    "volume": VOLUME_UNITS,
    "time": TIME_UNITS,
    "battery": BATTERY_UNITS,
}


def family_unit_symbols(family: str) -> tuple[str, ...] | None:
    """Return the unit symbols valid for ``family``, or None if unknown.

    Covers every unit family, including affine temperature — use this (not
    FAMILY_UNITS membership) to validate a definition's family or a unit.
    """
    if family == "temperature":
        return TEMPERATURE_UNITS
    table = FAMILY_UNITS.get(family)
    if table is None:
        return None
    return tuple(table)


def family_to_canonical(family: str, value: Decimal | None, unit: str) -> Decimal | None:
    """Convert a display value in ``unit`` to its family's canonical value.

    Args:
        family: A unit family key (length/weight/volume/time/battery/temperature).
        value: The value as entered, or None.
        unit: The unit the value is expressed in.

    Returns:
        The canonical value (mm/g/mL/s/mAh/°C), or None when ``value`` is None.

    Raises:
        ValueError: On an unknown family or a unit outside the family.
    """
    if value is None:
        return None
    if family == "temperature":
        if unit == "°C":
            return Decimal(value)
        if unit == "°F":
            return (Decimal(value) - 32) * 5 / 9
        raise ValueError(f"Unsupported unit: {unit!r}")
    table = FAMILY_UNITS.get(family)
    if table is None:
        raise ValueError(f"Unsupported unit family: {family!r}")
    return to_canonical(value, unit, table)


def family_from_canonical(family: str, canonical: Decimal | None, unit: str) -> Decimal | None:
    """Convert a canonical value back to a display value in ``unit``.

    Args:
        family: A unit family key (length/weight/volume/time/battery/temperature).
        canonical: The stored canonical value, or None.
        unit: The unit to express the result in.

    Returns:
        The value in ``unit``, or None when ``canonical`` is None.

    Raises:
        ValueError: On an unknown family or a unit outside the family.
    """
    if canonical is None:
        return None
    if family == "temperature":
        if unit == "°C":
            return Decimal(canonical)
        if unit == "°F":
            return Decimal(canonical) * 9 / 5 + 32
        raise ValueError(f"Unsupported unit: {unit!r}")
    table = FAMILY_UNITS.get(family)
    if table is None:
        raise ValueError(f"Unsupported unit family: {family!r}")
    return from_canonical(canonical, unit, table)
