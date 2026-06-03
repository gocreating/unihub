# Research: Refine Repository Documentation

**Feature**: 012-refine-docs | **Date**: 2026-06-03

---

## Badge URLs

### CI/CD Status Badge

- **Decision**: Use the native GitHub Actions workflow badge for the `ci.yml` workflow.
- **URL**: `https://github.com/gocreating/unihub/actions/workflows/ci.yml/badge.svg`
- **Rationale**: Auto-updates on every workflow run; no external service dependency; the workflow is named `CI` in `.github/workflows/ci.yml`.
- **Markdown**: `[![CI](https://github.com/gocreating/unihub/actions/workflows/ci.yml/badge.svg)](https://github.com/gocreating/unihub/actions/workflows/ci.yml)`

### Latest Release / Version Badge

- **Decision**: Use shields.io dynamic GitHub release badge.
- **URL**: `https://img.shields.io/github/v/release/gocreating/unihub`
- **Rationale**: Auto-updates when a new release is published via the `Release` workflow (triggered on `v*` tags). Zero manual maintenance.
- **Markdown**: `[![GitHub Release](https://img.shields.io/github/v/release/gocreating/unihub)](https://github.com/gocreating/unihub/releases)`

### License Badge

- **Decision**: Use shields.io dynamic GitHub license badge — but only after a `LICENSE` file is added to the repo root.
- **URL**: `https://img.shields.io/github/license/gocreating/unihub`
- **Rationale**: Auto-reads the license from the GitHub-detected LICENSE file; zero maintenance once the file is present.
- **Markdown**: `[![License](https://img.shields.io/github/license/gocreating/unihub)](LICENSE)`
- **Prerequisite**: A `LICENSE` file must be created as part of this feature. Recommended: MIT License (standard for personal open-source tools; simple, permissive). If a different license is preferred, the badge resolves automatically from whatever is committed.

---

## Logo Approach

- **Decision**: Create an SVG logo file at `docs/assets/logo.svg` and reference it from the README via relative path.
- **Rationale**: SVG is vector — renders crisp at any size on GitHub, HiDPI displays, and in external links. Committed to repo as a doc asset (no external CDN dependency). Relative path is robust against repo forks.
- **Alternatives considered**:
  - PNG: Raster — requires explicit size management. Less flexible.
  - External URL: Creates external dependency; broken if URL changes. Rejected.
  - Emoji in markdown: Does not create a reusable, scalable asset. Rejected.
- **Logo concept**: A minimalist hub/spoke or grid icon representing a personal life dashboard — abstract enough to not represent a single domain. SVG allows clean rendering at 80×80 px in the README header.
- **README embedding**: `<img src="docs/assets/logo.svg" alt="UniHub" width="80" />`

---

## README Structure Reference

- **Decision**: Follow the structure used by popular self-hosted dashboard projects (Home Assistant, Dasherr, Heimdall, etc.).
- **Canonical section order**:
  1. Logo + project name (centered, above badges)
  2. Slogan (one sentence, centered)
  3. Badge row (CI, release, license)
  4. Brief overview paragraph (2-3 sentences, what/who/why)
  5. Screenshots (gallery, 2-3 images)
  6. Features / Domains list (bullet or table)
  7. Getting Started (prerequisites → install → run)
  8. Contributing (brief note)
- **Rationale**: This order maximises first-impression impact: visual identity → social proof (badges) → proof of work (screenshots) → detail (features) → action (getting started).

---

## Screenshots Plan

- **Decision**: Capture 3 screenshots covering distinct domains with mock data.
- **Selected domains and pages**:
  1. **Finance — Accounts page** (`/finance/accounts`): Shows the balance-sheet tree with multiple accounts, currencies, and net worth aggregation. Most feature-rich visual.
  2. **Language — Word Cards page** (`/language/word-cards`): Shows a vocabulary table with example sentences. Demonstrates the breadth of domains.
  3. **Visiting — Places page** (`/visiting/places`): Shows a place list/table. Third distinct domain.
- **Rationale**: Finance is the most visually impressive (charts, multi-currency, aggregation). Language and Visiting show that the hub spans diverse life areas, reinforcing the "personal life OS" slogan.
- **Mock data staging**: Populate each page with 8-15 realistic (non-personal) records via the running dev environment. Temporary seed scripts are acceptable per spec clarification; they are NOT committed.
- **Image format**: PNG, `docs/assets/screenshot-finance.png`, etc.
- **README embedding**: Use `<img>` tags inside a centered `<div>` or markdown image syntax with alt text.

---

## License Selection

- **Decision**: MIT License.
- **Rationale**: Standard for personal open-source tools. Permissive, compatible with all project dependencies, and expected by the open-source community for personal projects of this kind.
- **File**: `LICENSE` at repo root with standard MIT text, year 2026, copyright holder: CP (gocreating).
- **Alternatives considered**: Apache 2.0 (adds patent clause — unnecessary overhead for a personal project). GPL (copyleft — overly restrictive for a personal dashboard). MIT is the lightest-weight choice.

---

## CLAUDE.md Corrections Checklist

Areas to verify and correct in CLAUDE.md:

1. **Active Feature section**: Must point to `012-refine-docs` branch and this plan.
2. **Domain list**: Verify all 6 domains (finance, visiting, language, people, music, health/check) are listed and correctly described.
3. **Technology versions**: Cross-check against `apps/unihub/frontend/package.json` and `apps/unihub/backend/pyproject.toml` for accuracy.
4. **Reference to ov-fleet path**: The path `/Users/gocreating/...` may be system-specific; note it is a local reference.
5. **Backend structure**: Verify the listed directory tree matches actual layout under `apps/unihub/backend/`.
6. **Service layer structure**: Verify `src/services/unihub-backend/` file list matches actual files.
7. **"Adding a New Domain" steps**: Verify against the constitution's Domain Addition Protocol (6-step sequence) — they must not contradict.
