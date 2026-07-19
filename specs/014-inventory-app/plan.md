# Implementation Plan: Inventory App — Iteration 28 (Numeric ranges everywhere + keyed range parsing)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 28; FR-002b extended (number-type ranges, tilde display), FR-029h new. Constitution v1.22.0.

## Summary

1. **Number-type ranges (FR-002b)** — `compute_value_fields` extends the range grammar to the `number` data type (`value_number` = min, `value_number_max` = max, single → max null); the editor's number-typed value input becomes the same validated single-or-range text input dimension rows use.
2. **Tilde display (FR-002b/FR-031)** — range values render `min ~ max unit` (unitless for number type) everywhere pairs render; supersedes the iteration-26 dash (e2e expectations updated).
3. **Keyed range parsing (FR-029h)** — RE_LENGTH/RE_WEIGHT/RE_VOLUME capture `min~max`/`min-max` ranges verbatim as the parameter value (`長度：74~164cm` → length `74~164` cm); importer passes them through to the range-aware backend; ref-keyed upsert re-import repairs affected items.

## Technical Context

Backend: `core/attributes.py` number branch only (no migration — `value_number_max` exists); parser regex widening. Frontend: `ParameterRowsEditor` number input swap; `format.ts` separator. Data: upsert re-import (PKs/scenarios preserved). TDD at each step; e2e range-display expectations updated ("5 - 10 mAh" → "5 ~ 10 mAh").

## Constitution Check

PASS — I (shared core attribute infra), V (TDD), VI (validated inputs, single placeholder unaffected), VIII (range validation message reused, locales unchanged).

## Complexity Tracking

*(none)*
