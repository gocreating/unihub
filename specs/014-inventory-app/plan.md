# Implementation Plan: Inventory App — Iteration 31 (Visible drop indicator + recent items in Add modal)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 31; FR-011 amended twice. Constitution v1.22.0.

## Summary

1. **Indicator over preview** — DragOverlay gets `zIndex: 900` + child opacity 0.75; the drop-indicator bar gets `position: relative; zIndex: 1000` (+ a `data-testid`) so it paints above the overlay. e2e locks the style invariants mid-drag (overlay opacity < 1; indicator z-index > overlay z-index; indicator visible while the pointer hovers the tree).
2. **Recent items by default** — a second query (`enabled: addOpen && !search.trim()`) lists items ordered `-acquisition__obtained_at__nullsfirst`, limit 10; the modal renders it while the search box is empty (identical rows). RTL covers the switch between default and search results.

## Technical Context

Frontend-only: `scenarios/detail.tsx`. TDD: RTL for the default listing; e2e for the overlay/indicator z-order.

## Constitution Check

PASS — V (tests first), VI (row behavior unchanged).

## Complexity Tracking

*(none)*
