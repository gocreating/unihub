# Implementation Plan: Inventory App — Iteration 23 (Date-cell no-data-loss + strikethrough skip)

**Branch**: `014-inventory-app` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-13 iteration 23; FR-029e new. Constitution v1.22.0.

## Summary

The coverage sweep exempted 購買日期 cells — the last silent-loss channel. Parser upgrade (all fixture-locked BEFORE the destructive re-import): month-end resolution for day-less tokens; latest-date-as-obtained + full-cell-to-remark for complex cells; Dec-31-of-sheet-year default when no dates exist; strikethrough rows skipped with a visible flag. The sweep extends to date cells (struck rows exempt). Then wipe + re-import all 12 sheets and verify the four named cases plus totals.

## Technical Context

Parser (`preview_legacy_import.py`) + tests only; the `<style>` block is parsed for `line-through` classes and cells gain a `struck` marker; `build_html` derives the sheet year from the filename. No frontend/API change.

## Constitution Check

PASS — V (fixtures before fixes; sweep before re-import), I (import semantics regression-locked).

## Phase 0 — Research

R23.1 (research.md): the three named rows' raw cells + strikethrough inventory, measured from the sources.

## Complexity Tracking

*(none)*
