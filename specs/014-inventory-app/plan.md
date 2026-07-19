# Implementation Plan: Inventory App — Iteration 36 (Remark icon, unknown deprecate time, deprecated warnings, per-unit dims)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 36; FR-001/FR-011/FR-029g/FR-031 amended. Constitution v1.22.0.

## Summary

1. **Deprecated flag** — `Item.deprecated` boolean (+migration backfill), `status` derives from it; serializer exposes it writeable; catalog Deprecate modal gains an "Unknown time" checkbox (picker disabled → time null); Restore clears both; types regen.
2. **ItemDisplay icons** — primary line becomes a flex row: truncating name + flex-none icons: comment icon w/ remark tooltip (always when remark), ⚠ deprecated warning (opt-in `showDeprecatedWarning`, on scenario panes + Add modal).
3. **Per-unit dims (FR-029g)** — RE_DIMS_U3/U2 (unit attached to each number, longest-first alternation, no word-boundary so `cmx` chains parse; per-part units kept) tried before the shared-unit patterns; size-suppression residue check tightens to any letter/han/digit (尺寸：S (…) keeps size). Fixtures over the real sheet variants; upsert re-import.

## Constitution Check

PASS — I (deprecated field auto-flows to data_io), V (TDD), VI (informational tooltips; "-" placeholder for unknown time), VIII (new labels ×2 locales).

## Complexity Tracking

*(none)*
