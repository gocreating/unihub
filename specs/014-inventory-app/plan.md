# Implementation Plan: Inventory App — Iteration 20 (Plural audit, no-data-loss import hardening, organize drag polish)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 iteration 20; FR-011 (tree-drag stability, modal tooltips), FR-029d (continuation fix + date-rule lock + content-coverage sweep + re-import). Constitution **v1.22.0** (ICU plurals).

## Summary

1. **Plural audit (v1.22.0)** — every count-bearing en-US key converts to ICU plural: `common.entityOps.pagination.total` ("{total} records" — the reported "1 records"), finance/acquisition delete confirms, io counts (`downloadZip`, `missingCsv`, `sync.ahead/behind`, `publish.success`), `catalog.rowCount`, `params.deleteBody`. RTL locks "1 record" on the shared footer. zh-TW untouched.
2. **Parser continuation fix (LG ×4)** — a continuation row (rowspan-carried 項目) without an OWN 項目 cell never creates an item; its own 備註 content appends to the current item's `spec` (newline-joined). Fixture regression test first.
3. **Date-rule lock** — explicit parser tests: single date → obtained only; open range (`d~`) → requested only; same-day range → both; `??~d` → obtained only. (Behavior verified already correct against sources — tests prevent regression.)
4. **Content-coverage sweep (FR-029d)** — a pytest walks every sheet under `data/財產們/` (skipif absent): for each acquisition group, every non-empty 備註 line, 項目 cell, and 購買地點 cell must be findable in the built payloads (name/spec/remark/params/url/source/factor values), modulo documented normalizations. Any dropped content fails the suite.
5. **Full re-import** — after fixes: wipe + re-import all 12 sheets; re-verify totals per-sheet-preview sums (counts will change vs iteration 19: continuation rows no longer mint items) and FR-029c spot checks.
6. **Tree-drag stability** — during a tree drag the active row + subtree stay rendered (dimmed, like the flat pane); slots inside the active subtree are invalid (no indicator, drop ignored); projection still uses the subtree-excluded working list.
7. **Modal tooltips** — result titles: truncation-gated tooltip (aliased rows keep the original-name tooltip; never nested) with the highlight preserved; spec + acquisition-context lines wrap in OverflowTooltip.

## Technical Context

**Language/Version**: TypeScript 5.7, Python 3.12. No schema/API change; parser + frontend only.

**Testing**: pytest fixtures for the continuation/date rules; the coverage sweep is a REAL suite test over the actual data files (host runs have `data/`; CI/container runs skip). RTL: footer plural, tree-drag rendering (active row stays), modal tooltips. e2e: tree drag without row disappearance (assert the dragged row remains attached mid-drag), modal tooltip on hover.

**Constraints**: The re-import wipes scenario memberships (accepted precedent). The sweep must tolerate known transforms: dates (`2026/07/09~…` → ISO fields), prices/currencies (→ sku/factors), URLs (→ `url`), resolved keys (規格/尺寸/顏色… → spec/params). It asserts CONTENT PRESENCE, not formatting equality.

**Scale/Scope**: Locale conversions (~9 keys) + footer RTL; parser fix + 4 date tests + sweep test; detail.tsx drag rendering + modal tooltip tweaks; wipe/re-import + verification.

## Constitution Check

*GATE vs v1.22.0 — PASS.*

| Principle | Gate | Status |
|---|---|---|
| VIII v1.22.0 | The new plural rule is applied to ALL existing count keys in this change; footer RTL locks it. | PASS |
| VI | Modal tooltips become truncation-gated (fixing a live violation); no nesting with the alias tooltip. | PASS |
| V TDD | Parser fixtures before the fix; sweep test before re-import; RTL before UI changes. | PASS |
| I | No schema change; importer semantics changes are regression-locked. | PASS |

## Project Structure

```text
apps/unihub/frontend/src/
├── locales/en-US/pages.ts                      # ICU plural conversions
├── components/EntityToolbar/EntityOffsetFooter.test.tsx  # "1 record" lock
└── pages/inventory/scenarios/detail.tsx        # stable tree drag; modal tooltips

apps/unihub/backend/tests/test_legacy_parser.py # continuation + date-rule fixtures
apps/unihub/backend/tests/test_legacy_coverage.py  # NEW: content-coverage sweep (skipif no data/)
specs/014-inventory-app/scripts/preview_legacy_import.py  # continuation fix
```

## Phase 0 — Research (research.md R20.1–R20.4)

- **R20.1 LG root cause (CONFIRMED)**: item cell `rowspan=4` + four own 備註 cells → each carried row minted an item. Fix at grouping: own-項目 required for a new item; own 備註 on carried rows merges into the current item's spec.
- **R20.2 Date rules (VERIFIED FAITHFUL)**: single→obtained already correct; "requested-only" rows in the UI trace to open ranges, "req=obt" to same-day ranges in the sources. Locked with tests instead of changed.
- **R20.3 Sweep design**: parser-level (no DB): per sheet, per acquisition group, collect raw cell texts (項目, 購買地點, 備註 lines) and assert presence in the payload's joined searchable text; skip pure-date/price/currency cells (transformed by design); report every miss with sheet/row context.
- **R20.4 Tree-drag rendering**: keep `rows` rendered during tree drags (subtree included, dimmed via an `activeSubtree` id set); `over` targets inside the subtree → clear indicator, no-op drop; valid targets map through the existing `gapFromVisible` against the subtree-EXCLUDED working list.

## Phase 1 — Design & Contracts

None (no API/schema change). Agent context → iteration 20.

## Complexity Tracking

*(no violations — empty)*
