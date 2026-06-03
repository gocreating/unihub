# Implementation Plan: Refine Repository Documentation

**Branch**: `012-refine-docs` | **Date**: 2026-06-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-refine-docs/spec.md`

## Summary

Overhaul the public-facing GitHub repository presentation to match the conventions of popular open-source projects. Deliverables are pure documentation assets — no application source code is changed. The work involves: replacing the developer-oriented README with a polished user-facing README (logo, slogan, badges, feature list, screenshots, getting-started guide); correcting CLAUDE.md to match current project state; and committing a logo image and application screenshots as repository assets.

## Technical Context

**Language/Version**: Markdown, SVG/PNG image assets — no application runtime involved

**Primary Dependencies**: GitHub Actions badge URLs (shields.io for version/license; native GitHub Actions badge for CI); GitHub Releases API (for version badge auto-update)

**Storage**: Repository files only (`README.md`, `CLAUDE.md`, `docs/assets/`)

**Testing**: Manual visual verification on GitHub.com; no automated tests

**Target Platform**: GitHub repository page (github.com/gocreating/unihub)

**Project Type**: Documentation update — no frontend or backend code changes

**Performance Goals**: N/A

**Constraints**: No permanent changes to application source code or behaviour. Temporary scripts used to stage mock data for screenshot capture MUST NOT be committed.

**Scale/Scope**: 3 files updated (README.md, CLAUDE.md, .specify/feature.json), 1 logo asset created, 3+ screenshot assets created, 1 new `docs/assets/` directory

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature makes no changes to application source code, data models, API contracts, frontend components, or backend endpoints. All constitution principles (I–XII) are **NOT APPLICABLE** for this feature.

| Principle | Applicability | Status |
|-----------|---------------|--------|
| I — Entity-Centric Domain Architecture | N/A (no code changes) | PASS |
| II — Domain Independence | N/A | PASS |
| III — Reference Implementation Alignment | N/A | PASS |
| IV — API Contract-Driven Frontend | N/A | PASS |
| V — Quality Loop Enforcement | N/A (no code to lint/typecheck/test; markdown previewed manually) | PASS |
| VI — UI/UX Reference: ov-fleet | N/A | PASS |
| VII — PageTable Layout | N/A | PASS |
| VIII — Internationalisation | N/A (README/CLAUDE.md are repo docs, not in-app UI strings) | PASS |
| IX — Base Currency Net Worth | N/A | PASS |
| X — Chart Rendering | N/A | PASS |
| XI — Chart Library & Visualization | N/A | PASS |
| XII — Entity Toolbar & Sort Controls | N/A | PASS |
| Dev Constraint — Delete Confirmation | N/A | PASS |

**Gate result: PASS — no violations. Proceed to Phase 0.**

**Post-Phase-1 re-check**: CLAUDE.md edits must accurately reflect current constitution-mandated patterns (e.g., PageTable, i18n, entity-centric domains). Any CLAUDE.md statement that contradicts the constitution must be corrected, not preserved.

## Project Structure

### Documentation (this feature)

```text
specs/012-refine-docs/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output — README content draft
└── tasks.md             # Phase 2 output (via /speckit-tasks)
```

### Repository files changed

```text
README.md                     # Complete rewrite — user-facing polished README
CLAUDE.md                     # Corrections only — accuracy update, active feature pointer
docs/
└── assets/
    ├── logo.svg              # Project logo (committed as documentation asset)
    ├── screenshot-finance.png
    ├── screenshot-language.png
    └── screenshot-visiting.png
```

**Structure Decision**: Single-project documentation update. No `src/` or `tests/` changes. New `docs/assets/` directory holds the logo and screenshots — a conventional location for GitHub README assets.

## Complexity Tracking

> No constitution violations. This section is not applicable.

---

## Phase 0: Research

*Resolved below. See [research.md](research.md).*

---

## Phase 1: Design

*Resolved below. See [quickstart.md](quickstart.md) for the README content draft.*

### CLAUDE.md Audit — Known Corrections Required

| Item | Current State | Correction |
|------|---------------|------------|
| Active Feature section | Points to branch `011-ui-fixes-enhancements` (merged) | Update to `012-refine-docs` |
| Active Feature plan link | Points to `specs/011-ui-fixes-enhancements/plan.md` | Update to `specs/012-refine-docs/plan.md` |
| Architecture / domain list | May omit `people`, `music` apps added after initial write | Verify all domains listed |
| PageTable section | Check accuracy against current component | Verify or correct |
| Technology versions | e.g., React, Ant Design, Python version | Verify against `pyproject.toml` and `package.json` |
