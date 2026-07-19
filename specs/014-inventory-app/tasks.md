---
description: "Task list for Inventory App — Iteration 44 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 44 (Anchored per-row list prices, block-total leak, composite color&size, RM→MYR)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029i amended, FR-029l new. Constitution **v1.22.0**.

**Baseline**: Iteration 43 shipped at `5de83e7`. Decisions in R44.1–R44.7.

- [x] T001 Regression fixtures FIRST (test_legacy_parser.py): 2021:29 composite `color & size` + leak (漁夫帽 sku None), 2021:31 anchored 原價 ×4 + factor-row carried price (value None, remark preserved), 2022:5 annotation listing (1380/780, deduped carried cell), 2023:8 `原價 74 * 2 顆` (299 / 74×2), 2023:32 anchored colonless 單價 quartet, 2024:32 `原價：N RM` tokens; existing 雨傘王/MUJI/own-paid-pair tests stay green.
- [x] T002 Parser (preview_legacy_import.py): `_QTY_UNITS` broadening; `RE_PRICE_ANCHORED` (單價 → sku, 原價 → `_own_list_price` tier); `RE_COLOR_SIZE` composite with trailing-size-token split; `RE_NAME_LIST_PRICE` annotation group + candidates(fragment→annotation→shortening) + blob dedupe + sku-set candidate skip; header block-total entry kill in `build_from_rows`; factor-row own-cell-only value.
- [x] T003 Importer: `CURRENCY_ALIASES` gains `"RM": "MYR"`.
- [x] T004 Before/after full-sheet diff (all 12 years) reviewed line-by-line; upsert re-import (per-year atomic); DB assertions for every reported ref (680/880/980/980, 1380/780, 299, 74×2, 449/549/799/599, 59/89/19.9 MYR, color/size split, bogus discount gone); counts + scenario memberships stable.
- [x] T005 Loops (exit codes unmasked): backend ruff+pytest, frontend lint/typecheck/test/build; commit + push; confirm CI.
