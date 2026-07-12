---
description: "Task list for Inventory App — Iteration 20 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 20 (Plural audit, no-data-loss hardening, drag polish)

**Input**: [plan.md](plan.md) (iteration 20), [spec.md](spec.md) — FR-011 revised, FR-029d new. Constitution **v1.22.0**.

**Tests**: REQUIRED — test-first everywhere (fixtures before parser changes; sweep before re-import; RTL before UI changes).

**Baseline**: Iteration 19 shipped at `39ccbf6`. Root causes pre-confirmed (research R20.1–R20.5).

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none)*

---

## Phase 2: Plural audit (constitution v1.22.0)

- [X] T001 Write failing RTL spec in `apps/unihub/frontend/src/components/EntityToolbar/EntityOffsetFooter.test.tsx`: total 1 renders "1 record", total 2 renders "2 records"; then convert ALL count-bearing en-US keys to ICU plural per R20.5 in `apps/unihub/frontend/src/locales/en-US/pages.ts` (verb agreement where applicable); T001 green; grep-audit confirms no remaining `(s)`/bare-plural count keys

---

## Phase 3: Parser hardening (FR-029d)

- [X] T002 Write failing fixture tests in `apps/unihub/backend/tests/test_legacy_parser.py`: (a) an item cell with `rowspan` and per-row 備註 cells yields ONE item whose `spec` carries the continuation lines newline-joined in sheet order (LG regression); (b) date rules: single date → obtained only; `d~` → requested only; `d~d` same day → both; `??~d` → obtained only
- [X] T003 Implement the continuation fix in `specs/014-inventory-app/scripts/preview_legacy_import.py` (a row with a CARRIED 項目 never creates an item; own 備註 → current item's spec); T002 green; existing parser suite still green (代買→remark unchanged)
- [X] T004 Write the **content-coverage sweep** `apps/unihub/backend/tests/test_legacy_coverage.py` (skipif `data/財產們` absent): per sheet, per acquisition group — every 項目 cell, 購買地點 cell, and non-empty 備註 line is findable (whitespace-normalized substring) in the acquisition's joined payload text; date/price/currency cells exempt; failures report sheet+row; fix ANY misses it surfaces (each with its own fixture test) until the sweep passes on all 12 sheets

---

## Phase 4: Organize drag + modal tooltips (FR-011)

- [X] T005 Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.test.tsx`: during a simulated tree drag the active row REMAINS in the document (dimmed) and its child rows stay rendered; modal result title (unaliased) carries a truncation-gated tooltip (defineProperty overflow → hover shows full name); spec/context lines render through OverflowTooltip
- [X] T006 Implement in `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: render the full row list during tree drags (activeSubtreeIds dimmed at 0.4; flat-pane parity); over-own-subtree → indicator cleared + drop no-op; valid targets map via the subtree-excluded working list; modal title tooltip (gated, highlight preserved, alias tooltip precedence) + OverflowTooltip on description lines; T005 green
- [X] T007 e2e `apps/unihub/frontend/e2e/inventory-scenario.spec.ts`: mid-drag assertion — while dragging a container row, its row count does NOT drop (no reflow); drop still works; modal title hover shows a tooltip when truncated (long-name item)

---

## Phase 5: Data repair (after parser fixes)

- [X] T008 Re-preview ALL 12 sheets (record new per-sheet counts — item counts SHRINK where continuation rows existed), then wipe + re-import all sheets oldest-first (`--wipe` on the first, plain `--commit` for the rest); verify: totals equal the new preview sums; the LG item is ONE row with the 4-line spec; 代買 remarks intact; per-year distribution consistent; content sweep green against the live parser output

---

## Phase 6: Polish & Cross-Cutting

- [X] T009 Full quality loops: backend `uv run ruff check . && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — zero warnings
- [X] T010 Rebuild docker (frontend; backend if importer files ship in the image), run ALL inventory Playwright suites, live-verify + screenshot: "1 record" footer case, stable tree drag, modal tooltip, LG single item

---

## Dependencies & Execution Order

- **Phase 2**: T001 standalone.
- **Phase 3**: T002 → T003 → T004 (sweep after the known fix so its first run isolates UNKNOWN misses).
- **Phase 4**: T005 → T006 → T007. Independent of Phase 3.
- **Phase 5**: T008 strictly after T003+T004.
- **Phase 6**: T009 → T010 last.

```text
T001 ─┐
T002 → T003 → T004 ─┼→ T008 → T009 → T010
T005 → T006 → T007 ─┘
```

## Implementation Strategy

Parser fixes land under fixtures before the sweep runs (so sweep failures isolate unknown loss cases), and the destructive re-import happens only after the whole parser suite is green. UI work is independent and parallelizable. Final verification exercises the repaired dataset.
