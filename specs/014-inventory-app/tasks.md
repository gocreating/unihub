---
description: "Task list for Inventory App — Iteration 15 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 15 (Catalog single-row merge + import repairs)

**Input**: [plan.md](plan.md) (iteration 15), [spec.md](spec.md) — FR-003/003a revised, FR-003b + FR-029a new. Constitution **v1.20.0**.

**Tests**: REQUIRED — test-first on both sides (parser fixture pytest before parser fixes; RTL before catalog rework).

**Baseline**: Iteration 14 + v1.20.0 shipped at `f5140d7`. Delta iteration; root causes pre-confirmed (research R15.1–R15.6).

**Organization**: All work serves US1 (catalog) except the importer track (US2-adjacent data quality). Backend footer-totals hook is foundational for the frontend footer.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none)*

---

## Phase 2: Foundational (importer fixes + footer-totals backend + contracts)

- [ ] T001 [P] Write failing parser regression tests in `apps/unihub/backend/tests/test_legacy_parser.py` (NEW; loads the parser via the same dynamic mechanism as the management command) against a small inline HTML fixture: (a) a **rowspan-merged 購買日期 cell** applies to BOTH spanned rows' acquisitions; (b) a bare keyless 備註 line (代買) lands in the item's `remark` alongside resolved keys; (c) 購買日期 range `2026/06/25~2026/06/26` still maps to request/obtained (regression guard)
- [ ] T002 [P] Fix `specs/014-inventory-app/scripts/preview_legacy_import.py`: expand **rowspan** during table normalisation (carry merged cells into subsequent rows) and make `parse_remark` append **unresolved bare lines to `remark`** (no data loss); T001 green; preview run shows `MUJI 無印良品（武商夢時代）` with `obt=2026-04-25` and the 代買 items carrying remark
- [ ] T003 Write failing pytest for the importer blank-paid rule + wipe flow in `apps/unihub/backend/tests/test_legacy_parser.py` or `test_inventory_io.py`: when 實際支付價錢 is BLANK for the whole acquisition the derived item-price accumulated is KEPT (no 0-override); an explicit recorded `0` stays 0; then implement in `apps/unihub/backend/inventory/management/commands/import_legacy_csv.py` (incl. a `--wipe` option deleting all existing acquisitions before import — current DB is 100% legacy)
- [ ] T004 Write failing pytest for footer totals in `apps/unihub/backend/tests/test_inventory_items.py`/`test_inventory_acquisitions.py`: acquisition list response carries `totals == {"acquisitions": <filtered count>, "items": <aggregate item total>}`; item list carries `totals == {"acquisitions": <distinct>, "items": <count>}`; totals respect active filters
- [ ] T005 Implement the totals hook: `apps/unihub/backend/core/pagination.py` — `EntityOffsetPagination` captures the filtered queryset and, when the view defines `get_footer_totals(qs)`, includes its dict as `totals` in the response; `AcquisitionViewSet`/`ItemViewSet` in `apps/unihub/backend/inventory/views.py` implement it; T004 green; backend loop green
- [ ] T006 Regenerate contracts (OpenAPI → `src/generated/api-types.ts`); add `totals?: { acquisitions: number; items: number }` to `OffsetPaginatedResponse` consumption in `apps/unihub/frontend/src/components/EntityToolbar` types / `services/unihub-backend/inventory.ts`; append the delta to `specs/014-inventory-app/contracts/inventory-api.md`

**Checkpoint**: Parser + importer verified by tests; totals served; types regenerated.

---

## Phase 3: User Story 1 — Catalog merge & density (P1)

**Goal**: Merged single-item rows, layered Item cell, exact date cases, hidden zero cost, quantity column hidden, "{x} acquisitions, {y} items" footer.

**Independent Test**: A single-item acquisition shows as ONE collapsed row (acquisition summary + item columns + Edit/Delete/Deprecate); its caret expands to two rows and back. A 3-item acquisition is expanded by default and its parent Item cell reads "3 items". An item with quantity 2 shows "×2" as an Item-cell tertiary row and no Quantity column exists by default. Acquisition dates render per the four cases; zero net cost shows source only. The footer reads "68 acquisitions, 90 items".

- [ ] T007 [US1] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx`: (a) single-item acquisition renders ONE row (item name + acquisition summary on the same row) with Edit+Delete+Deprecate actions, collapsed caret; toggling the caret splits into two rows; (b) multi-item acquisition stays expanded with the parent Item cell showing the localized count ("2 items"); (c) Item cell tertiary "×2" when quantity 2, absent when 1; (d) default headers exclude Quantity (still listed in the Columns dropdown, key v5); (e) date cases: both → "r ~ o", only requested → "r ~", only obtained → "o", none → no date row; (f) zero net cost → primary shows only the source; (g) footer renders "1 acquisitions, 2 items"-style totals from the response
- [ ] T008 [P] [US1] Add `totalText?: ReactNode` slot to `apps/unihub/frontend/src/components/EntityToolbar/EntityOffsetFooter.tsx` (defaults to the existing "{total} records"; info-left layout untouched) with an RTL spec in `EntityOffsetFooter.test.tsx`
- [ ] T009 [US1] Implement the catalog rework in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: merged single-item rows (render-time `mergedItemOf(row)`; `toggledIds` set flipping per-row defaults — multi expanded / single collapsed); Item cell tertiary `×{quantity}` (>1) + parent-row item count; four-case date renderer in `acquisitionSummaryLines` (no placeholder side); zero net cost filtered out of the primary; columnDefs v5 with quantity `visible:false`; footer wired to `totals` via the new `totalText` slot (both modes); `displayText` measures merged rows/tertiary; T007 green
- [ ] T010 [US1] Locales `apps/unihub/frontend/src/locales/{en-US,zh-TW}/pages.ts`: footer totals key (`{acquisitions} acquisitions, {items} items` / zh) + item-count cell key (`{count} items` / zh), same commit
- [ ] T011 [US1] Update Playwright `apps/unihub/frontend/e2e/inventory-catalog.spec.ts`: single-item acquisitions render merged (level-0 row containing an item link, no level-1 sibling until expanded); multi-item still expanded; footer matches `\d+ acquisitions, \d+ items`; adjust any assertions relying on quantity column or "records" text

**Checkpoint**: Catalog matches FR-003b + revised FR-003/003a; RTL + e2e green.

---

## Phase 4: Data repair (after code fixes)

- [ ] T012 Rebuild the backend container, run the wipe + re-import against `data/財產們/2026.html`, then verify over the live API: MUJI 武商夢時代 and 迪卡儂 acquisitions carry parsed dates; the "niko and …996216" and "Filter017…" items carry 代買 in remark; blank-paid acquisitions show derived accumulated (not 0); explicit-0 rows keep 0 (hidden in UI)

---

## Phase 5: Polish & Cross-Cutting

- [ ] T013 Full quality loops (backend `ruff`+`pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`) — zero warnings
- [ ] T014 Live verification + screenshot: merged rows, ×N tertiary, item counts, date cases, hidden zero costs, footer totals; run all inventory Playwright suites

---

## Dependencies & Execution Order

- **Phase 2**: T001→T002 (parser TDD, [P] with T004 track); T003 after T002; T004→T005→T006 (totals chain).
- **Phase 3**: T007 first (tests), T008 [P] anytime; T009 needs T006 (types) + T008; T010 with T009; T011 last in phase.
- **Phase 4**: T012 strictly after T002+T003.
- **Phase 5**: T013→T014 last.

```text
T001 → T002 → T003 ──────────────┐→ T012 ─┐
T004 → T005 → T006 ─┐            │        ├→ T013 → T014
T008 ───────────────┼→ T007 → T009 → T010 → T011 ─┘
```

## Implementation Strategy

Importer fixes land before the data wipe (Phase 4 gates on green parser tests). MVP = Phases 2+3; the re-import (T012) is a one-time operation executed only after tests prove the parser handles the known defects.
