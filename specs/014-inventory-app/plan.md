# Implementation Plan: Inventory App — Iteration 15 (Catalog single-row merge + import repairs)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 "catalog single-row merge, date ranges, import repairs, iteration 15"; FR-003 (revised), FR-003a (revised), **FR-003b** (new), FR-024 (revised), **FR-029a** (new).

## Summary

Catalog density round two plus legacy-import repairs:

1. **Merged single-item rows (FR-003b)** — an acquisition with exactly one item renders collapsed (default) as ONE row carrying both the acquisition summary and the item's columns, with both entities' actions; the caret splits it into the classic two rows. Multi-item acquisitions stay expanded by default.
2. **Item column layers** — quantity column hidden by default (v5 key); the Item cell gains a `×{quantity}` tertiary row (quantity > 1 only); unmerged acquisition parent rows show the localized item count in the Item cell.
3. **Acquisition column** — four exact date cases (` `, `{r} ~`, `{o}`, `{r} ~ {o}`); zero net cost hidden entirely.
4. **Footer totals** — Catalog reads "{x} acquisitions, {y} items" (server-computed on the filtered queryset in both modes) via a new `EntityOffsetFooter` custom-total slot + a core pagination hook for per-view footer totals.
5. **Importer fixes (FR-029a)** — root causes CONFIRMED during Phase 0: (a) the parser does not expand **`rowspan`** cells, so vertically-merged 購買日期 cells (e.g. niko-and + MUJI 武商夢時代 sharing `2026/04/25`) lose the date on the second acquisition; (b) `parse_remark` drops bare keyless 備註 lines (代買); (c) the sheet explicitly records `0` in 實際支付價錢 (not an importer fabrication) — the fix is to keep the derived accumulated when the column is BLANK, never coercing blank→0. After the fixes: wipe the legacy acquisitions and fully re-import 2026 (current DB is 100% legacy rows, no manual-only rows; manual date patches with the `T16:00:00Z` signature are superseded by correctly-imported values).

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend/parser)

**Primary Dependencies**: unchanged (React/AntD/TanStack; Django/DRF). No new packages.

**Storage**: PostgreSQL 16 — **no schema change**; data operation = legacy wipe + re-import (management command).

**Testing**: Vitest+RTL (catalog merge/tertiary/count/date-cases/zero-hide/footer; EntityOffsetFooter slot), pytest (parser regression suite with a synthetic HTML fixture incl. rowspan/代買/blank-vs-0; footer totals in list responses), Playwright (merged-row default + footer text; existing suites adjusted).

**Target Platform**: unihub dashboard SPA

**Project Type**: Web application (monorepo)

**Performance Goals**: Footer totals via one aggregate on the already-filtered queryset (no N+1, no extra request); merged rows are render-time only (no API change).

**Constraints**: Merged row IS the acquisition row (sort/filter semantics untouched); default-expansion state = multi-item expanded / single-item collapsed with one toggle-set tracking flips; footer keeps the v1.19.0 layout (info left, controls right).

**Scale/Scope**: catalog page rework, EntityOffsetFooter + core pagination hook, AcquisitionSummaryLines refactor, parser fixes (`scripts/preview_legacy_import.py`) + importer blank-paid rule, re-import run, locales ×2, RTL/pytest/e2e updates.

## Constitution Check

*GATE evaluated against constitution v1.20.0 — pre-Phase-0 PASS; re-checked post-Phase-1 PASS.*

| Principle | Gate | Status |
|---|---|---|
| I / data_io | No model change; no descriptor change. Re-import re-creates AttributeValues via the standard serializer path. | PASS |
| IV Contracts | List responses gain an optional `totals` object via core pagination hook → OpenAPI + types regen BEFORE frontend consumption. | PASS (task-ordered) |
| V Quality/TDD | Parser regression tests (new fixture-driven pytest) before parser fixes; RTL before catalog rework; loops both sides. | PASS |
| VI v1.20.0 rules | New date-case renderer shows NOTHING when both absent (allowed: absence of the secondary row is not an "empty cell" — the cell still shows the primary source line); zero-cost hidden per user decision; tooltips remain truncation-gated; EmptyValue continues elsewhere. | PASS |
| VII PageTable/footer | Footer layout untouched — only the info-side text becomes "{x} acquisitions, {y} items" via a slot; other pages unchanged. | PASS |
| VIII i18n | New keys (footer totals, "{n} items" count) in BOTH locales. | PASS |
| XII toolbar | Column defaults v5 (quantity hidden); no toolbar mechanics change. | PASS |

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file (iteration 15)
├── research.md          # + R15.* (root causes with evidence)
├── data-model.md        # + note: no schema change; totals are response-only
├── contracts/           # inventory-api.md delta (+totals), regen types
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/pagination.py                  # EntityOffsetPagination: optional view hook get_footer_totals(qs) → response "totals"
├── inventory/views.py                  # AcquisitionViewSet/ItemViewSet implement get_footer_totals
├── inventory/management/commands/import_legacy_csv.py  # blank-paid rule (keep derived accumulated); wipe+reimport flow
└── tests/test_legacy_parser.py         # NEW — fixture HTML: rowspan date, 代買 bare line, blank vs explicit-0 paid
    tests/test_inventory_*.py           # + footer totals assertions

specs/014-inventory-app/scripts/preview_legacy_import.py  # rowspan expansion + parse_remark keyless-line preservation

apps/unihub/frontend/src/
├── components/EntityToolbar/EntityOffsetFooter.tsx  # + totalText?: ReactNode slot (default stays "{total} records")
├── pages/inventory/catalog/index.tsx   # merged single-item rows, ×N tertiary, parent item count,
│                                       #   4-case date renderer, zero-cost hidden, quantity hidden (v5),
│                                       #   footer totals wiring (both modes)
├── services/unihub-backend/inventory.ts# totals in OffsetPaginatedResponse (regen-backed)
└── locales/{en-US,zh-TW}/pages.ts      # footerTotals + itemCount keys
```

**Structure Decision**: Existing layout; the footer-totals mechanism lands in core (pagination + shared footer) so any future page can opt in.

## Phase 0 — Research (evidence gathered this session; full notes in research.md R15.1–R15.6)

- **R15.1 rowspan**: raw 2026.html shows the MUJI 武商夢時代 row with NO 購買日期 td — the date `2026/04/25` is a rowspan-merged cell owned by the preceding niko-and row (same mall/trip). The parser's normaliser expands colspan only. Fix: carry rowspan cells down during table normalisation. Parser preview currently yields `[12] MUJI 武商夢時代 req=— obt=—` (regression proof).
- **R15.2 代買**: `parse_remark` resolves `key：value` lines but discards bare lines; the no-data-loss guarantee requires appending them to `remark`.
- **R15.3 zero paid**: the sheet explicitly stores `0` in 實際支付價錢 for many rows (real prices under 備註 單價) — importer is honest; only blank→0 coercion must be prevented. UI hides zero net cost regardless.
- **R15.4 DB state**: 68 acquisitions, all legacy, zero null-dated (the user manually patched several via the edit form — `T16:00:00Z` timestamps); wipe+re-import is clean and supersedes the manual patches with parsed values.
- **R15.5 footer totals**: no existing aggregate; cleanest as a core pagination hook (`get_footer_totals`) so the count query runs once server-side on the filtered queryset (tree: `Count('items')` aggregate; flat: `Count('acquisition', distinct=True)`).
- **R15.6 merge rendering**: purely render-time — single-item acquisition + collapsed ⇒ item-side renderers read `acquisition.items[0]`; one `toggledIds` set flips per-row defaults (multi=expanded, single=collapsed).

## Phase 1 — Design & Contracts

- **Contracts**: `OffsetPaginatedResponse` gains optional `totals?: Record<string, number>`; Acquisition list → `{acquisitions, items}`, Item list → `{acquisitions, items}`. Regen schema/types after the pagination change; delta appended to contracts/inventory-api.md.
- **data-model.md**: note appended (no schema change).
- **Agent context**: CLAUDE.md SPECKIT block updated to iteration 15.

## Complexity Tracking

*(no constitution violations — intentionally empty)*
