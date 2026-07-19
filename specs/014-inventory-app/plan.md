# Implementation Plan: Inventory App — Iteration 26 (New families, range values, triplet split, ItemDisplay)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 26; FR-002b revised, FR-029g/FR-031 new. Constitution v1.22.0.

## Summary

1. **Core families + ranges** — `core/units.py` gains temperature (°C canonical, °F **affine** — factor tables generalize to per-family converter functions), time (s; min/h) and battery (mAh; Ah); `AttributeDefinition.UNIT_FAMILY_CHOICES` extends; `AttributeValue` gains **`value_number_max`** (migration); `compute_value_fields` parses `min-max`/`min~max` ranges (canonical min → `value_number`, max → `value_number_max`) and returns a 4-tuple; serializers expose `value_number_max`; OpenAPI/types regen. Sorting/filtering stay on `value_number` (min).
2. **Parser triplet split (FR-029g)** — separators `x/×/X/*`, decimals, 3-part → 長/寬/高, 2-part → 長/寬; fully-split 尺寸 lines stop minting the `size` text param. Fixture-locked, then the SAFE upsert re-import repairs data in place.
3. **ItemDisplay (FR-031)** — one component (props: item, linkify, truncate, showParameters, extra slot) built on ItemName's tooltip rules + spec secondary + localized `key: value` parameter Tags (ranges as `min - max unit`); adopted by the catalog Item cell, acquisition item cards, scenario pane rows, and Add-modal results; `parameterBadges`-style value-only formats retired from mixed lists.
4. **Editor** — family picker gains the three families (with unit lists); the dimension value input becomes a validated text input accepting `5` or `5-10`.

## Technical Context

Backend: core migration + attributes/serializers; no inventory schema change. Frontend: shared component consolidation touching four surfaces; editor input rework. Data: upsert re-import (refs preserve scenario memberships). Tests first at each step: units/compute pytest (affine °F, ranges), parser fixtures (triplet variants), ItemDisplay RTL, surface RTL updates, e2e.

## Constitution Check

PASS — I (attribute infra stays in core; data_io auto-fields pick `value_number_max`), IV (regen ordered before frontend), V (TDD throughout), VI (tooltip/truncation rules inherited from ItemName), VIII (family/unit labels in both locales).

## Complexity Tracking

*(none)*
