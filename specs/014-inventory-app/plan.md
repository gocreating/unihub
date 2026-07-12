# Implementation Plan: Inventory App — Iteration 22 (Search-modal row geometry lock)

**Branch**: `014-inventory-app` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-13 iteration 22; FR-011 revision. Constitution v1.22.0.

## Summary

The modal result rows delegated their trailing action to AntD `List.Item actions`, whose internal `ul/li` wrappers carry library margins/padding — the right edge was never under our control. Rows now own a flex layout (content `flex:1 minWidth:0`, Add `flex:none`, zero horizontal padding). Acceptance is geometric: e2e measures, in a real browser, that the Add button's right edge is within 2px of the row edge and the row within 2px of the modal body's content edge — for an enabled row AND a disabled member row. RTL locks the structure (no `.ant-list-item-action` rendered).

## Technical Context

Frontend-only (`scenarios/detail.tsx` renderItem). Tests first: RTL structural + e2e geometry. No API/locale change.

## Constitution Check

PASS — V (tests first, geometric verification), VI (layout ownership; tooltips unchanged).

## Phase 0 — Research

R22.1 (research.md): live measurement + root cause (actions-slot ul/li).

## Complexity Tracking

*(none)*
