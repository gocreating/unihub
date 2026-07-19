---
description: "Task list for Inventory App — Iteration 47 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 47 (Deprecate-modal item preview)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-003c new. Constitution **v1.22.0**.

**Baseline**: Iteration 46 shipped at `ba77a19`. Decision in R47.1.

- [ ] T001 RTL lock first: opening Deprecate shows the target item's name, spec, and a parameter tag inside the modal; Confirm still PATCHes `{deprecated, deprecate_time}`.
- [ ] T002 Implement: bordered ItemDisplay preview (parameters shown) above the confirm line in the catalog Deprecate modal.
- [ ] T003 Loops (exit codes unmasked), docker rebuild, inventory e2e smoke, commit + push, confirm CI.
