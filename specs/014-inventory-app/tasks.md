---
description: "Task list for Inventory App — Iteration 32 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 32 (Full currency label on price selects)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-033 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 31 shipped at `d5df918`. Decision in R32.1.

- [x] T001 Failing RTL: PriceInput's selected currency displays the full "TWD $" label (not the bare symbol); placeholder while empty/0 unchanged. Implement (drop labelRender in CurrencySymbolSelect).
- [x] T002 Full loops; docker rebuild; ALL inventory e2e; commit + push.
