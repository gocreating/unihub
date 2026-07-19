# Implementation Plan: Inventory App — Iteration 40 (Segmented 備註 key-value parsing)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 40; FR-029j new. Constitution v1.22.0.

## Summary

`parse_remark` refactor: the per-line pattern block extracts into a unit-processor; a router pre-checks the delimiter-spanning forms (discount/variant/whole-line shipping → whole-line unit), otherwise splits the line into segments (`，`/`、`/spaced-`/`) and processes each — consumed segments extract, unconsumed segments go to remark. `[Cc]olor` joins the 顏色/款式 keys. Fixture-locked on the two reported shapes + the real-data variants (`Size: XL，顏色:09 BLACK`, `size: 43/46` intact, `規格：180ml/灰色…` intact, 內褲/discount/variant regressions). Upsert re-import + verification.

## Constitution Check

PASS — V (fixtures first; sweep re-verifies verbatim).

## Complexity Tracking

*(none)*
