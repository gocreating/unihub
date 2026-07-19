---
description: "Task list for Inventory App — Iteration 34 (2026-07-19)"
---

# Tasks: Inventory App — Iteration 34 (Reactive symbol registry)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-033 amended. Constitution **v1.22.0**.

**Baseline**: Iteration 33 shipped at `c377576`. Decisions in R34.1–R34.2.

- [ ] T001 Failing RTL: CatalogPage with an UNSEEDED registry and listCurrencies resolving AFTER the list queries must still render "Shop USD $ 10" / SKU symbols once currencies arrive (locks the race). Implement `useCurrencySymbols()` + adopt at CatalogPage (incl. width-measure deps), AcquisitionForm, ScenarioDetailPage, AppShell.
- [ ] T002 `utils/finance.ts`: `getCurrencySymbol` reads the registry (code fallback); delete its map; finance page tests updated if needed.
- [ ] T003 Full loops; docker rebuild; ALL inventory e2e; commit + push.
