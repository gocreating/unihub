---
description: "Task list for Inventory App — Iteration 24 (2026-07-13)"
---

# Tasks: Inventory App — Iteration 24 (Default filter as plain OR conditions)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-003 revised. Constitution **v1.22.0**.

**Baseline**: Iteration 23 shipped at `c04b11e`. Backend or-group support verified (R24.1).

## Phase 2: Fix (US1)

- [ ] T001 [US1] Update the RTL payload assertion in `apps/unihub/frontend/src/pages/inventory/catalog/CatalogPage.test.tsx` (CAT17-04): `filters` = ONE `{logic:'or'}` group with the two plain conditions; add a backend pytest in `apps/unihub/backend/tests/test_inventory_acquisitions.py` asserting the single-or-group payload returns YTD + pending rows
- [ ] T002 [US1] Reshape `defaultFilterGroups` in `apps/unihub/frontend/src/pages/inventory/catalog/index.tsx` to the single or-group; T001 green
- [ ] T003 [US1] Live-verify: the Filter panel shows two flat condition rows joined by OR (no nested groups); screenshot

## Phase 3: Polish

- [ ] T004 Loops (frontend + backend), docker frontend rebuild, ALL inventory e2e, commit + push
