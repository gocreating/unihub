"""Domain services for the Inventory app: checklist and constraint evaluation."""

from decimal import Decimal

from inventory.models import Scenario, ScenarioItem


def _consumable_shortfall(line: ScenarioItem) -> Decimal | None:
    """Return the on-hand shortfall for a consumable line, else None.

    Args:
        line: The scenario checklist line.

    Returns:
        A positive ``Decimal`` shortfall when a consumable's required quantity
        exceeds on-hand quantity, ``Decimal("0")`` when covered, or ``None`` for
        non-consumable items.
    """
    if line.item.item_type != "consumable":
        return None
    on_hand = line.item.quantity if line.item.quantity is not None else Decimal("0")
    shortfall = line.required_quantity - on_hand
    return shortfall if shortfall > 0 else Decimal("0")


def evaluate_constraints(scenario: Scenario) -> list[dict]:
    """Evaluate every constraint on a scenario against its current selection.

    Args:
        scenario: The scenario whose constraints and item selection are checked.

    Returns:
        A list of violation dicts, each with ``constraint_id``, ``type``,
        ``message``, and optionally ``offending_item_ids`` / ``overage``.
    """
    selected_lines = list(scenario.items.select_related("item"))
    selected_ids = {line.item_id for line in selected_lines}
    violations: list[dict] = []

    constraints = scenario.constraints.prefetch_related("items")
    for constraint in constraints:
        target_ids = {item.id for item in constraint.items.all()}

        if constraint.constraint_type == "mutual_exclusive":
            offending = sorted(target_ids & selected_ids)
            if len(offending) > 1:
                violations.append(
                    {
                        "constraint_id": constraint.id,
                        "type": constraint.constraint_type,
                        "message": "More than one mutually-exclusive item is selected.",
                        "offending_item_ids": offending,
                    }
                )

        elif constraint.constraint_type == "required":
            satisfied = bool(target_ids & selected_ids)
            if not satisfied and constraint.target_category:
                satisfied = any(
                    line.item.category == constraint.target_category for line in selected_lines
                )
            if not satisfied:
                violations.append(
                    {
                        "constraint_id": constraint.id,
                        "type": constraint.constraint_type,
                        "message": "A required item or category is not selected.",
                    }
                )

        elif constraint.constraint_type == "weight_limit":
            limit = constraint.limit_value if constraint.limit_value is not None else Decimal("0")
            total = sum((line.item.weight or Decimal("0")) for line in selected_lines) or Decimal(
                "0"
            )
            if total > limit:
                violations.append(
                    {
                        "constraint_id": constraint.id,
                        "type": constraint.constraint_type,
                        "message": "Total weight exceeds the limit.",
                        "overage": str((total - limit).quantize(Decimal("0.001"))),
                    }
                )

    return violations


def build_checklist(scenario: Scenario) -> dict:
    """Build the composite checklist payload for a scenario.

    Args:
        scenario: The scenario to summarise.

    Returns:
        A dict with ``scenario_id``, ``progress``, ``lines`` and ``violations``.
    """
    lines = list(scenario.items.select_related("item", "container__item"))
    total = len(lines)
    prepared_count = sum(1 for line in lines if line.prepared)
    outstanding = total - prepared_count

    line_payloads = []
    for line in lines:
        shortfall = _consumable_shortfall(line)
        line_payloads.append(
            {
                "id": line.id,
                "item": {
                    "id": line.item_id,
                    "name": line.item.name,
                    "item_type": line.item.item_type,
                },
                "required_quantity": str(line.required_quantity),
                "prepared": line.prepared,
                "container": (
                    {"id": line.container_id, "item_name": line.container.item.name}
                    if line.container_id
                    else None
                ),
                "shortfall": str(shortfall) if shortfall and shortfall > 0 else None,
            }
        )

    return {
        "scenario_id": scenario.id,
        "progress": {
            "prepared_count": prepared_count,
            "outstanding_count": outstanding,
            "total": total,
            "complete": total > 0 and outstanding == 0,
        },
        "lines": line_payloads,
        "violations": evaluate_constraints(scenario),
    }


def would_create_cycle(line: ScenarioItem, container: ScenarioItem | None) -> bool:
    """Return True if assigning ``container`` to ``line`` creates a cycle.

    Args:
        line: The scenario item being assigned a container.
        container: The candidate container line (or None to clear).

    Returns:
        True when the assignment is a self-reference or forms a containment
        cycle by walking the candidate's ancestor chain back to ``line``.
    """
    if container is None:
        return False
    if container.id == line.id:
        return True
    ancestor = container
    seen: set[str] = set()
    while ancestor is not None:
        if ancestor.id == line.id:
            return True
        if ancestor.id in seen:
            break
        seen.add(ancestor.id)
        ancestor = ancestor.container
    return False
