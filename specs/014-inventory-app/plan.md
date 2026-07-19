# Implementation Plan: Inventory App — Iteration 35 (Key-value-only prices + adorned paid cells + data refresh)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-19 iteration 35; FR-029i new. Constitution v1.22.0.

## Summary

Parser-only: RE_PRICE requires the colon (RE_PRICE_QTY keeps the colonless quantity-expression form); paid cells parse via `extract_amount`. Fixture-locked (雨傘王 sku 725 from paid; 維尼披風 4200 JPY; colon/qty forms unchanged; the old prose-extraction test inverted). Ref-keyed upsert re-import of the updated sheets; verify both items + counts/PKs/scenarios.

## Constitution Check

PASS — V (fixtures first; sweep re-verifies no data loss).

## Complexity Tracking

*(none)*
