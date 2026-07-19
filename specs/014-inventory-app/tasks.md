---
description: "Task list for Inventory App — Iteration 27 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 27 (Emoji keys, price format, catalog/nav/modal polish, data refresh)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-032/033/034 new; FR-003/003a/006/011/031 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 26 shipped at `6ad279e`. Decisions in R27.1–R27.8.

## Phase 2: Parameter emoji (FR-032)

- [x] T001 Backend TDD: failing pytests — `AttributeDefinition.emoji` persists via serializer; seed migration stamps 🎨 color / 👕 size / ⚖ weight / 📏 length·width·height / 🧴 volume; item `parameters` payload carries each definition's emoji. Implement field + migration + serializers; OpenAPI + `api-types.ts` + service types regen.
- [x] T002 Frontend TDD: failing RTL — `parameterPairs`/ItemDisplay render a set emoji as a monochrome prefix (`KeyEmoji` silhouette span, R27.2) before the localized key; key picker options show it; the inline definition-creation form offers an optional emoji input (locales ×2). Then implement.

## Phase 3: Price format (FR-033)

- [x] T003 Failing RTL for the shared currency module: symbol map, `formatPrice` → `"TWD $ 129"`, trailing zeros dropped, zero/empty → "-" (no code/symbol); PriceInput ([symbol select][numeric], placeholder while empty/0). Then implement the module + component.
- [x] T004 Adopt at every surface — display: catalog SKU column + `displayText`, net cost cells, acquisition summary line, item-card price tag, cost totals; input: ItemFormModal SKU price, cost-factor rows. Update existing RTL/e2e expecting the old `TWD 129` format.

## Phase 4: Catalog + shell + panes

- [x] T005 Catalog: Actions column `fixed: 'right'` in the default column state (+ persistence-version bump); Item column measured from the primary name line only with spec truncating at column width (R27.4); Remark column renders one ellipsised line with gated tooltip, measurement capped to the render. RTL/e2e updates.
- [x] T006 Shell/panes: side-nav items as real router `<Link>` hyperlinks (FR-034); acquisition item cards equal height per row (FR-006); Add-items modal wider + viewport-anchored bottom with inner-scrolling results (FR-011, R27.6) — e2e geometry locks.

## Phase 5: Data refresh + polish

- [x] T007 Re-run parser suite + coverage sweep against the UPDATED sheets (fix parser regressions the new content surfaces, if any); then ref-keyed upsert re-import of all sheets (NO wipe); verify counts, stable PKs, scenario memberships, spot-checks.
- [x] T008 Full loops both sides; docker rebuild; ALL inventory e2e; screenshots; commit + push.
