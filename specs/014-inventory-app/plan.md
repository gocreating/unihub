# Implementation Plan: Inventory App — Iteration 19 (Panel-header kebab pattern, catalog delete relocation, organize polish, full legacy import)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 iteration 19; FR-003/003b (catalog actions), FR-007 (edit-page kebab), FR-011 (scenario panel folding, organize tooltips + caret, modal fixes), FR-029c (full legacy import + verification). Constitution **v1.21.0** (new Principle VI panel-header rule).

## Summary

1. **PanelHeaderActions (shared component)** — implements the new v1.21.0 pattern once: right-side Card `extra` slot; `visible` actions render as buttons on wide content, fold into the kebab on narrow; `advanced` (destructive) actions always live in the kebab; kebab dropdown `placement="bottomRight"` (right-aligned, opens leftward). Fold decision comes in as a `narrow` prop (pages feed their `useContainerWidth` state).
2. **Catalog actions** — acquisition rows (and merged rows) lose Delete; the Edit action becomes a **real hyperlink** (AntD Button with `href` + left-click intercepted for SPA navigation, so middle/ctrl-click opens a new tab).
3. **Acquisition edit page** — the Acquisition panel header gains the kebab holding Delete (item-count confirm reused from the catalog; success navigates to the Catalog).
4. **Scenario detail panel** — adopts PanelHeaderActions: Edit visible wide / folded narrow, Delete always in the kebab, dropdown bottomRight.
5. **Organize rows** — truncation-gated tooltips (ItemName gains a `truncate` mode so the alias tooltip and the truncation tooltip cannot nest: title = original name when aliased, else the gated display text; spec line via OverflowTooltip); **caret toggler restored**: rows with children show CaretDown/CaretRight (expanded default), collapse state client-side, collapsed subtrees hidden; drop-gap math maps VISIBLE positions to WORKING-list indexes (dropping after a collapsed container lands after its whole subtree) via a new pure helper.
6. **Search modal** — rows fit the modal width (`minWidth: 0` + ellipsis); a **single Add button per row** (disabled + "Added" tooltip for members — Tag removed); each result shows its **acquisition context** (source + four-case date line) via a shared `acquisitionSummaryLines` helper extracted from the catalog page.
7. **Full legacy import (FR-029c)** — preview each of 2015–2024 (record counts), import sheet-by-sheet (no wipe), fix + regression-test any parser defect BEFORE importing the offending sheet, then verify: final totals = previous totals + Σ previews; per-year obtained-date distribution; spot checks over the live API.

## Technical Context

**Language/Version**: TypeScript 5.7 (no backend code change expected; importer/parser fixes only if older sheets surface defects — each TDD'd)

**Primary Dependencies**: No new packages.

**Storage**: No migration. The import is a data operation.

**Testing**: RTL first (PanelHeaderActions fold logic via `narrow` prop; catalog action changes; edit-page kebab; organize caret/tooltips; modal single-Add + context); pure-helper units (visible→working gap mapping with collapsed subtrees); pytest fixtures for any parser fixes; Playwright (catalog Edit href + no Delete; edit-page kebab delete; caret collapse/expand; narrow-fold panel; modal width/Add tooltip).

**Constraints**: jsdom cannot exercise `useContainerWidth` (width 0 → wide); the fold logic is therefore tested on the component via an explicit `narrow` prop, and the live narrow behavior in e2e. The catalog Edit link keeps SPA navigation on plain left click (`preventDefault` + `navigate`) while preserving a genuine `href`.

**Scale/Scope**: New `PanelHeaderActions` + `ItemName.truncate`; catalog actions cell; edit page panel; scenario detail panel + organize rows + modal; `organizeTree.ts` visible/gap helpers; shared `acquisitionSummaryLines` extraction; locales ×2; RTL/e2e updates; 10-sheet import + verification.

## Constitution Check

*GATE vs v1.21.0 — PASS (pre-Phase-0 and post-Phase-1).*

| Principle | Gate | Status |
|---|---|---|
| VI v1.21.0 | The new panel-header rule is implemented via ONE shared component used by every affected panel (scenario info, acquisition edit); organize tooltips become truncation-gated (fixing a live violation). | PASS |
| V TDD | Component/unit/RTL specs precede implementation; parser fixes are fixture-locked before their sheet imports. | PASS |
| VIII i18n | New keys (Added tooltip, kebab labels if any) in BOTH locales; removed keys cleaned. | PASS |
| I / IV | No schema/API change (contracts untouched unless a parser fix needs one — none expected). | PASS |

No violations → Complexity Tracking empty.

## Project Structure

```text
apps/unihub/frontend/src/
├── components/PanelHeaderActions/index.tsx (+test)   # v1.21.0 pattern, shared
├── components/ItemName/index.tsx (+test)             # + truncate mode (gated tooltip, no nesting)
├── pages/inventory/acquisitionSummary.ts              # extracted summary-lines helper (catalog + modal)
├── pages/inventory/catalog/index.tsx                  # Edit href link; Delete removed
├── pages/inventory/acquisitions/edit.tsx / AcquisitionForm.tsx  # panel kebab + delete
├── pages/inventory/scenarios/detail.tsx               # PanelHeaderActions; caret; tooltips; modal fixes
├── pages/inventory/scenarios/organizeTree.ts (+test)  # visibleRows(collapsed), gapFromVisible
└── locales/{en-US,zh-TW}/pages.ts

apps/unihub/backend/…                                  # only if a parser fix lands (fixture test first)
specs/014-inventory-app/scripts/preview_legacy_import.py  # fixes if older sheets trip
```

**Structure Decision**: The kebab pattern lives in a shared component so every future panel inherits v1.21.0 for free; the acquisition summary formatter becomes a shared inventory helper instead of a catalog-local function.

## Phase 0 — Research (research.md R19.1–R19.5)

- **R19.1 Kebab component**: fold via explicit `narrow` prop (pages own the ResizeObserver); wide = visible buttons + kebab(advanced), narrow = kebab(visible + advanced); `Dropdown placement="bottomRight"` trigger click.
- **R19.2 Edit hyperlink**: AntD `Button href` renders an anchor (new-tab capable); intercept plain left click (`!ctrlKey && !metaKey && button 0`) → `preventDefault` + router `navigate` to keep SPA behavior.
- **R19.3 Tooltip nesting**: ItemName `truncate` mode owns BOTH tooltips — aliased → original name (informational, ungated); unaliased → truncation-gated same-text tooltip (OverflowTooltip semantics) — one Tooltip instance, never nested.
- **R19.4 Caret + collapsed drops**: `collapsedIds` set; `visibleRows(working, collapsed)` hides descendants of collapsed rows; `gapFromVisible(working, visible, visIndex, after)` maps a visible slot to the working-list gap (after a collapsed container = after its subtree). Indicator renders in visible coordinates.
- **R19.5 Import verification**: per-sheet preview counts recorded first; import order 2015→2024; failure protocol = fixture test → parser/importer fix → re-run sheet; final assertion: `Acquisition.objects.count()`/`Item.objects.count()` equal 140/221 + Σ previews, per-year `obtained_at__year` distribution ≈ sheet years, sampled remark/parameter spot checks.

## Phase 1 — Design & Contracts

- **Contracts / data-model**: none (no API/schema change).
- **Agent context**: CLAUDE.md SPECKIT block → iteration 19.

## Complexity Tracking

*(no constitution violations — intentionally empty)*
