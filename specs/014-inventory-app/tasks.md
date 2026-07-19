---
description: "Task list for Inventory App — Iteration 35 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 35 (Key-value-only prices + adorned paid cells + data refresh)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029i new. Constitution **v1.22.0**.

**Baseline**: Iteration 34 shipped at `ce84da6`. Decisions in R35.1–R35.2.

- [x] T001 Failing fixtures: prose 原價 does NOT extract (雨傘王 both years); colon + qty-expression forms still do; "¥4,200" paid cell → 4200 JPY at the pipeline level. Implement (RE_PRICE colon-required + RE_PRICE_QTY; extract_amount for paid cells); parser suite + sweep green.
- [ ] T002 Ref-keyed upsert re-import of the UPDATED sheets (no wipe); verify 雨傘王雨傘 sku 725 TWD, 維尼披風 4200 JPY (+ the other 東京 rows), counts/PKs/scenarios stable.
- [ ] T003 Backend full loop; commit + push.
