---
description: "Task list for Inventory App — Iteration 31 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 31 (Visible drop indicator + recent items in Add modal)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-011 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 30 shipped at `2b80454`. Decisions in R31.1–R31.2.

- [ ] T001 Failing RTL: with the Add modal open and an EMPTY search, the 10 most recent items list (mock `listItems` — assert ordering param `-acquisition__obtained_at__nullsfirst`, limit 10); typing switches to search results. Implement the default query + render switch.
- [ ] T002 Failing e2e: mid-drag over the tree, the drop indicator (`data-testid="drop-indicator"`) is visible, its computed z-index exceeds the overlay's, and the overlay's opacity < 1. Implement overlay zIndex 900 + opacity 0.75 + indicator positioning.
- [ ] T003 Full loops; docker rebuild; ALL inventory e2e; commit + push.
