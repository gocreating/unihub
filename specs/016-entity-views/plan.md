# Implementation Plan: Entity Views — Round 5 (per-visit tabs, confirm footers)

**Branch**: `016-entity-views` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Session 2026-08-04b (round 5 on top of the round-4 implementation; earlier plans at commits 467beff / 8e1f169 / 3defc24 / 5d6ad96)

## Summary

Three changes, one of which reaches outside the feature:

1. **Tabs become per-visit, not per-session** (FR-018, SC-013). The open-tab list stops being persisted: every page load — refresh, navigation back to the table, or a new session — rebuilds the row from the account's **pinned views** (including the default-role holder) plus **the single view the URL addresses** (an unpinned saved view, or an inline unsaved configuration). Everything else is discarded, unsaved changes included. `useViewTabsState`'s sessionStorage store shrinks from `{tabs, activeTabId, revealed}` to just `revealed` — the FR-025 display preference, which is not a tab and must still survive a reload.
2. **One shared confirmation helper** (FR-031, SC-014). AntD's `Modal.confirm` right-aligns Cancel and OK together, which violates the constitution's footer rule (primary right, everything else grouped left, Cancel left-most). A new `confirmDialog()` helper renders that footer once, and **all nine** call sites adopt it — eight of them outside this feature, whose tests currently assert on AntD's `.ant-modal-confirm-btns` DOM.
3. **"Close tab" → "Close"** in both locales — the action already sits inside that tab's own menu, so the noun is redundant.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend). **No backend change this round** — nothing in the API, models, or migrations moves.

**Primary Dependencies**: React 18.3, Ant Design 5.24 (`Modal`, `Modal.useModal`), TanStack React Query 5, React Router 7, react-intl

**Storage**: `sessionStorage` key `unihub.views.<tableKey>` reduced to `{ revealed: boolean }`; a stale round-4 payload (with `tabs`/`activeTabId`) MUST be read tolerantly — only `revealed` is picked out, everything else ignored. No database or API storage changes.

**Testing**: Vitest + RTL (rebuild-on-load: pinned + default + URL only; unsaved tabs discarded; reveal flag survives; a stale payload is tolerated; the shared helper's footer geometry and danger styling; every migrated call site still confirms and still cancels), Playwright e2e (refresh with scratch tabs open → only pinned + URL remain)

**Target Platform**: Desktop/tablet web browsers

**Project Type**: Web application — React SPA under `apps/unihub/frontend/`

**Performance Goals**: Unchanged. Dropping the tab store removes a `sessionStorage.setItem` on every tab/config change — strictly less work per interaction.

**Constraints**: The URL is now the ONLY carrier of "which view is active" across a load, so the outbound URL effect must stay correct or a refresh loses the user's place; the round-1 `lastProcessedRef`/`lastParamRef` ping-pong guard must survive the refactor; `strict: true` TS, zero ESLint warnings; both locales in the same commit; eight non-016 test suites must be updated in lockstep with the helper adoption.

**Scale/Scope**: Single-user hub; same 5 adopted pages for views; 9 confirmation call sites app-wide.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS | No schema, model, or registry change — this round is presentation state only. |
| II | Domain independence | ✅ PASS | The confirm helper lands in `components/` as shared infrastructure and is imported by finance and inventory pages alike; no domain imports another. |
| III | Reference alignment | ✅ PASS | The helper wraps AntD's own `Modal` — same component, corrected footer. No new libraries. |
| IV | API contract-driven | ✅ PASS | N/A — no API surface touched. |
| V | Quality loop + TDD | ✅ PASS | Rebuild-on-load and helper-footer tests are written before the code; the eight migrated call sites keep their existing behavioral assertions (confirm → action runs, cancel → nothing runs), updated only where they reach into AntD's confirm DOM. |
| VI | UI/UX (ov-fleet) | ✅ **This round's subject** | FR-031 exists precisely to bring every confirmation into line with the footer rule (Cancel left-most, primary right). Danger styling on destructive confirms is preserved. |
| VII | PageTable layout | ✅ PASS | Untouched. |
| VIII | i18n | ✅ PASS | `common.entityViews.close` changes value in en-US **and** zh-TW same commit; the helper takes already-translated strings, adding no hardcoded copy. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate and remount keys unchanged; tab identity still feeds the PageTable remount key, now derived rather than restored. |
| — | Dev constraints | ✅ PASS | pnpm only; delete gates preserved (every migrated confirm keeps its danger + confirmation semantics); desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

**Scope note**: eight of the nine helper adoptions are outside feature 016. They are in scope because the clarification explicitly chose app-wide consistency, and because a shared helper that only one caller uses cannot enforce anything.

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Clarifications Session 2026-08-04b, FR-018 rewritten, FR-031, SC-013/SC-014
├── plan.md              # This file (round 5; rounds 1–4 in git history)
├── research.md          # + R37–R39 (round-5 decisions)
├── data-model.md        # Updated: ViewTabsState reduced to `revealed`; tab list is derived
├── quickstart.md        # + round-5 manual walk-through
├── contracts/           # UNCHANGED — no API or URL grammar change this round
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/frontend/src/
├── components/
│   ├── ConfirmDialog/                      # NEW — shared confirmation helper
│   │   ├── index.tsx                       #   confirmDialog({title, content, okText, danger, onOk})
│   │   └── index.test.tsx                  #   footer geometry + danger + confirm/cancel wiring
│   ├── EntityViews/
│   │   ├── useViewTabsState.ts             # store reduced to `revealed`; tolerant of stale payloads
│   │   ├── useEntityViews.ts               # tab list derived from pinned views + URL on every load
│   │   └── ViewTabMenu.tsx                 # adopts confirmDialog; "Close" label
│   ├── AttributeManagementPanel/index.tsx  # ┐
│   └── ParameterRowsEditor/index.tsx       # │
├── pages/                                  # │ eight existing Modal.confirm call sites
│   ├── finance/accounts/index.tsx          # │ migrated to the shared helper (+ their tests)
│   ├── finance/currencies/index.tsx        # │
│   ├── finance/exchange-rates/index.tsx    # │
│   ├── finance/balance-sheets/index.tsx    # │
│   ├── inventory/scenarios/detail.tsx      # │
│   └── inventory/acquisitions/AcquisitionForm.tsx  # ┘
└── locales/{en-US,zh-TW}/pages.ts          # "Close tab" → "Close"

apps/unihub/frontend/e2e/
└── entity-views.spec.ts                    # + refresh-discards-unsaved-tabs check
```

**Structure Decision**: Same layered structure as rounds 1–4. The one new shared component (`ConfirmDialog`) sits beside the other cross-domain components (`EmptyValue`, `OverflowTooltip`, `PageTable`) because it is infrastructure every domain consumes — the same placement rationale those components already established.

## Complexity Tracking

> No constitution violations — table intentionally empty.
