# Implementation Plan: Entity Views — Round 9 (default-view adoption + Reset changes)

**Branch**: `016-entity-views` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Session 2026-08-04f. Earlier plans at 467beff / 8e1f169 / 3defc24 / 5d6ad96 / bb3f310 / c2c256e / a0309e8 / bf0b2eb.

## Summary

Two items: one defect diagnosed against the running application, one new action.

### 1. The stored default view is never adopted on arrival (FR-036)

A **read-only browser probe** against the running dev stack (navigation only — nothing written) captured the real state after clicking the nav item to a clean `/inventory/catalog`:

```
?inventory-catalog.view=zn6iFx8QhBMj
&inventory-catalog.f=or(acquisition__obtained_at gte 2026-01-01; acquisition__obtained_at is_empty)
&inventory-catalog.sort=-acquisition__obtained_at__nullsfirst
&inventory-catalog.size=50                                        → 1 unsaved dot
```

The stored default view is *referenced* but never *loaded*. The table sits at the page defaults while the tab's baseline is the stored config, so every facet serializes as an "override" and the dot is technically truthful. Both reported bugs — the dot on navigation, and the inline/override URL surviving a refresh — are this one state.

Two flaws in the adoption effect produce it:

```ts
if (!isFetched || defaultAdoptedRef.current) return;
defaultAdoptedRef.current = true;                     // ← burned BEFORE the guards
if (!defaultView) return;
if (hasViewParams(searchParams, tableKey)) return;    // ← sees OUR OWN write as "the URL"
```

The one-shot is consumed on the first `isFetched` render whatever happens next, and the "URL wins" guard reads *live* params — which by then may be the ones the outbound writer just produced. Skipped once, never retried.

**Fix**: consume the one-shot only when adoption actually happens or is decisively unnecessary, and judge "did the user arrive with view state?" from the value captured **once at mount** (`initialUrlHadViewStateRef`, which already exists for the FR-025 collapse decision) rather than from live params.

**Why round 8's invariant suite stayed green through all of this**: it asserts *dot ⟺ override params*, and here they genuinely agree — the rule held, the state being described was wrong. The new regression therefore asserts the **adopted configuration** and a **clean URL**, not the agreement.

### 2. "Reset changes" (FR-035)

A new item in each tab's own menu, enabled only while the tab differs from its baseline. It discards edits with no confirmation and touches no stored data: a tab representing a stored view returns to that view's saved configuration; a tab with no stored view returns to the configuration it was created with. To make the second half possible, an unsaved tab now records its creation configuration.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend). **No backend change** — no API, model, migration, or contract move.

**Primary Dependencies**: React 18.3, React Router 7, TanStack React Query 5, Ant Design 5.24

**Storage**: None touched. `InternalTab` gains an in-memory `baseline` field for unsaved tabs (per-visit state, never persisted).

**Testing**: Vitest + RTL. For the defect: a regression that mounts with a stored default whose config differs from the page defaults, lets the app write its URL, and asserts the table adopted the **stored** configuration with a clean URL and no dot — deliberately *not* expressed through the round-8 invariant, which cannot see this failure. For the action: reset on a dirty saved tab (returns to stored config, dot clears, overrides leave the URL), on a scratch tab (returns to blank), on an inactive tab (that tab only), and the enablement rule. Playwright e2e mirrors the reported navigation flow.

**Target Platform**: Desktop/tablet web browsers

**Project Type**: Web application — React SPA under `apps/unihub/frontend/`

**Performance Goals**: Unchanged; the fix removes URL writes rather than adding any.

**Constraints**: All four navigation guards must survive (`lastParamRef`, `lastProcessedRef`, `inboundSettledRef`, `pendingLoadRef`) — this change adds a fifth consideration to the same effect cluster, so the existing comment block gains the adoption rule rather than being rewritten. Adoption must still lose to a genuine deep link (`?…view=<other>` arriving with the navigation) and to a session tab that is already active.

**Scale/Scope**: One hook, one menu component, their suites, one e2e spec. Five adopted pages inherit both items; the inventory catalog is where the defect is visible because its default view was materialized with a configuration that differs from the page defaults.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS | No schema, model, or registry change. |
| II | Domain independence | ✅ PASS | Confined to `components/EntityViews/`. |
| III | Reference alignment | ✅ PASS | AntD menu item; plain React state. No new libraries. |
| IV | API contract-driven | ✅ PASS | N/A — no API surface touched. |
| V | Quality loop + TDD | ✅ **Central** | The defect was diagnosed against the running app first, then must be captured as a failing unit regression before the fix. Note the honest limitation recorded in research: unit harnesses did **not** reproduce it, so the regression is written from the observed browser state. |
| VI | UI/UX (ov-fleet) | ✅ PASS | Reset is a menu item like every other per-tab action; disabled-not-hidden when inapplicable, matching the data-model §7 matrix. No confirmation (clarified). |
| VII | PageTable layout | ✅ PASS | Untouched — no new control in the row. |
| VIII | i18n | ✅ PASS | One new key (`resetChanges`) in en-US **and** zh-TW in the same commit. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Reset routes through the existing `loadConfig` path, so the apply-gate and remount keys behave exactly as on any view switch. |
| — | Dev constraints | ✅ PASS | pnpm only; desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

**Method note (worth recording).** The defect was found by driving the real application read-only after three unit harnesses failed to reproduce it. That is the same escalation the 014 emoji-ink work needed: when a bug will not reproduce in the test environment, observe the real thing before theorising further. The corresponding lesson for the suite is that an invariant relating two derived values (dot ⟺ overrides) cannot catch a state where both are consistently wrong — some assertions must name the expected *content*.

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Session 2026-08-04f, FR-035/FR-036, SC-017/SC-018, 3 edge cases
├── plan.md              # This file (round 9; rounds 1–8 in git history)
├── research.md          # + R44 (adoption one-shot), R45 (reset + creation baseline)
├── data-model.md        # §4: ViewTab gains `baseline`; §7 matrix gains Reset changes
├── quickstart.md        # + round-9 verification (the reported navigation flow)
├── contracts/           # UNCHANGED — no API or grammar change
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/frontend/src/
├── components/EntityViews/
│   ├── useEntityViews.ts        # adoption one-shot + mount-captured URL check;
│   │                            #   resetTab(tabId); unsaved tabs record a baseline
│   ├── ViewTabMenu.tsx          # "Reset changes" item, enabled iff config ≠ baseline
│   ├── useViewTabsState.ts      # InternalTab.baseline (in-memory, per-visit)
│   └── *.test.tsx               # adoption regression + reset coverage
└── locales/{en-US,zh-TW}/pages.ts   # `common.entityViews.resetChanges`

apps/unihub/frontend/e2e/
└── entity-views.spec.ts         # + nav-to-catalog lands clean; reset clears dot and overrides
```

**Structure Decision**: Unchanged from rounds 6–8 — the hook owns tab state and the URL, the menu component owns presentation. Reset is implemented as a tab-addressed hook action (like every action since round 3) so it works from a right-click menu on an inactive tab.

## Complexity Tracking

> No constitution violations — table intentionally empty.
