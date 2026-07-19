---
description: "Task list for Inventory App — Iteration 40 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 40 (Segmented 備註 key-value parsing)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029j new. Constitution **v1.22.0**.

**Baseline**: Iteration 39 shipped at `49b168f`. Decisions in R40.1–R40.2.

- [x] T001 Failing fixtures: `size: L / 顏色: 00 WHITE` → size L + color "00 WHITE" (no remark); `size: L，白色` → size L + remark 白色; `Size: XL，顏色:09 BLACK`; `color: SKY BLUE，size: L`; intact values `size: 43/46` and `規格：180ml/灰色登山扣款`; regressions (discount/variant/qty-expr/內褲) green. Implement the segment router + [Cc]olor key; suite + sweep green.
- [x] T002 Upsert re-import; verify the NET/Uniqlo rows carry clean size/color values; counts/PKs/scenarios stable.
- [x] T003 Backend full loop; commit + push (pytest exit code UNMASKED before committing).
