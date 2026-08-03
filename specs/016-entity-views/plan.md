# Implementation Plan: Entity Views — Round 4 (naming, dialogs, drag fix)

**Branch**: `016-entity-views` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-entity-views/spec.md` — Clarifications Session 2026-08-04 (round 4 on top of the round-3 implementation; earlier plans at commits 467beff / 8e1f169 / 3defc24)

## Summary

Round 4 is a naming-and-interaction cleanup of the view row, plus two bug fixes:

1. **Save never prompts** — `SaveViewModal` is deleted. A scratch tab is auto-labelled **"New view"**; Save stores it immediately under whatever the tab is currently called (FR-014, SC-012).
2. **Rename opens a dialog** — a new `RenameViewModal` pre-filled with the current name replaces the round-3 inline input; on a tab with no stored view it just relabels until the next Save (FR-023).
3. **Names are labels, not keys** — the `(owner, table_key, name)` unique constraint is dropped (**migration core/0007**); names are trimmed and may repeat (FR-016). The "(n)" duplicate suffix goes with it: a copy carries its source's exact name (FR-015).
4. **URLs reference a view by id** — because a name can no longer identify a view, `<tableKey>.view=` carries the stored identifier. Every other facet stays readable prose; SC-007 was amended to permit exactly this one non-prose value (FR-022).
5. **Set as default must not disturb the row** — the promoted tab keeps its position and neither tab goes dirty (FR-026, SC-011). Two defects to fix: promotion pins the view, which lets the position-ordered merge re-sort the strip; and the active tab's live config is not snapshotted before the identity swap, so the demoted tab compares stale state.
6. **Dragged tabs must not stretch** — dnd-kit's `CSS.Transform.toString()` emits `scaleX`, which `horizontalListSortingStrategy` uses to size items to the one they pass over. Horizontal lists switch to `CSS.Translate.toString()` (FR-027, SC-010).
7. **"Manage views" is gone** — the action and `ManageViewsModal` are deleted; every management action lives on a tab, and a closed view is managed by opening it from the kebab's "Open" submenu first (FR-017).
8. **"Add empty view" means blank** — no filters, no sorting, all columns visible in the page's natural order, nothing pinned, page default size — explicitly *not* the table's default view config (FR-011).
9. **The tab menu closes on outside click and Esc** (FR-023).

Net: one backend migration + serializer change; on the frontend two components deleted, one added, and the hook's naming/ordering paths simplified.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend), Python 3.12 (backend)

**Primary Dependencies**: React 18.3, Ant Design 5.24 (`Modal`, `Dropdown`), @dnd-kit/core 6.3 + @dnd-kit/sortable 10 + @dnd-kit/utilities (`CSS.Translate`), TanStack React Query 5, React Router 7, react-intl; Django 5.x, DRF 3.x, drf-spectacular

**Storage**: PostgreSQL 16 — **migration core/0007** drops `UniqueConstraint(owner, table_key, name)`; the partial `is_default` constraint stays. `sessionStorage` `unihub.views.<tableKey>` keeps its shape (tab `name` now holds the auto-label for unsaved tabs)

**Testing**: pytest-django (duplicate names accepted, whitespace trimmed, blank rejected; the round-3 default-transfer suite must stay green), Vitest + RTL (no-prompt save, rename dialog, blank-config add, id-based URL round trip, outside-click/Esc close, no-reorder/no-dirty promotion), Playwright e2e (drag width ±2px — a real-browser geometry lock per the visual-geometry rule)

**Target Platform**: Desktop/tablet web browsers

**Project Type**: Web application — Django backend + React SPA frontend under `apps/unihub/`

**Performance Goals**: Unchanged — Save is one PATCH/POST, promotion one PATCH, a drop one `reorder/` POST

**Constraints**: The URL stays the source of truth for active view state; deleting `SaveViewModal`/`ManageViewsModal` must not orphan i18n keys; `strict: true` TS, zero ESLint warnings; both locales updated in the same commit

**Scale/Scope**: Single-user hub; same 5 adopted pages; tens of views per table

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Entity-centric + data_io | ✅ PASS | Migration 0007 changes constraints only — no field added or removed, so the `core.entityview` descriptor is untouched and the export/import shape is identical. Sync round trips keep working unchanged. |
| II | Domain independence | ✅ PASS | Backend change confined to `core/`; frontend change confined to `components/EntityViews/` plus the shared `SortableList` transform fix (generic, benefits any horizontal list). |
| III | Reference alignment | ✅ PASS | AntD `Modal` for the rename dialog (Cancel left / primary right, no maskClosable while dirty — Principle VI); no new libraries. |
| IV | API contract-driven | ✅ PASS | Constraint removal is a validation change; the OpenAPI schema is unaffected (no field or type changes). Regeneration is still run to prove it. |
| V | Quality loop + TDD | ✅ PASS | Backend: duplicate-name test flips from 400 → 201 and is written red first (it asserts the OLD behavior today). Frontend: the no-prompt save, rename dialog, blank config, and id-URL suites are written before the code. Full loops at the end. |
| VI | UI/UX (ov-fleet) | ✅ PASS | Rename is a modal with Cancel on the left and the primary action on the right; it must not close on outside click while the field is dirty. The tab menu closing on outside click/Esc is standard AntD overlay behaviour restored. Disabled-not-hidden menu items unchanged. |
| VII | PageTable layout | ✅ PASS | The `viewBar` slot is untouched. |
| VIII | i18n | ✅ PASS | New keys (`renameViewTitle`, `newViewName` reuse) in en-US **and** zh-TW same commit; keys orphaned by the deleted modals (`saveViewTitle`, `manageTitle`, `manageViews`, `manageSaveError`, `duplicateName`, `savedList`, `noSaved`, `edit`) removed from both. |
| IX–XI | Currency / charts | N/A | Not touched. |
| XII | Entity toolbar patterns | ✅ PASS | Apply-gate and remount keys unchanged; the blank config is built from the page's declared columns, so pins/visibility stay a `ColumnDef` concern. |
| — | Dev constraints | ✅ PASS | pnpm/uv only; session auth; delete gates honored; desktop-first. |

**Initial gate result**: PASS — no violations to justify. Re-checked after Phase 1 design: still PASS.

**Amended success criterion**: SC-007 previously promised "zero opaque encoded values". An id reference is opaque, so the criterion was amended in the spec (facets stay readable; the view reference alone is an id) rather than silently violated — recorded here because it is a deliberate weakening of a shipped guarantee, justified by FR-016 making names non-identifying.

**Visual-geometry rule (memory, feedback_visual_geometry_bugs)**: the drag-stretch defect is a visual-geometry bug — it must be reproduced and locked with a real-browser Playwright width assertion, not a JSDOM style check.

## Project Structure

### Documentation (this feature)

```text
specs/016-entity-views/
├── spec.md              # + Clarifications Session 2026-08-04, FR/SC amendments, SC-012
├── plan.md              # This file (round 4; rounds 1–3 in git history)
├── research.md          # + R29–R36 (round-4 decisions)
├── data-model.md        # Updated: name non-unique, blank config, tab labels, URL by id
├── quickstart.md        # + round-4 manual walk-through
├── contracts/
│   ├── entity-views-api.md       # Updated: names not unique, trimming, migration 0007
│   └── view-url-serialization.md # Updated: `.view` carries the id
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/unihub/backend/
├── core/
│   ├── models.py                     # EntityView.Meta: drop the (owner, table_key, name) constraint
│   ├── serializers.py                # drop the name-collision check; keep trim + non-blank
│   └── migrations/0007_*.py          # RemoveConstraint (no field changes)
└── tests/
    └── test_entity_views.py          # duplicate names now 201; trimming/blank cases (TDD)

apps/unihub/frontend/src/
├── components/EntityViews/
│   ├── RenameViewModal.tsx           # NEW — prefilled, trims, Enter submits
│   ├── SaveViewModal.tsx             # DELETED (+ its test)
│   ├── ManageViewsModal.tsx          # DELETED (+ its test)
│   ├── ViewTabMenu.tsx               # `onNeedsName` gone; Rename opens the dialog
│   ├── ViewTabs.tsx                  # rename dialog state; outside-click/Esc close; no manage modal
│   ├── ViewKebab.tsx                 # "Manage views…" removed; blank-config add
│   ├── useEntityViews.ts             # no-prompt save, blankConfig, id-based URL, promotion fixes,
│   │                                 #   duplicate keeps the name, commitManageChanges removed
│   └── serialization.ts              # `.view` = view id (parse + emit)
├── components/EntityToolbar/SortableList.tsx  # horizontal → CSS.Translate (no scaleX)
├── locales/{en-US,zh-TW}/pages.ts    # rename-dialog keys in, dead modal keys out
└── services/unihub-backend/core.ts   # unchanged (no contract shape change)

apps/unihub/frontend/e2e/
└── entity-views.spec.ts              # + dragged-tab width lock (SC-010)
```

**Structure Decision**: Same layered structure as rounds 1–3. This round is subtractive on the frontend (two modals out, one small dialog in) and constraint-only on the backend; the single shared-component change is the horizontal transform fix in `SortableList`.

## Complexity Tracking

> No constitution violations — table intentionally empty.
