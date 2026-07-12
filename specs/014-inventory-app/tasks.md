---
description: "Task list for Inventory App — Iteration 22 (2026-07-13)"
---

# Tasks: Inventory App — Iteration 22 (Search-modal row geometry lock)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-011 revised. Constitution **v1.22.0**.

**Baseline**: Iteration 21 shipped at `ae95b86`. Root cause measured live (R22.1).

## Phase 2: Fix (US3)

- [ ] T001 [US3] Write failing RTL spec in `apps/unihub/frontend/src/pages/inventory/scenarios/ScenarioDetail.test.tsx`: the Add modal renders NO `.ant-list-item-action` element; each result row's Add button lives inside the row's own flex container (flex:none sibling of the flex:1 content)
- [ ] T002 [US3] Implement in `apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx`: renderItem drops the `actions` prop; row = flex (content flex:1 minWidth:0 · Add flex:none), zero horizontal padding; member/tooltip/disabled semantics unchanged; T001 green
- [ ] T003 [US3] e2e `apps/unihub/frontend/e2e/inventory-scenario.spec.ts`: **pixel-geometry regression lock** — for an ENABLED row and a DISABLED member row: |button.right − row.right| ≤ 2px AND |row.right − modal body content edge| ≤ 2px; run against the rebuilt container

## Phase 3: Polish

- [ ] T004 Full frontend loop; docker frontend rebuild; ALL inventory e2e; screenshot + live measurement recorded
