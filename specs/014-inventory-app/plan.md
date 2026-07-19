# Implementation Plan: Inventory App — Iteration 30 (Keyed 寬度/高度/直徑/耐溫 extraction + explicit range-mode input)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 30; FR-002b/FR-026/FR-029h amended. Constitution v1.22.0.

## Summary

1. **New system definitions** — migration seeds `diameter` (dimension/length, 📏) and `temperature` (dimension/temperature, 🌡); localized labels + SYSTEM key maps (frontend) updated; importer's measure loop gains both keys.
2. **Keyed extraction (FR-029h)** — parser patterns for 寬度/高度/直徑/耐溫 (range-capable via a SIGNED grammar: `-?a(~-?b | -b)`); 耐溫 units 度C/℃/°C → °C. The 食品级折叠水杯 gains 高度 1.8~8 cm, 直徑 5.5~9 cm, 溫度 -40~230 °C on re-import.
3. **Range-mode input (FR-002b)** — shared `RangeValueInput`: mode picker (exact | range) + one or two InputNumbers (+ unit select for dimension rows); mode seeds from the stored value; emits canonical text; min ≤ max validated inline. Replaces the bare text input in ParameterRowsEditor for both dimension and number rows.
4. **Data refresh** — ref-keyed upsert re-import; verify the cup's three new parameters (temperature canonical min −40 / max 230) and the 憨客 strap keeps 74~164.

## Technical Context

Backend: core migration (seed only — model unchanged); parser regex + unit normalization. Frontend: RangeValueInput component (RTL-first), editor wiring, locale keys (mode labels + new parameter labels ×2). Existing e2e that types "5-10"/"10-5" into the old text input must be reworked to the new two-field flow.

## Constitution Check

PASS — I (definitions seeded via migration, never hardcoded), V (TDD), VI (validated inputs, inline error), VIII (all new labels in both locales).

## Complexity Tracking

*(none)*
