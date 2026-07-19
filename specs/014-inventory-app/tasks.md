---
description: "Task list for Inventory App — Iteration 28 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 28 (Numeric ranges everywhere + keyed range parsing)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-002b extended, FR-029h new. Constitution **v1.22.0**.

**Baseline**: Iteration 27 shipped at `8cd481c`. Decisions in R28.1–R28.3.

## Phase 2: Number-type ranges + tilde display

- [x] T001 Backend TDD: failing pytests — number-typed value `"74~164"` → value_number 74 / value_number_max 164; `"74-164"` variant; single → max null; invalid (min>max, garbage) → 400; `attr:` ordering by min. Implement in `compute_value_fields` number branch.
- [x] T002 Frontend TDD: failing RTL — `parameterValueText` renders `74 ~ 164 cm` (dimension) and `74 ~ 164` (number, unitless); editor number rows use the validated single-or-range text input (invalid range flags inline). Implement; update iteration-26 dash expectations (RTL + e2e `5 - 10 mAh` → `5 ~ 10 mAh`).

## Phase 3: Parser + data

- [x] T003 Parser TDD: failing fixtures — `長度：74~164cm` → length `74~164` cm (line fully consumed); `重量：30-45g`, `容量：1~2L` analogues; single values unchanged; suite + sweep green.
- [x] T004 Ref-keyed upsert re-import (NO wipe); verify the 憨客-style range items carry min/max canonicals, PKs + scenario memberships stable.

## Phase 4: Polish

- [x] T005 Full loops both sides; docker rebuild; ALL inventory e2e; screenshots; commit + push.
