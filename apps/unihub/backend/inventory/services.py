"""Containment helpers for the Inventory domain (constraints/checklist removed in iteration 14)."""

from inventory.models import ScenarioItem


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
