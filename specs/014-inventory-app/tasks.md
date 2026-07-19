---
description: "Task list for Inventory App — Iteration 42 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 42 (Paren size annotations, range dims parts, name-matched 原價, waist, hard-error imports)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029k new. Constitution **v1.22.0**.

**Baseline**: Iteration 41 shipped at `75b62c0`. Decisions in R42.1–R42.3.

- [ ] T001 Failing fixtures: `尺寸：Q（160x200x18~28cm）` → 長160/寬200/高18~28 cm + size Q; `size: L(腰圍 84~92cm)，偏緊` → size L + waist 84~92cm + remark 偏緊; the three MUJI name-matched blocks (被套1390/抹布119/衣架99×2; 衣架99×7/衣夾49; 衣架99×3/枕頭1390/褲1390) incl. header-total override + TWD inheritance; HEATTECH 380 regression; iteration-36 paren test updated (size S). Implement (range dims atoms, paren-size recursion, 腰圍 seed 0019 + keyed pattern + maps/locales/importer key, name-matched pass in _finalize).
- [ ] T002 Hard-error imports: year-level transaction + ref/name context on validation errors (test: an invalid planned value aborts the year atomically).
- [ ] T003 Upsert re-import; verify every reported row + regressions; counts/PKs/scenarios stable.
- [ ] T004 Backend full loop (exit codes unmasked); frontend locale additions loop; commit + push; confirm CI.
