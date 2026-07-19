---
description: "Task list for Inventory App — Iteration 43 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 43 (Drag anchor portal, nest-drop block highlight, full search highlighting)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-011 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 42 shipped at `5240dda`. Decisions in R43.1–R43.3.

- [ ] T001 Overlay portal to document.body; extend the iteration-29 e2e with a grab-offset assertion (non-center grab; overlay origin == row origin + delta ±2px).
- [ ] T002 Nest-drop block highlight: projection state gains container id + descendant set; OrgRow tints (strong container / light subtree); line hidden while nesting, kept for sibling drops; e2e lower-half hover asserts the container tint.
- [ ] T003 Full search highlighting: ItemDisplay spec line + modal context line render HighlightText when a query is set; RTL marks in spec + context.
- [ ] T004 Loops (exit codes unmasked); docker rebuild; ALL inventory e2e; commit + push; confirm CI.
