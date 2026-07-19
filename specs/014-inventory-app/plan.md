# Implementation Plan: Inventory — Iteration 44 (anchored per-row list prices, block-total leak, composite color&size, RM→MYR)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: Session 2026-07-19 (iteration 44) clarifications — FR-029i (amended), FR-029l (new).

## Summary

Six measured legacy-parser defects, all in `specs/014-inventory-app/scripts/preview_legacy_import.py` + `import_legacy_csv` (no schema, no API, no frontend changes):

1. **Block-total leak** (root cause of five of the six wrong-SKU reports): a header row's paid cell with `rowspan` spanning other ITEM rows fed BOTH the accumulated override AND the header item's own price → sku (3126/2260/437/1848/1273/2284 leaked). Drop the header own-price entry the moment a subsequent row in the same acquisition arrives carrying that cell AND becomes an item.
2. **Anchored own-remark price tier**: a 備註 segment that is ENTIRELY `(單價|原價)[:：]? N [currency] [* M unit]` is a price key-value. Anchored 單價 → sku directly (colon no longer required when anchored); anchored 原價 → new `_own_list_price` tier applied in `_finalize` ONLY when sku is still empty after the own-paid pass (preserves iteration-35 雨傘王 and iteration-39 paid÷qty precedence).
3. **Name-listing paren annotations**: `大箱子(黑色)原價 1380` — extend `RE_NAME_LIST_PRICE` with an optional `(annotation)` group; `candidates()` tries fragment → annotation → progressive shortening; dedupe carried duplicate 備註 cells in the blob; skip items whose sku a higher tier already set.
4. **Factor-row carried price**: a cost-factor row inside a paid rowspan consumed the CARRIED total (`運費及折扣` → bogus `discount 3126 TWD`). Use only OWN price cells; remark-derived values only when the remark is a single adorned amount (leftover check already exists — reuse it to null the value).
5. **Composite `color & size:` key**: consumes the segment before plain `size:` matches; split value on trailing standard size token → size, remainder → color; no token → verbatim only.
6. **Quantity units & RM→MYR**: broaden `* N <unit>` unit class to 件/組/個/顆/條/包/盒/雙 (RE_PRICE_QTY lookahead, RE_QTY_EXPR, RE_NAME_LIST_PRICE tail, anchored form); importer `CURRENCY_ALIASES` gains `"RM": "MYR"` (finance MYR exists, symbol RM — user-seeded).

Then: full parser-suite + content-coverage sweep, a **before/after full-sheet diff** enumerating every changed item (pattern fixes must be reviewed against ALL years, not just reported rows), ref-keyed upsert re-import of all years (per-year atomic, hard-error), DB spot-checks of every reported item, quality loops, commit/push, CI confirmation.

## Technical Context

**Language/Version**: Python 3.12 (parser + Django command); no frontend changes.
**Primary Dependencies**: stdlib-only parser; Django 5 / DRF import command; pytest-django.
**Storage**: PostgreSQL 16 (`localhost:5433` host-side for verification).
**Testing**: pytest-django (`apps/unihub/backend/tests/test_legacy_parser.py`, `test_legacy_import*.py`, content-coverage sweep).
**Target Platform**: local docker compose stack.
**Project Type**: web app (Django backend + React frontend monorepo).
**Performance Goals**: N/A (batch import).
**Constraints**: NEVER lose legacy data; imports upsert by `legacy_ref` (scenarios untouched); per-year atomic with loud errors; alias_name never overwritten; fix by PATTERN with sheet-wide surveys + full-diff review.
**Scale/Scope**: 12 sheets (2015–2026), ~660 acquisitions / ~1005 items.

## Constitution Check

- I (Spec-driven): session recorded in spec.md; FR-029i amended, FR-029l added. ✓
- II (Quality loops): backend ruff+pytest; frontend untouched (loops still run before commit). ✓
- III (Test-first): regression fixtures for every reported row + survey-derived edge cases BEFORE parser changes; sweep stays green. ✓
- IV/V/VIII (UI/i18n): no UI changes. N/A
- Data-safety: upsert by legacy_ref; per-year transaction; before/after diff reviewed. ✓

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file
├── research.md          # §Iteration 44 appended
├── spec.md              # Session 2026-07-19 (iteration 44); FR-029i amended, FR-029l new
├── scripts/preview_legacy_import.py   # THE parser (single source, dynamically loaded)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
specs/014-inventory-app/scripts/preview_legacy_import.py   # all parser changes
apps/unihub/backend/inventory/management/commands/import_legacy_csv.py  # RM→MYR alias
apps/unihub/backend/tests/test_legacy_parser.py            # regression fixtures
```

**Structure Decision**: existing layout untouched; parser + importer + tests only.

## Phase 0 — Research (research.md §Iteration 44)

Measurements already performed (this session): raw row extraction for all six reported blocks; live parser run reproducing every defect; DB state audit (leaked skus, literal `RM` currency, bogus `discount 3126`); sheet-wide surveys (193 anchored price segments incl. 雨傘王's prose-adjacent `原價850`; quantity unit chars 件組個顆條包盒雙; `&`-composite keys — exactly one real instance; finance currencies incl. user-seeded MYR/RM).

## Phase 1 — Design

**Data model**: unchanged (no migrations). **Contracts**: unchanged (no API surface).

### Parser changes (`preview_legacy_import.py`)

- `RE_COLOR_SIZE` composite: `(?:顏色|[Cc]olor)\s*&\s*(?:尺寸|[Ss]ize)[:：]\s*(.+)`; trailing token regex over `XS|S|M|L|XL|XXL|XXXL|[234]XL|F|FREE` (uppercase); matched → consume span, suppress plain size/color for that unit; split fails → residue verbatim, no fields.
- `_QTY_UNITS = "件組個顆條包盒雙"`; reuse in `RE_PRICE_QTY` lookahead, `RE_QTY_EXPR`, `RE_NAME_LIST_PRICE` tail, and `RE_PRICE_ANCHORED`.
- `RE_PRICE_ANCHORED`: `^(單價|原價)\s*[:：]?\s*([\d.,]+)\s*([A-Za-z]+|元|円|¥|￥)?\s*(?:\*\s*(\d+)\s*[QTY_UNITS]\s*)?$` matched against the SEGMENT in `_apply_unit` after existing `RE_PRICE`/`RE_PRICE_QTY`: 單價 → `sku_price` (+currency via existing normalization); 原價 → `_own_list_price`/`_own_list_currency` (qty rides the broadened `RE_QTY_EXPR`).
- `RE_NAME_LIST_PRICE` gains optional annotation group: `([一-鿿A-Za-z0-9]{1,8}?)\s*(?:[（(]([^（）()]{1,12})[)）])?原價\s*([\d.,]+)(?:\s*\*\s*(\d+)\s*[QTY_UNITS])?` (group renumbering in `_finalize`).
- `build_from_rows`: track the header own-price entry per acquisition; in the attachment ITEM branch, a non-own price text (carried) with a live header entry → remove that entry from `own_prices` (block total). Factor branch: `val = extract_amount(price) if own_price else None`; remark fallback keeps its value only when the existing leftover check finds nothing meaningful (else value None + remark preserved).
- `_finalize` ordering: own-paid pass → NEW own-list pass (`sku_price is None` guard, currency token verbatim) → name-listing (blob deduped via `dict.fromkeys`, candidates skip items with sku already set, annotation in try-order) → discount pass → currency inheritance (unchanged).

### Importer changes (`import_legacy_csv.py`)

- `CURRENCY_ALIASES = {"RMB": "CNY", "RM": "MYR"}`. Nothing else.

### Verification design

- **Before/after diff harness** (scratchpad): run git-HEAD parser vs new parser over all 12 sheets; print every item whose sku/currency/qty/color/size changed and every cost-factor delta; review line-by-line — leaked-total removals, new listed prices, new qty/color/size extractions are the only acceptable classes.
- Regression fixtures: 2021:29 (composite color&size + leak → 漁夫帽 sku None), 2021:31 (anchored 原價 ×4 + factor-row carried price → value None), 2022:5 (annotation listing 1380/780 + carried-cell dedupe), 2023:8 (`原價 74 * 2 顆`), 2023:32 (anchored colonless 單價 quartet), 2024:32 (RM tokens), 雨傘王 prose protection + MUJI 46/49/51 + own-paid 299 pair stay green.
- Import: `import_legacy_csv` per year (upsert), DB assertions for every reported ref, counts stable, scenario memberships intact.

## Phase 2 — Tasks

See tasks.md (T001 tests → T002 parser → T003 importer alias → T004 diff review + re-import + verification → T005 loops/commit/CI).
