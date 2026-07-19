---
description: "Task list for Inventory App — Iteration 29 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 29 (Faithful drag preview)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-011 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 28 shipped at `6a7bf72`. Decision in R29.1.

- [ ] T001 Failing e2e (`inventory-scenario.spec.ts`): mid-drag (before mouse.up) the overlay (`data-testid="drag-overlay"`) width matches the grabbed flat row's width within 2px AND contains the row's spec text (not just the name).
- [ ] T002 Implement: onDragStart captures the active node rect width into drag state; DragOverlay renders HolderOutlined + RowContent at that width in the floating-card shell.
- [ ] T003 Full loops; docker rebuild; ALL inventory e2e; commit + push.
