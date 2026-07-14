---
description: "Task list for Inventory App — Iteration 25 (2026-07-13)"
---

# Tasks: Inventory App — Iteration 25 (Verbatim 備註, per-row prices, stable import PKs)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029f new. Constitution **v1.22.0**.

**Baseline**: Iteration 24 shipped at `caa60c7`. Root causes measured (R25.1–R25.3).

## Phase 2: Parser strategy (FR-029f a+b)

- [X] T001 Write failing fixtures in `apps/unihub/backend/tests/test_legacy_parser.py`: (a) Matador-style multi own-price rows → each item sku_price, override = per-currency SUM; (b) Zenfone single-row → item sku 5600 + override 5600; (c) rowspan-total ShopA style unchanged (override 100, skus from 單價); (d) qty>1 own-price row without 單價 → sku = price/qty; (e) 備註 verbatim: multi-item acq → each row's whole 備註 in item.spec; single-item acq → whole 備註 in acquisition.remark (代買/單價 lines included)
- [X] T002 Rework `specs/014-inventory-app/scripts/preview_legacy_import.py` `build_from_rows` into collect+finalize phases implementing (a)+(b); update older tests' destination expectations; parser suite green
- [X] T003 Tighten `apps/unihub/backend/tests/test_legacy_coverage.py` (item-row 備註 near-verbatim); all 12 sheets green

## Phase 3: Stable refs (FR-029f c)

- [X] T004 Migration 0015 `legacy_ref` (Acquisition + Item; null, db_index; NOT in API serializers); pytest: refs excluded from API payloads; data_io descriptor carries them
- [X] T005 Importer upsert mode (default): match by ref → update scalars (never alias_name) + items via ItemSerializer partial (parameters incl.) + factors wholesale; create missing; delete sheet-absent year-refs; ref-less untouched; unmatched-items fallback recreate (flagged); `--stamp-refs` order-matching with name+source verification; failing pytest FIRST: import fixture → attach scenario membership → re-import → item pk unchanged + membership intact; modified sheet remark updates in place
- [X] T006 Run: `--stamp-refs` on all 12 sheets against the live DB (expect 100% verified matches; report any exclusions), then upsert-import all 12 (NO wipe); verify: scenario memberships/pks unchanged, Matador items carry their skus, Zenfone sku 5600, 備註 destinations, totals consistent

## Phase 4: Polish

- [X] T007 Full loops; ALL inventory e2e; live screenshot (a Matador item's sku in the catalog); commit + push
