---
description: "Task list for Inventory App — Iteration 36 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 36 (Remark icon, unknown deprecate time, deprecated warnings, per-unit dims)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-001/FR-011/FR-029g/FR-031 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 35 shipped at `110e1bf`. Decisions in R36.1–R36.3.

- [x] T001 Backend TDD: `Item.deprecated` + backfill migration; status derives from the flag; serializer round-trips `{deprecated, deprecate_time:null}` (unknown-time deprecate) and restore; existing status behavior unchanged for dated deprecations. OpenAPI/types regen.
- [x] T002 Parser TDD: per-unit dims fixtures (`50cm * 75cm` → 長50/寬75; `172cm x 58 cm x 4 mm` mixed-unit triplet; `尺寸：S (40cm x 80cm)` keeps size "S (…)" AND extracts 長/寬; `183cmx 61cm`; `3.5mmx1.3mm`); tightened residue rule; suite + sweep green; upsert re-import + spot-checks.
- [x] T003 Frontend TDD: ItemDisplay flex primary + comment icon w/ remark tooltip (all surfaces) + opt-in ⚠ deprecated warning (scenario panes + Add modal); catalog Deprecate modal "Unknown time" checkbox + Restore/status/deprecate_time cells; locales ×2; RTL.
- [x] T004 Full loops both sides; docker rebuild; ALL inventory e2e; screenshots; commit + push.
