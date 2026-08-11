# Implementation Plan: Entity Views — Rounds 7 & 8 (inline-state fix + indicator/URL invariant)

**Branch**: `016-entity-views` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Sessions 2026-08-04d (round 7) and 2026-08-04e (round 8). Earlier plans at 467beff / 8e1f169 / 3defc24 / 5d6ad96 / bb3f310 / c2c256e / a0309e8.

> **Note on round 7's plan file**: rounds 7 and 8 ship in one commit, and `plan.md` is a single-round document that `setup-plan.sh` overwrites. Round 7's plan was still uncommitted when round 8 began, so its text is folded into the section below rather than surviving as its own file; its research (R42), data-model §4 changes, and quickstart section are intact and unchanged.

## Summary

### Round 7 — implemented and green, shipping in this commit

Reproduced from the user's steps (catalog → *Add empty view* → reload → the default view arrives dirty). A scratch tab has no stored view, so its state is serialized **inline** (`?inventory-catalog.f=and()`). On reload round 5 correctly discards the scratch tab, and the inbound inline branch then fell back to `DEFAULT_TAB_ID`, pouring the blank config **into the default view** — blanking the catalog's seeded YTD filter, so the table listed everything while still labelled "YTD". A data-correctness defect whose only visible symptom was the dot.

Fixed: inline state now creates its **own** unsaved tab (labelled "New view") and activates it; it may only reuse an existing tab when that tab is itself `kind: 'anonymous'`. A tab representing a stored view is never a valid target. Creation happens inside the `setTabs` updater with an existence check (round-5 duplicate-tab discipline). Outstanding from that round: only the CLAUDE.md ship note.

### Round 8 — guard rails around the indicator and the URL

The three new directives were **verified against the running code before planning**, with a throwaway probe:

| Step | URL observed |
|---|---|
| saved view active, unmodified | `tbl.view=savedview001` |
| after changing the sort | `tbl.view=savedview001&tbl.sort=name` |
| after Save | `tbl.view=savedview001` |

So compactness (FR-034) and "compact again immediately on save" already hold on the saved path — this round does **not** change that behaviour, it *locks* it. What the round adds:

1. **FR-033, a bidirectional invariant**: for the ACTIVE tab, the indicator appears **iff** the URL carries at least one override parameter. A dot with no overrides means an invented difference (rounds 6/7); overrides with no dot means the URL describes state the table is not in. Both directions get asserted.
2. **FR-013 restated as two cases** — no stored view, or a stored view whose config differs — with inactive tabs keeping their own dots (the URL only ever describes the active tab).
3. **FR-034 written down** so the compact form is a requirement rather than an accident.

This is deliberately a tests-and-requirements round: the code is believed correct, and the deliverable is the harness that keeps it correct, because this exact class of bug has now been reported three times (rounds 6, 7, 8).

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend). **No backend change** in either round.

**Primary Dependencies**: React 18.3, React Router 7, TanStack React Query 5

**Storage**: None touched.

**Testing**: Vitest + RTL. The centrepiece is a **bidirectional invariant suite** that drives one hook through load → edit → save → switch → reload and, at every step, asserts the indicator and the URL agree for the active tab (dot ⟺ override params present). Plus e2e mirroring the reported flow.

**Target Platform**: Desktop/tablet web browsers

**Project Type**: Web application — React SPA under `apps/unihub/frontend/`

**Performance Goals**: Unchanged.

**Constraints**: All four navigation guards must survive (`lastParamRef`, `lastProcessedRef`, `inboundSettledRef`, `pendingLoadRef`) — each documented in the hook with the failure it prevents. If the new suite exposes a genuine divergence, the fix belongs in the hook, not in the assertion.

**Scale/Scope**: One hook and its suite, one e2e spec, plus the round-7 ship note. Five adopted pages inherit both rounds.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS | No schema, model, or registry change in either round. |
| II | Domain independence | ✅ PASS | Confined to `components/EntityViews/`. |
| III | Reference alignment | ✅ PASS | Plain React state; no new libraries. |
| IV | API contract-driven | ✅ PASS | N/A — no API surface touched. |
| V | Quality loop + TDD | ✅ **Central** | Round 7 reproduced before fixing. Round 8 is tests-first by construction: the invariant suite is written against the requirement, and any failure it surfaces is a real defect to fix in the hook. |
| VI | UI/UX (ov-fleet) | ✅ PASS | No visual change; the indicator's *truthfulness* is what improves. |
| VII | PageTable layout | ✅ PASS | Untouched. |
| VIII | i18n | ✅ PASS | No new strings. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate and remount keys unchanged. |
| — | Dev constraints | ✅ PASS | pnpm only; desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

**Honest scoping note**: if the invariant suite turns out to pass everywhere on the first run, this round ships no behavioural change — and that is the correct outcome to report, not a reason to manufacture one. The value is the regression net over a rule that has been violated three different ways.

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Sessions 2026-08-04d/e, FR-013 rewritten, FR-032/033/034, SC-015/016
├── plan.md              # This file (rounds 7 & 8)
├── research.md          # R42 (round 7) + R43 (round 8)
├── data-model.md        # §4 inbound-target rule (round 7); §3 emission invariant (rounds 6/8)
├── quickstart.md        # round-7 and round-8 verification walk-throughs
├── contracts/           # UNCHANGED — no grammar change in either round
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/frontend/src/
└── components/EntityViews/
    ├── useEntityViews.ts        # round 7: inline state → its own unsaved tab (DONE)
    │                            # round 8: only if the invariant suite exposes a divergence
    └── useEntityViews.test.tsx  # round 7 regression (DONE) + round 8 invariant suite

apps/unihub/frontend/e2e/
└── entity-views.spec.ts         # round-7 flow (DONE) + round-8 indicator/URL agreement
```

**Structure Decision**: Unchanged from rounds 6–7 — everything lives in the hook that owns both the tab list and the URL, with the invariant expressed as a reusable assertion helper inside the suite so every step of the journey checks the same rule.

## Complexity Tracking

> No constitution violations — table intentionally empty.
