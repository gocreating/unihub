---
description: "Task list for Inventory App — Iteration 45 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 45 (Emoji middle-align, scenario name links, modal parameters, caret centering, tab titles)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-010/FR-011/FR-032 amended, FR-035 new. Constitution **v1.22.0**.

**Baseline**: Iteration 44 shipped at `dc9549d`. Decisions in R45.1–R45.5.

- [ ] T001 Probe the KeyEmoji offset on the live app (Playwright boundingBox: emoji span vs tag label); write failing/locking tests first — RTL: scenario-list Name `href`, modal result parameter tag, document.title on both scenario pages, tag inline-flex style lock; e2e: emoji centering ±1.5px, caret center vs name-line center ±2px.
- [ ] T002 Implement: ItemDisplay tag content → inline-flex centered row (KeyEmoji stops depending on vertical-align); scenarios list Name → router `<Link>`; modal ItemDisplay gains `parameters`/`showParameters`; caret + holder → fixed-height (primary-line) centered flex boxes replacing `marginTop: 4`; new `hooks/usePageTitle.ts` + adoption on scenario list/detail.
- [ ] T003 Loops (exit codes unmasked): frontend lint/typecheck/test/build + backend ruff/pytest; docker rebuild; ALL inventory e2e; commit + push; confirm CI.
