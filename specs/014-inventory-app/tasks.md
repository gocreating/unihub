---
description: "Task list for Inventory App — Iteration 39 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 39 (原價 never the sku, discount computation, currency inheritance)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029i extended. Constitution **v1.22.0**.

**Baseline**: Iteration 38 shipped at `f22526c`. Decisions in R39.1–R39.3.

- [x] T001 Failing fixtures: HEATTECH (qty 2, sku 380 TWD), Giordano (425 TWD), 內褲*2 (159 TWD), 霍金 rowspan pair (252/450 TWD, accumulated 702), 盜墓筆記 paid-wins (179), currency inheritance; revise iteration-35 原價 expectations (colon-原價 no longer sku; 無印 → 189). Implement (原價 out of sku patterns; RE_DISCOUNT; _finalize computed-discount path + currency fallback); suite + sweep green.
- [x] T002 Upsert re-import; verify the four items + spot-checks; counts/PKs/scenarios stable.
- [x] T003 Backend full loop; commit + push.
