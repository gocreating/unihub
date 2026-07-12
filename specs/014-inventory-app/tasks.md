---
description: "Task list for Inventory App — Iteration 21 (2026-07-12)"
---

# Tasks: Inventory App — Iteration 21 (Flat-mode acquisition Edit link)

**Input**: [plan.md](plan.md) (iteration 21), [spec.md](spec.md) — FR-003 revised. Constitution **v1.22.0**.

**Baseline**: Iteration 20 shipped at `eb3b478`. Root cause pre-confirmed (R21.1).

## Phase 2: Fix (US1)

- [X] T001 [US1] Write failing RTL specs in `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx`: in FLAT mode (item-column sort) every item row's Actions cell contains an Edit anchor with `href` `/inventory/acquisitions/<parent id>/edit` alongside Deprecate/Restore; in TREE mode item child rows still carry NO Edit
- [X] T002 [US1] Implement in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` (item-row actions branch: `flatMode && r.acquisition` → Edit href button, SPA left-click); T001 green
- [X] T003 [US1] Extend `apps/unihub/frontend/e2e/inventory-catalog.spec.ts` (the flatten test): after flattening, item rows expose the Edit link

## Phase 2b: Mid-iteration additions (user-reported)

- [X] T003b [US3] Search-modal result rows: zero horizontal List.Item padding (entries fill the container) — RTL locks paddingLeft/Right 0 in `ScenarioDetail.test.tsx`; implemented in `detail.tsx`
- [X] T003c [US3] Both organize panes use the AntD Empty component for their empty state (left pane was plain text) — RTL locks `.ant-empty` in both panes; implemented in `detail.tsx`

## Phase 3: Polish

- [X] T004 Full frontend loop (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`); backend loop untouched-check; docker frontend rebuild; ALL inventory e2e; live screenshot of a filtered flat list with Edit links

