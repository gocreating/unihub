# Implementation Plan: Entity Views — Round 3 (tab menus, drag reorder, kebab)

**Branch**: `016-entity-views` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Session 2026-08-03 (round 3 on top of the shipped round-2 implementation; round-1 plan at commit 467beff, round-2 plan at commit 8e1f169)

## Summary

Round 3 reworks the view row's interaction model along seven clarified directives, plus one backend contract change:

1. **Hidden scrollbar + edge shadows** — the tab strip keeps scrolling horizontally but renders no scrollbar; a gradient shadow appears on each side that has tabs scrolled out of view (FR-020, SC-009).
2. **Drag to reorder tabs** — horizontal dnd-kit sorting in the strip; the resulting order persists for saved views through the existing bulk `reorder/` endpoint and matches the manage modal (FR-027, SC-010).
3. **Per-tab dropdown menu** — left-click the active tab (or right-click any tab) opens a menu with Save · Close · Duplicate · Pin/Unpin · Set as default · Rename · Delete; inapplicable actions render **disabled, not hidden**. Left-clicking an inactive tab still just switches to it (FR-023).
4. **Close button folds into that menu** — the per-tab `×` disappears from the tab body.
5. **Double-click rename is removed** — Rename is a menu action running the same edit-name flow (inline input for saved/default, `SaveViewModal` for anonymous).
6. **Kebab replaces both "+" and "View ▾"** — one control fixed at the row's right edge: *Add empty view* · *Open ▸* (only views not currently open) · *Manage views…* (FR-009/FR-011/FR-012).
7. **Transferable default role** — `is_default` stops being create-only: a PATCH promoting a view atomically demotes the previous default (pinned/undeletable status moves with the role; configs, dirty state, and tab positions do not). The default view is no longer locked to the first tab and becomes draggable everywhere, including the manage modal (FR-003/FR-026, SC-011).

The frontend work is concentrated in `components/EntityViews/` (one new `ViewTabMenu`, `ViewTabs` rebuilt around a sortable strip, `ViewDropdown` → `ViewKebab`, hook actions generalized from "active tab" to "by tabId"). The backend work is one serializer/viewset change plus its migration-free contract update.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend)

**Primary Dependencies**: React 18.3, Ant Design 5.24 (`Dropdown` with `click`/`contextMenu` triggers, `Menu` submenus), @dnd-kit/core 6.3 + @dnd-kit/sortable 10 (already used by `SortableList` and the inventory organize tree), TanStack React Query 5, React Router 7, react-intl; Django 5.x, DRF 3.x, drf-spectacular

**Storage**: PostgreSQL 16 — **no migration this round** (`is_default`, `pinned`, `position` all exist since 0006; only their write rules change). `sessionStorage` `unihub.views.<tableKey>` keeps the same shape; the persisted tab order rides on `EntityView.position` via the existing `reorder/` action

**Testing**: Vitest + RTL (tab-menu enablement matrix, per-tab actions, kebab open-submenu filtering, reorder→persist call, default-transfer optimistic state), Playwright e2e (`entity-views.spec.ts` — scrollbar-hidden + shadow pixel probe, drag reorder geometry + persistence, kebab docking at narrow width), pytest-django (`is_default` transfer: atomic swap, promotion pins, demotion keeps `pinned`, explicit `false` rejected, delete guard follows the role, sync round trip preserves the role)

**Target Platform**: Desktop/tablet web browsers

**Project Type**: Web application — Django backend + React SPA frontend under `apps/unihub/`

**Performance Goals**: Unchanged — tab switch stays local; a drop issues at most one `reorder/` POST; a default transfer is one PATCH; shadow state updates from `scroll`/`ResizeObserver` handlers only (no per-frame work)

**Constraints**: URL stays the source of truth for active view state; drag must not swallow the click that opens a tab menu or switches tabs (activation distance); every menu constrains to the viewport (Principle VI); all new strings in both locales; `strict: true` TS, zero ESLint warnings; the running docker stack still needs migration 0006 applied on deploy (unchanged from round 2)

**Scale/Scope**: Single-user hub; same 5 adopted pages (tableKeys unchanged); tens of views per table

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS | No schema change — `core.entityview` stays registered with `owner_field="owner"`; `is_default`/`pinned`/`position` are already exported columns, so the transferable role round-trips through export/import and sync with no descriptor edit (FR-024 extended by SC-008 assertion only). |
| II | Domain independence | ✅ PASS | Backend change confined to `core/`; frontend change confined to `components/EntityViews/` + a shared `SortableList` capability (orientation), which stays generic. No domain imports. |
| III | Reference alignment | ✅ PASS | AntD `Dropdown`/`Menu` for both menus (no custom popover); dnd-kit reused via the existing shared `SortableList` rather than a second drag mechanism. |
| IV | API contract-driven | ✅ PASS | The `is_default` write rule changes in the serializer → schema regenerated (spectacular file route) → `pnpm generate-types`. No new endpoint; `PATCH` and `reorder/` already exist in the contract. |
| V | Quality loop + TDD | ✅ PASS | Backend first: `test_entity_views.py` gains a red `TestDefaultTransfer` before the serializer change. Frontend: the tab-menu enablement matrix and reorder-persistence tests are written against the hook/component API before the rewrite. Full `pnpm lint`/`typecheck`/`test`/`build` + `ruff`/`pytest` at the end. |
| VI | UI/UX (ov-fleet) | ✅ PASS | Both menus are AntD `Dropdown`s with `maxHeight: 60vh` internal scrolling (dropdown-fits-viewport rule); the kebab is the right-most control with a right-aligned, leftward-opening dropdown — exactly the panel-header kebab pattern generalized to this row. Disabled-not-hidden matches the 015 commit-node kebab precedent. Destructive Delete keeps its `Modal.confirm` (`okType: 'danger'`) gate. Tab labels keep `OverflowTooltip` (truncation-gated). |
| VII | PageTable layout | ✅ PASS | Still one `viewBar` slot rendering either the collapsed affordance or the row; no page re-implements anything. The strip's hidden scrollbar is local to the view row and does not touch PageTable's own sticky horizontal scrollbar. |
| VIII | i18n | ✅ PASS | New keys (7 tab-menu actions, 3 kebab actions, empty-state, aria-labels) land in en-US **and** zh-TW in the same commit; obsolete keys (`close` as a button label, `view` as the control label) are re-purposed or removed in both. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate and remount keys unchanged; per-column pins unchanged. Tab order is presentation state and never feeds a remount key. |
| — | Dev constraints | ✅ PASS | pnpm/uv only; session auth; delete gates honored; desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

**Visual-geometry rule (memory, feedback_visual_geometry_bugs)**: the scrollbar/shadow and kebab-docking directives are visual-geometry work — they must be locked by real-browser Playwright geometry/pixel assertions, not JSDOM style checks. Planned in `entity-views.spec.ts` (SC-006, SC-009, SC-010).

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Clarifications Session 2026-08-03 (round 3), FR-026/FR-027, SC-009–SC-011
├── plan.md              # This file (round 3; rounds 1–2 in git history)
├── research.md          # + R22–R28 (round-3 decisions)
├── data-model.md        # Updated: is_default transfer rules, tab order persistence, menu enablement matrix
├── quickstart.md        # + round-3 manual walk-through
├── contracts/
│   ├── entity-views-api.md       # Updated: PATCH is_default transfer semantics, reorder scope
│   └── view-url-serialization.md # Unchanged (round-2 grammar stands)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/
│   ├── serializers.py           # validate_is_default: allow promotion (reject explicit false); atomic demote in update()
│   ├── views.py                 # destroy guard unchanged (follows whichever row holds the role)
│   └── (no migration — 0006 already provides is_default + the partial unique constraint)
└── tests/
    └── test_entity_views.py     # + TestDefaultTransfer (TDD red first)

apps/unihub/frontend/src/
├── components/EntityViews/
│   ├── ViewTabs.tsx             # REBUILT — sortable strip (no scrollbar + edge shadows), no per-tab ×, no dbl-click
│   ├── ViewTabMenu.tsx          # NEW — per-tab Dropdown (click-on-active / contextMenu-on-any) + enablement matrix
│   ├── ViewKebab.tsx            # NEW (replaces ViewDropdown.tsx) — Add empty view / Open ▸ / Manage views…
│   ├── useEntityViews.ts        # per-tabId actions: saveTab/duplicateTab/pinTab/setDefaultTab/deleteTab/reorderTabs
│   ├── ManageViewsModal.tsx     # default row becomes draggable (delete still blocked); order stays in sync
│   └── *.test.ts(x)             # suites updated + new ViewTabMenu/ViewKebab suites
├── components/EntityToolbar/SortableList.tsx  # + orientation: 'vertical' | 'horizontal' (shared, generic)
├── locales/en-US/pages.ts       # new menu keys; obsolete control labels removed
├── locales/zh-TW/pages.ts       # same keys, zh-TW copy
└── generated/                   # regenerated types (is_default write rule)

apps/unihub/frontend/e2e/
└── entity-views.spec.ts         # + no-scrollbar/shadow probe, drag-reorder persistence, kebab docking at 375px
```

**Structure Decision**: Same layered structure as rounds 1–2. The only shared-component change outside `EntityViews/` is an additive `orientation` prop on the existing `SortableList` — chosen over a second drag implementation so the row, the filter/sort/column panels, and the manage modal keep one drag mechanism.

## Complexity Tracking

> No constitution violations — table intentionally empty.
