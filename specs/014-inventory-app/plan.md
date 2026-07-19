# Implementation Plan: Inventory App — Iteration 43 (Drag anchor portal, nest-drop block highlight, full search highlighting)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 43; FR-011 amended ×3. Constitution v1.22.0.

## Summary

1. **Overlay portal** — `createPortal(<DragOverlay …>, document.body)`; the iteration-29 mirror e2e gains a grab-offset assertion (overlay top-left == row origin + pointer delta at a non-center grab).
2. **Nest-drop highlight** — the drag projection exposes `container_id`; when nesting, OrgRow renders a strong container tint + light subtree tint (via computed id sets) and the line hides; sibling drops keep the line. e2e locks the container-tint on a lower-half hover.
3. **Full search highlighting** — ItemDisplay applies `highlight` to the spec line; the modal's acquisition-context line wraps in HighlightText. RTL locks marks in spec + context.

## Constitution Check

PASS — V (e2e/RTL first), VI (highlight colors from AntD tokens).

## Complexity Tracking

*(none)*
