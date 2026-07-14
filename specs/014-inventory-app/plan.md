# Implementation Plan: Inventory App — Iteration 25 (Verbatim 備註, per-row prices, stable import PKs)

**Branch**: `014-inventory-app` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-13 iteration 25; FR-029f new. Constitution v1.22.0.

## Summary

1. **Per-row prices (a)** — `build_from_rows` becomes two-phase (collect rows per acquisition → finalize): own-price item rows feed `sku_price` (÷ qty without explicit 單價); multiple own-price rows → paid override = per-currency sum; the rowspan-total style is unchanged. Fixtures: Matador multi-own-price, Zenfone single-row, existing ShopA rowspan-total regression.
2. **Verbatim 備註 (b)** — destinations by item count at finalize: >1 item → each row's 備註 whole into `item.spec`; exactly 1 → `acquisition.remark`. Extraction unchanged on top (spec/remark residue writing retired). Sweep tightens to near-verbatim for item rows; old tests' destinations updated.
3. **Stable refs (c)** — migration 0015: `legacy_ref` on Acquisition + Item (null=True, db_index, not in API serializers). Importer default mode = UPSERT by ref: scalars via serializer partial (never `alias_name`), items matched by ref → `ItemSerializer` partial (with parameters); cost factors replaced wholesale; sheet-absent year-refs deleted; ref-less records untouched; an acquisition whose sheet items no longer match refs falls back to recreate (flagged). `--stamp-refs` one-time mode: per year, order-match parser output to DB rows (created_at order) with name+source verification, stamping refs without touching data — scenarios survive the transition.
4. **Data run** — stamp refs (verify 100% match), then upsert-import all 12 sheets (no wipe): verify Matador skus, Zenfone sku 5600, 備註 destinations, totals; prove item PKs + scenario memberships unchanged before/after.

## Technical Context

Backend + parser only. New pytest coverage: parser fixtures (a/b), importer upsert pk-stability (fixture import → add scenario membership → re-import → same item pk, membership intact), stamp-match unit. data_io picks `legacy_ref` up automatically.

## Constitution Check

PASS — V (fixtures before behavior changes; pk-stability proven by test before the live run), I (descriptors auto-update; schema change ships with data_io in the same change).

## Complexity Tracking

*(none)*
