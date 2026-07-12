---
description: "Task list for Inventory App — Iteration 17 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 17 (Catalog polish + 2025 import)

**Input**: [plan.md](plan.md) (iteration 17), [spec.md](spec.md) — FR-003/FR-003a revised, FR-029b new. Constitution **v1.20.0**.

**Tests**: REQUIRED — test-first (hook + page RTL before implementation).

**Baseline**: Iteration 16 shipped at `4cbfd54`. Frontend-only delta plus one data operation; root causes pre-confirmed (research R17.1–R17.4).

**Organization**: All UI work serves US1 (catalog). The filter-seed plumbing is foundational (shared toolbar hook). The 2025 import is a data phase gated on nothing (importer unchanged) but run last so live verification sees the final UI.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

*(none — no new dependencies)*

---

## Phase 2: Foundational (filter seeding in the shared toolbar hooks)

- [ ] T001 Write failing hook specs in `apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityFilter.test.tsx`: a `defaultGroups` seed (a) initializes BOTH activeGroups and the pending panel state to the seed; (b) lights `isActive`; (c) is clearable (clearing/applying empty shows everything — active becomes empty); (d) leaves apply-gate semantics untouched (pending edits don't apply until Apply)
- [ ] T002 Implement `defaultGroups?: FilterGroup[]` in `apps/unihub/frontend/src/components/EntityToolbar/hooks/useEntityFilter.ts` (mirror `useEntitySort`'s `defaultRules` seeding) and thread `defaultFilterGroups` through `apps/unihub/frontend/src/components/EntityToolbar/useEntityTable.ts`; T001 green

**Checkpoint**: Pages can ship seeded default filters with unchanged toolbar semantics.

---

## Phase 3: User Story 1 — Catalog polish (P1)

**Goal**: Correct plurals, link-free Name column, content-fit URL column, YTD+pending default filter, 50/page.

**Independent Test**: Open the Catalog: Filter button is lit and its panel shows "obtained ≥ <Jan 1 this year> OR obtained is empty"; the footer reads pluralized totals ("… 1 item" when applicable); page size selector shows 50; expanding a single-item acquisition shows "1 item" (not "1 items"); toggling the Name column shows plain text (no link); toggling the URL column shows a ~320px-capped ellipsised link whose tooltip appears only when truncated.

- [ ] T003 [US1] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx`: (a) expanded single-item acquisition parent row shows **"1 item"**; multi-item parent shows "2 items" (update the existing "1 items" assertion); (b) footer pluralizes ("1 acquisition, 1 item" with singular mocks); (c) Name column (toggled visible) renders plain text — no `<a>` in the Name cell while the Item cell keeps its link; (d) URL column (toggled visible) renders the link with the 320px cap and an `OverflowTooltip`-gated title; (e) the Filter toolbar button is lit on load and `listAcquisitions` is called with the seeded two OR-groups (`acquisition__obtained_at gte <computed year start>` / `is_empty`); (f) the footer page-size select shows 50
- [ ] T004 [US1] Implement in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx`: Name colDef renders plain text; url colDef caps its measured width (`min(dataWidths.url, 320)` into `widthForHeader`) and wraps the link content in `OverflowTooltip`; `useEntityTable` gains `defaultPageSize: 50` and `defaultFilterGroups` = two OR-groups on `acquisition__obtained_at` (`gte` dayjs year-start / `is_empty`); T003 green
- [ ] T005 [P] [US1] Locales: `apps/unihub/frontend/src/locales/en-US/pages.ts` — `catalog.itemCount` → `{count, plural, one {# item} other {# items}}`; `catalog.footerTotals` → `{acquisitions, plural, one {# acquisition} other {# acquisitions}}, {items, plural, one {# item} other {# items}}`; zh-TW keys keep their wording (same commit)
- [ ] T006 [US1] Update Playwright `apps/unihub/frontend/e2e/inventory-catalog.spec.ts`: Filter button lit by default (`ant-btn-primary`); default page-size select reads 50; footer still matches the totals pattern under the default filter; Name column toggled on → no link in Name cells; URL column toggled on → its header width ≤ ~340px; adjust any assertions relying on 25/page or unfiltered counts

**Checkpoint**: Catalog matches revised FR-003/FR-003a; RTL green (e2e verified in Phase 5).

---

## Phase 4: Data — 2025 import (FR-029b)

- [ ] T007 Preview `data/財產們/2025.html` with `specs/014-inventory-app/scripts/preview_legacy_import.py` (note acquisition/item counts), then run `DATABASE_URL=postgresql://unihub:unihub@localhost:5433/unihub uv run python manage.py import_legacy_csv data/財產們/2025.html --commit` (NO `--wipe`) from `apps/unihub/backend/`; verify over the live API that totals grew by the preview counts and spot-check parsed dates/備註 remarks; confirm the default Catalog view still shows only YTD+pending (2025 rows appear after clearing the filter)

---

## Phase 5: Polish & Cross-Cutting

- [ ] T008 Full quality loops: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; backend `uv run ruff check . && uv run pytest` (should be untouched) — zero warnings
- [ ] T009 Rebuild the frontend image (`docker compose -f docker-compose.local.yml build frontend && up -d`), run ALL inventory Playwright suites against :3001, live-verify + screenshot: lit default filter, 50/page, pluralized counts, plain Name column, capped URL column, 2025 data behind the filter

---

## Dependencies & Execution Order

- **Phase 2**: T001 → T002 (blocks T004).
- **Phase 3**: T003 first (tests; needs nothing), T005 [P] anytime; T004 needs T002+T003+T005; T006 after T004.
- **Phase 4**: T007 independent of the UI track (importer unchanged); run after Phase 3 so live checks see the final UI.
- **Phase 5**: T008 → T009 last.

```text
T001 → T002 ─┐
T003 ────────┼→ T004 → T006 ─┐
T005 [P] ────┘               ├→ T007 → T008 → T009
```

## Implementation Strategy

Foundational filter-seed plumbing first (shared hook, test-first), then the catalog changes as one cohesive pass (they touch the same file), locales alongside. The import runs once against the live stack after the UI lands, followed by the full loops, e2e, and screenshot verification.
