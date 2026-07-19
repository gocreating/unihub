# Implementation Plan: Inventory — Iteration 45 (emoji middle-align, scenario name links, modal parameters, caret centering, tab titles)

**Branch**: `014-inventory-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: Session 2026-07-19 (iteration 45) clarifications — FR-010/FR-011/FR-032 amended, FR-035 new.

## Summary

Five frontend-only refinements (no backend, no schema):

1. **Parameter emoji vertical centering (FR-032)**: the KeyEmoji still renders offset inside the ItemDisplay parameter Tag's OverflowTooltip context despite the iteration-41 treatment. Probe the rendered geometry (Playwright boundingBox of the emoji span vs the label text), fix the layout (likely: the tag content becomes an inline-flex centered row instead of relying on `vertical-align` inside an ellipsized span), and lock with an RTL style assertion + e2e pixel check.
2. **Scenario list Name → real link (FR-010)**: replace `<a onClick={navigate}>` with the router `<Link to={/inventory/scenarios/:id}>` so href-based affordances work; RTL asserts the anchor's `href`.
3. **Add-modal results show parameters (FR-011)**: pass `parameters={item.parameters}` + `showParameters` to the modal's ItemDisplay (the items search API already serializes `parameters`); RTL asserts a parameter tag renders in results.
4. **Organize caret centered on the name line (FR-011)**: replace the `marginTop: 4` nudges on the caret + holder with first-line-height centering (`display:flex; alignItems:center; height:<primary line height>`); e2e measures caret box center vs the name line box center (±2px).
5. **Scenario tab titles (FR-035)**: new `usePageTitle(title?)` hook (`hooks/usePageTitle.ts`): sets `document.title = title ? `${title} · Unihub` : 'Unihub'`, restores on unmount; list page passes the localized Scenarios label, detail passes the scenario display name once loaded (label fallback while loading). RTL asserts document.title in both pages.

Then: frontend loops (lint/typecheck/test/build), docker rebuild, inventory e2e, commit/push, CI confirmation.

## Technical Context

**Language/Version**: TypeScript 5.7, React 18.3, AntD 5.24; no backend changes.
**Primary Dependencies**: react-router 7 (`Link`), react-intl, dnd-kit (untouched), Vitest + RTL, Playwright e2e.
**Storage**: N/A.
**Testing**: Vitest/RTL for links, parameters, titles, style locks; Playwright for pixel geometry (emoji + caret).
**Target Platform**: docker compose local stack (frontend serves built image — rebuild before e2e).
**Project Type**: web app monorepo.
**Performance Goals**: N/A.
**Constraints**: constitution v1.22.0 (i18n keys for any new label; gated tooltips; ICU plurals N/A here); no new deps.
**Scale/Scope**: 4 files touched (ItemDisplay, scenarios/index, scenarios/detail, new hook) + tests.

## Constitution Check

- I (Spec-driven): session recorded; FR-010/011/032 amended, FR-035 added. ✓
- II (Quality loops): frontend lint/typecheck/test/build + backend loops (untouched but run). ✓
- III (Test-first): RTL/e2e assertions written with each change; geometry probed before fixing. ✓
- VI (Tooltips): unchanged surfaces keep gated tooltips. ✓
- VIII (i18n): titles use existing `menu.*`/scenario labels; no hardcoded strings. ✓

## Project Structure

### Documentation (this feature)

```text
specs/014-inventory-app/
├── plan.md              # This file
├── research.md          # §Iteration 45 appended
├── spec.md              # Session 2026-07-19 (iteration 45)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
apps/unihub/frontend/src/components/ItemDisplay/index.tsx   # KeyEmoji/tag layout fix
apps/unihub/frontend/src/pages/inventory/scenarios/index.tsx # Name column Link
apps/unihub/frontend/src/pages/inventory/scenarios/detail.tsx # modal parameters, caret centering, title
apps/unihub/frontend/src/hooks/usePageTitle.ts               # NEW
apps/unihub/frontend/src/components/ItemDisplay/ItemDisplay.test.tsx (+ page tests)
apps/unihub/frontend/e2e/inventory-scenario.spec.ts          # caret/emoji geometry locks
```

**Structure Decision**: existing layout; frontend-only.

## Phase 0 — Research (research.md §Iteration 45)

Measured this session: scenario list renders `<a onClick>` without href; modal ItemDisplay lacks `showParameters` (organize rows have it — RowContent passes parameters); caret/holder use `marginTop: 4` on an `alignItems: flex-start` row; `document.title` is the static index.html "Unihub" with no runtime management; KeyEmoji carries the iteration-41 styles yet the user still reports offset in item rendering — geometry to be probed on the running app before fixing.

## Phase 1 — Design

**Data model / contracts**: unchanged.

- **Emoji**: after probing, restructure the tag content: `<Tag><OverflowTooltip>` wraps an inner `display:inline-flex; alignItems:center` row containing KeyEmoji + label span, so centering no longer depends on `vertical-align` inside the ellipsis context. KeyEmoji keeps the monochrome silhouette; the e2e asserts |emojiCenterY − labelCenterY| ≤ 1.5px on a catalog/organize tag.
- **Link**: `render: (val, record) => <Link to={...}>{val}</Link>`; remove `navigate` from deps if unused.
- **Modal parameters**: the modal item type comes from the items list API (`parameters` already present on catalog rows — verify the modal query uses the same serializer; pass through).
- **Caret**: caret + holder spans get `display:flex; alignItems:center; height:22` (primary line height), replacing `marginTop: 4`; the DragOverlay preview mirrors row content so no overlay change needed.
- **Titles**: `usePageTitle` — `useEffect` on title: set `document.title`; cleanup restores `'Unihub'`. Detail page: `usePageTitle(scenario ? displayName(scenario) : listLabel)`.

## Phase 2 — Tasks

See tasks.md (T001 probe + tests → T002 implement all five → T003 loops/e2e/ship).
