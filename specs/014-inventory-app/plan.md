# Implementation Plan: Inventory App — Iteration 17 (Catalog polish + 2025 import)

**Branch**: `014-inventory-app` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: spec.md — Session 2026-07-12 iteration 17; FR-003/FR-003a revisions (plurals, Name link removal, URL width cap, default YTD filter, page size 50), FR-029b (2025 append-import). Constitution v1.20.0.

## Summary

1. **Plurals** — the Item-cell count and the footer totals switch to ICU plural messages in en-US (`{count, plural, one {# item} other {# items}}`; footer pluralizes both acquisitions and items). zh-TW texts unchanged.
2. **Name column** — drop the hyperlink; plain text (the derived Item column keeps the sole link).
3. **URL width (defect)** — measure-what-you-render: the `url` column's measured width is capped to the 320px render cap (`min(dataWidths.url, 320)` fed to `widthForHeader`), and the ellipsised link gains a truncation-gated `OverflowTooltip` with the full URL.
4. **Default YTD filter** — `useEntityFilter` gains a `defaultGroups` seed (mirroring `useEntitySort`'s `defaultRules`): initial active+pending state = the seed; the Filter button lights via the existing `isActive`. The Catalog seeds two OR-groups on `acquisition__obtained_at`: `gte <Jan 1 of current year>` OR `is_empty` (pending stays visible; acquisition-level field → tree mode preserved). Threaded through `useEntityTable` as `defaultFilterGroups`.
5. **Page size 50** — `defaultPageSize: 50` on the Catalog's `useEntityTable` (options unchanged).
6. **2025 import** — run `import_legacy_csv data/財產們/2025.html --commit` WITHOUT `--wipe` from the host (`DATABASE_URL=postgresql://unihub:unihub@localhost:5433/unihub`), then verify totals and spot-checks over the live API.

## Technical Context

**Language/Version**: TypeScript 5.7 (backend untouched — no schema/API change; the importer is reused as-is)

**Primary Dependencies**: react-intl ICU plural (already available); no new packages.

**Storage**: No migration. The 2025 import is a data operation only.

**Testing**: RTL first (plural texts, Name plain text, URL width cap + tooltip, seeded filter state + lit Filter button, page size 50); useEntityFilter hook specs for `defaultGroups` (seeded active/pending, clearable, apply-gate untouched); e2e updates (default-filtered footer, page-size 50, Name column, seeded Filter button lit). Import verified live (counts + spot checks), not unit-tested beyond the existing parser suite.

**Constraints**: The seeded filter value "Jan 1 of current year" is computed at page load (`dayjs().startOf('year').format('YYYY-MM-DD')`); RTL fixes the assertion via the same computation, not a hardcoded year. Existing RTL specs asserting "1 items" and e2e specs assuming 25/page or unfiltered defaults must be updated in the same change.

**Scale/Scope**: Locale edits ×2; catalog page (name/url colDefs, defaultPageSize, defaultFilterGroups seed); `useEntityFilter` + `useEntityTable` seed plumbing; RTL/e2e updates; one host-side import run.

## Constitution Check

*GATE vs v1.20.0 — PASS (pre-Phase-0 and post-Phase-1).*

| Principle | Gate | Status |
|---|---|---|
| VI UI rules | URL tooltip becomes truncation-gated (fixing an omission); placeholders unchanged. | PASS |
| VII PageTable/footer | Footer layout untouched; only the total text pluralizes. | PASS |
| VIII i18n | Plural forms land in BOTH locales in the same commit (zh-TW re-uses existing strings — no plural inflection). | PASS |
| XII Toolbar | `defaultGroups` extends the filter hook exactly like `defaultRules` extended sort (apply-gate + isActive semantics unchanged). | PASS |
| V TDD | Hook + page RTL specs precede implementation; e2e updated with the behavior change. | PASS |

## Project Structure

```text
apps/unihub/frontend/src/
├── components/EntityToolbar/hooks/useEntityFilter.ts   # defaultGroups seed (+ test)
├── components/EntityToolbar/useEntityTable.ts          # defaultFilterGroups pass-through
├── pages/inventory/catalog/index.tsx                   # name plain text; url cap+tooltip; seeds (filter, pageSize 50)
├── locales/{en-US,zh-TW}/pages.ts                      # ICU plural itemCount + footerTotals
apps/unihub/frontend/e2e/inventory-catalog.spec.ts      # updated defaults
```

**Structure Decision**: Existing layout; the filter seed lives in the shared toolbar hooks so other pages can ship default filters later.

## Phase 0 — Research (research.md R17.1–R17.3)

- **R17.1 URL width root cause (CONFIRMED)**: cell renders `maxWidth: 320` ellipsis; `displayText('url')` returns the raw URL so `measureTextWidth` sizes the column to the full string. Fix at the width source: cap the url entry fed to `widthForHeader`. Tooltip: wrap the link content in `OverflowTooltip` (measures its own span; title only when truncated).
- **R17.2 Filter seeding**: `useEntityFilter` currently initializes empty. Mirror `useEntitySort`: accept `defaultGroups`, seed active+pending, keep clear/apply semantics (clearing shows everything — no reset-to-seed requirement in spec). `isActive` already lights the button for non-empty active groups.
- **R17.3 Import scope**: 2025.html exists alongside 2026.html; append-import (no `--wipe`). The default YTD filter means 2025 rows won't show on the default Catalog view — expected and intended (clear/edit the filter to see them). e2e specs that raise the page size to find multi-item acquisitions keep working against the 2026 YTD subset.

## Phase 1 — Design & Contracts

- **Contracts**: none (no API change).
- **data-model.md**: none (no schema change).
- **Agent context**: CLAUDE.md SPECKIT block → iteration 17.

## Complexity Tracking

*(no violations — empty)*
