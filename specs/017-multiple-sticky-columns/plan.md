# Implementation Plan: Multiple Sticky Columns

**Branch**: `017-multiple-sticky-columns` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-multiple-sticky-columns/spec.md` (GitHub issue #37)

## Summary

Generalize the column-pinning system from two view-wide booleans ("pin first visible column left" / "pin last visible column right") to **per-column pin state** (`left` / `right` / none) so any number of columns can be pinned to either edge. The change is **frontend-only** and lives almost entirely in the shared `EntityToolbar` infrastructure (`useColumnConfig`, `ColumnPanel`) plus mechanical updates to its six consumer pages. Pinned columns display as contiguous groups at their table edge (rc-table requires contiguous fixed columns); a single shared ordering — pin-group-major, `order`-minor — drives both the panel list and the table so the panel is WYSIWYG. No backend, API, or schema changes; no new persistence (column settings remain per-visit working state, matching today).

## Technical Context

**Language/Version**: TypeScript 5.7 (`strict: true`), React 18.3

**Primary Dependencies**: Ant Design 5.24 ProTable (rc-table fixed-column engine), @ant-design/pro-components 2.8, dnd-kit (panel's `SortableList`), react-intl, TanStack React Query 5

**Storage**: None — in-memory React state only. Verified: `useEntityFilter`/`useEntitySort` take an unused `_key` param and `useColumnConfig` has no storage; nothing column-related touches `localStorage` (only locale + base currency do). No API calls involved.

**Testing**: Vitest + React Testing Library (JSDOM) for hook/panel/page logic; Playwright e2e (`apps/unihub/frontend/e2e/column-pin.spec.ts` exists and locks today's single-pin behavior) for real-browser sticky geometry, per the project's visual-geometry rule.

**Target Platform**: Desktop-width web SPA (mobile out of scope per constitution)

**Project Type**: Web frontend (monorepo `apps/unihub/frontend/`)

**Performance Goals**: Pin apply/reset re-renders via the constitution-XII ProTable remount key — must remain imperceptible (<1s, SC-002/SC-003); no additional network requests.

**Constraints**: Constitution VII (PageTable-only layout, width helpers), XII (apply-gate panel state, remount key, `onHeaderCell` sort bypass), VIII (i18n both locales, no hardcoded strings), V (zero-warning lint, strict tsc, TDD), plus `pnpm build` before commit (project memory).

**Scale/Scope**: 6 consumer pages (`finance/accounts`, `finance/currencies`, `finance/exchange-rates`, `finance/balance-sheets`, `inventory/catalog`, `inventory/scenarios`); catalog has ~18 static + N dynamic `attr:<id>` columns. Only catalog seeds `defaultSticky` today (`{ left: true, right: true }` → caret column left, Actions right).

## Constitution Check

*GATE: evaluated against constitution v1.22.0 before Phase 0; re-checked after Phase 1 design.*

| Principle | Verdict | Notes |
|-----------|---------|-------|
| I. Entity-centric domains | N/A — PASS | No backend models, attributes, or `data_io` involvement; frontend-only. |
| II. Domain independence | PASS | All changes live in shared infrastructure (`components/EntityToolbar/`) + per-page mechanical wiring; no cross-domain business logic. |
| III. Reference alignment | PASS | Uses AntD's native multi-fixed-column mechanism — no new libraries, no framework deviation. |
| IV. API contract-driven frontend | N/A — PASS | Zero API/serializer changes; no schema regeneration needed. |
| V. Quality loop + TDD | PASS (planned) | Hook/panel tests written first (red-green); `pnpm lint && pnpm typecheck && pnpm test && pnpm build` gate every change. |
| VI. UI/UX reference | PASS | ColumnPanel keeps its 60vh internal scroll, apply-gate footer, and pushpin iconography; per-row pin buttons follow the existing pin-button styling. |
| VII. PageTable layout | PASS | No layout changes; column widths keep using `widthForHeader()`/`measureTextWidth()`/`computeScrollX()`. |
| VIII. i18n | PASS (planned) | New keys `common.entityOps.columns.pinLeft` / `pinRight` (tooltips) added to BOTH locales in the same commit; obsolete `stickyLeft`/`stickyRight` keys removed from both. |
| XII. Entity toolbar patterns | PASS with amendment | Apply-gate, `isDirty`/`isCustomised`, dirty-panel focus-cancel, and the ProTable remount-key requirement are all preserved. Two Principle-XII bullets hardcode the OLD mechanism ("first/last visible column identity + fixed flags" in the remount key; "`stickyLeft`, `stickyRight` are never touched" in the label-patch rule) — this feature amends them to the per-column model via the governance procedure (constitution **v1.23.0**, MINOR: material change to existing guidance, Sync Impact Report updated). |

**Post-Phase-1 re-check**: design keeps every gate green; the only constitutional edit is the planned Principle XII amendment above. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-multiple-sticky-columns/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (frontend state model)
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── column-pin-contracts.md   # Hook/panel/page integration contracts (no HTTP API)
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/unihub/frontend/
├── src/components/EntityToolbar/
│   ├── types.ts                       # ColumnDef gains pin?: PinSide; ColumnState drops stickyLeft/stickyRight
│   ├── hooks/useColumnConfig.ts       # Per-column pin state, pin-grouped ordering, fixedForKey(), pinFingerprint
│   ├── hooks/useColumnConfig.test.ts  # TDD: extended first
│   ├── ColumnPanel.tsx                # Per-row pin-left/pin-right buttons on EVERY row (replaces first/last-only)
│   ├── ColumnPanel.test.tsx           # TDD: extended first
│   ├── useEntityTable.ts              # defaultSticky option removed (defaults now live in ColumnDef.pin)
│   └── useEntityTable.test.tsx
├── src/pages/finance/accounts/index.tsx        # getFixed → cols.fixedForKey; remount key → cols.pinFingerprint
├── src/pages/finance/currencies/index.tsx      # same mechanical update
├── src/pages/finance/exchange-rates/index.tsx  # same mechanical update
├── src/pages/finance/balance-sheets/index.tsx  # same mechanical update
├── src/pages/inventory/catalog/index.tsx       # same + defaultSticky → pin seeds on __caret/actions ColumnDefs
├── src/pages/inventory/scenarios/index.tsx     # same mechanical update
├── src/locales/en-US/pages.ts                  # pinLeft/pinRight keys; stickyLeft/stickyRight removed
├── src/locales/zh-TW/pages.ts                  # same, in sync
└── e2e/column-pin.spec.ts                      # Multi-pin geometry scenarios (real-browser)

.specify/memory/constitution.md                 # Principle XII amendment → v1.23.0
CLAUDE.md                                       # Active Feature block (SPECKIT markers)
```

**Structure Decision**: Single-frontend change inside the existing monorepo app. The pin model change is concentrated in `components/EntityToolbar/` (shared infra); the six consumer pages receive mechanical `fixedForKey`/`pinFingerprint` substitutions; e2e extends the existing `column-pin.spec.ts` rather than adding a new spec file.

## Complexity Tracking

No constitution violations — table intentionally left empty.
