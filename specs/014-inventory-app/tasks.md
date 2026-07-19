---
description: "Task list for Inventory App — Iteration 33 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 33 (Finance-sourced symbols + staged item deletion)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-006/FR-033 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 32 shipped at `5f6be0b`. Decisions in R33.1–R33.3. Recovery already applied (R33.1).

- [ ] T001 Failing RTL regression suite (AcquisitionForm edit mode): card remove → deleteItem NOT called; card edit via modal → updateItem NOT called; Save → deleteItem for each staged removal + updateItem for each dirty card + updateAcquisition; unmount without save → no item API calls. Then implement staged removals/edits.
- [ ] T002 Failing tests for the symbol registry: `setCurrencySymbols` seeding, `currencySymbol('TWD') === 'NT$'`, code-only fallback before seeding; AppShell seeds from listCurrencies. Implement (delete the hardcoded map); update currency/PriceInput/CatalogPage RTL + the catalog price e2e regex to finance symbols.
- [ ] T003 Full loops; docker rebuild; ALL inventory e2e; commit + push.
