# Implementation Plan: Entity Views — Round 6 (the spurious unsaved indicator)

**Branch**: `016-entity-views` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Session 2026-08-04c (round 6 on top of the round-5 implementation; earlier plans at commits 467beff / 8e1f169 / 3defc24 / 5d6ad96 / bb3f310 / c2c256e)

## Summary

One defect, reproduced before planning. The unsaved-changes dot appears on a freshly loaded view the user never touched, at timings that look random.

**Root cause (reproduced):** the outbound URL effect publishes the active tab's state *before* that tab has finished adopting its stored configuration. `useEntityViews` asks the table to load a view's config via `table.loadConfig(...)`, but the table's state lands in a **later** render — meanwhile the outbound effect, which re-runs in the same commit (its deps include `savedViews`), reads the pre-adoption snapshot and serializes the difference as **override parameters**:

```
/inventory/catalog?inventory-catalog.view=<id>&inventory-catalog.sort=&inventory-catalog.size=25
                                              └─ "overrides" that are really just the page defaults
```

That visit looks fine — the dot settles clean once adoption completes. But the address bar is now poisoned, and the **next** load replays those overrides on top of the stored config (correctly, per FR-005), so the view genuinely differs from its baseline and the dot is shown on arrival. It then rewrites itself, which is what makes the timing feel unmanageable.

**Fix (FR-032):** gate the outbound writer on load completion. Every path that asks the table to load a config records what it asked for; the writer stays silent until the table's live state matches that request, then clears the gate and resumes. Consequence: a load with no user change emits no override parameters, so the next load is clean too (SC-015). Dirty semantics are unchanged — the dot still means "what you see differs from what's stored" (FR-013).

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend). **No backend change** — no API, model, migration, or contract move.

**Primary Dependencies**: React 18.3, React Router 7 (`navigate` with `replace`), TanStack React Query 5

**Storage**: None touched. The URL remains the only carrier of "where you were" across a load (round 5), which is exactly why a wrong write there is so damaging.

**Testing**: Vitest + RTL regression suite locking SC-015 — (a) a materialized default whose stored config differs from the page defaults loads CLEAN and writes NO override params; (b) feeding the previously-emitted URL back in still loads clean (the loop is broken); (c) a genuine hand-edited override still marks the tab dirty (FR-013 preserved); (d) switching tabs and opening a saved view never publish a pre-adoption snapshot. Playwright e2e: reload the catalog twice untouched and assert zero indicators.

**Target Platform**: Desktop/tablet web browsers

**Project Type**: Web application — React SPA under `apps/unihub/frontend/`

**Performance Goals**: Strictly fewer URL writes than today (the spurious ones disappear); no new subscriptions or timers.

**Constraints**: The round-1 `lastProcessedRef`/`lastParamRef` ping-pong guard must survive untouched — it solves a *different* problem (re-processing our own echo) and removing it would restart an infinite navigation loop. The gate must be fail-open: if a requested load never lands (e.g. the config was already applied, so no state change occurs), the writer must resume rather than go permanently silent.

**Scale/Scope**: One hook (`useEntityViews`), its test suite, and one e2e spec. Five adopted pages inherit the fix.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS | No schema, model, or registry change. |
| II | Domain independence | ✅ PASS | Change confined to `components/EntityViews/useEntityViews.ts`. |
| III | Reference alignment | ✅ PASS | Plain React refs and effects; no new libraries or patterns. |
| IV | API contract-driven | ✅ PASS | N/A — no API surface touched. |
| V | Quality loop + TDD | ✅ **Central** | The defect was reproduced in a throwaway harness before planning; that reproduction becomes the first committed test and must be RED before the fix. Reproduction-first is the same discipline the 015 phantom-diff bug used. |
| VI | UI/UX (ov-fleet) | ✅ PASS | The indicator's appearance is unchanged; only its truthfulness improves. |
| VII | PageTable layout | ✅ PASS | Untouched. |
| VIII | i18n | ✅ PASS | No new strings. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate and remount keys unchanged. |
| — | Dev constraints | ✅ PASS | pnpm only; desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

**Known residue (accepted, documented):** a URL already poisoned by the old behaviour — one the user bookmarked or is currently sitting on — still carries real override parameters, and FR-005 requires them to be honoured. Such a URL will still load dirty after the fix, because the system cannot distinguish a stale machine-written override from a deliberate hand-edited one. Navigating to the page afresh (any nav-menu click) produces a clean URL immediately, and no *new* poisoned URLs can be produced.

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Clarifications Session 2026-08-04c, FR-013 sharpened, FR-032, SC-015
├── plan.md              # This file (round 6; rounds 1–5 in git history)
├── research.md          # + R40–R41 (round-6 decisions)
├── data-model.md        # Updated §3: the URL-emission invariant
├── quickstart.md        # + round-6 verification walk-through
├── contracts/           # UNCHANGED — the URL grammar itself is not changing
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/frontend/src/
└── components/EntityViews/
    ├── useEntityViews.ts        # pendingLoadRef gate on the outbound URL effect;
    │                            #   every loadConfig caller records its request
    └── useEntityViews.test.tsx  # regression suite: clean load, loop broken,
                                 #   genuine overrides still dirty, tab switches safe

apps/unihub/frontend/e2e/
└── entity-views.spec.ts         # + "reload twice untouched → zero indicators" (SC-015)
```

**Structure Decision**: A single-file fix in the hook that owns both the URL and the tab state. The gate lives beside the existing `inboundSettledRef`/`lastParamRef`/`lastProcessedRef` guards so all four navigation guards are readable together — with a comment explaining what each one prevents, since this is now the fourth distinct race this effect has had to defend against.

## Complexity Tracking

> No constitution violations — table intentionally empty.
