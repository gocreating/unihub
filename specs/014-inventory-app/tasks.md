---
description: "Task list for Inventory App — Iteration 30 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 30 (Keyed 寬度/高度/直徑/耐溫 extraction + explicit range-mode input)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-002b/FR-026/FR-029h amended. Constitution **v1.22.0**.

**Baseline**: Iteration 29 shipped at `884f2ee`. Decisions in R30.1–R30.3.

## Phase 2: Definitions + parser

- [ ] T001 Backend TDD: seed migration test (diameter + temperature system defs with families/emojis); parser fixtures — `寬度：3.3cm` → width, `高度：1.8~8cm` → height range, `直徑：5.5~9cm` → diameter range, `耐溫：-40~230度C` → temperature `-40~230` °C; lines fully consumed; suite + sweep green. Implement patterns (signed grammar) + migration + importer measure keys + SYSTEM label/key maps + locale labels ×2.
- [ ] T002 Re-import (upsert, NO wipe): the cup gains 高度/直徑/溫度 (temperature canonical min −40 / max 230), 憨客 strap unchanged (74~164), counts/PKs/scenario stable.

## Phase 3: Range-mode input

- [ ] T003 Frontend TDD: failing RTL for `RangeValueInput` — mode picker exact|range; exact = one InputNumber; range = two InputNumbers joined by `~` (both required, min ≤ max inline error); mode seeds from value ("74~164" → range); emits canonical text. Implement + wire into ParameterRowsEditor (dimension + number rows, unit select preserved); locales ×2.
- [ ] T004 Rework the iteration-26/28 e2e range-entry flows (text "10-5"/"5-10" typing → mode toggle + two fields); RTL updates.

## Phase 4: Polish

- [ ] T005 Full loops both sides; docker rebuild; ALL inventory e2e; screenshots; commit + push.
