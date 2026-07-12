---
description: "Task list for Inventory App — Iteration 23 (2026-07-13)"
---

# Tasks: Inventory App — Iteration 23 (Date-cell no-data-loss + strikethrough skip)

**Input**: [plan.md](plan.md), [spec.md](spec.md) — FR-029e new. Constitution **v1.22.0**.

**Baseline**: Iteration 22 shipped at `02cd5d6`. Root causes measured (R23.1).

## Phase 2: Parser hardening (FR-029e)

- [X] T001 Write failing fixture tests in `apps/unihub/backend/tests/test_legacy_parser.py`: (a) `2016/02/??` → obtained last-day-of-month (leap-aware 2016-02-29); (b) MUJI-style multiline cell → requested = leading date, obtained = LATEST date, full cell text in acquisition remark; (c) `-`/empty date cell → obtained = Dec 31 of the sheet year (from filename), `defaulted_eoy` flag; (d) a row whose 項目 cell uses a `line-through` style class is skipped entirely (no acquisition/item), flagged
- [X] T002 Implement in `specs/014-inventory-app/scripts/preview_legacy_import.py`: date-token normalizer + complex-cell rule + EOY default (sheet year from filename) + `<style>` line-through class parsing with `struck` cell markers and own-項目-struck row skipping; T001 green; full parser suite green
- [X] T003 Extend `apps/unihub/backend/tests/test_legacy_coverage.py`: 購買日期 cells join the sweep (run coverage over date tokens + leftovers; struck rows exempt); fix any NEW misses it surfaces (fixture-first) until all 12 sheets pass

## Phase 3: Data repair

- [X] T004 Re-preview all sheets (new counts: 2019 −2 items, 2022 −1 acquisition), wipe + re-import all 12; verify: totals = new preview sums; 金子眼鏡 obtained 2015-12-31; MUJI requested 2020-05-09 / obtained 2020-05-11 + annotations in acquisition remark; 27吋軟殼行李箱 obtained 2016-02-29; struck rows absent; no null-obtained acquisitions except genuine open ranges

## Phase 4: Polish

- [X] T005 Full loops (backend + frontend untouched-check); ALL inventory e2e against the live stack; named-case screenshot; commit + push
