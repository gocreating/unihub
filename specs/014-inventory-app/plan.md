# Implementation Plan: Inventory App — Iteration 24 (Default filter as plain OR conditions)

**Branch**: `014-inventory-app` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-13 iteration 24; FR-003 revision. Constitution v1.22.0.

## Summary

The catalog's seeded default filter reshapes from two single-condition groups (implicit group-level OR, rendered as nested boxes with a misleading "AND" chip) to ONE group with `logic: "or"` and two plain conditions. The backend already honors per-group OR (verified in `core/filters.py`); semantics are identical. RTL locks the new payload shape and a backend pytest locks the or-group semantics.

## Technical Context

Frontend: the `defaultFilterGroups` literal in `catalog/index.tsx`; RTL payload assertion update. Backend: no code change — add one pytest asserting the single-or-group filter returns YTD + pending rows (semantics lock). No locale/API change.

## Constitution Check

PASS — V (tests updated/added with the change), XII (seed mechanics untouched).

## Complexity Tracking

*(none)*
