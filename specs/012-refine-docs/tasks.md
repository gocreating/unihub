# Tasks: Refine Repository Documentation

**Input**: Design documents from `specs/012-refine-docs/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, quickstart.md ✅

**Tests**: Not applicable — documentation-only feature; acceptance is manual visual verification on GitHub.com.

**Organization**: Tasks are grouped by user story to enable independent completion and verification of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (independent of other in-progress tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every description

---

## Phase 1: Setup

**Purpose**: Create the documentation asset directory that holds the logo and screenshots.

- [x] T001 Create `docs/assets/` directory (will be populated in US1 tasks)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Two prerequisites that MUST be complete before user story work begins: the LICENSE file (needed for the license badge to resolve in US3) and local environment readiness (needed for screenshots in US1).

**⚠️ CRITICAL**: Screenshot capture and badge verification depend on this phase.

- [x] T002 [P] Create MIT LICENSE file at repo root (`LICENSE`) — use standard MIT 2026 text, copyright holder: CP (gocreating)
- [ ] T003 [P] Start local dev environment (`docker compose -f apps/unihub/docker-compose.local.yml up`) and confirm Finance Accounts, Language Word Cards, and Visiting Places pages all load without errors (verifies screenshot targets are accessible)

**Checkpoint**: LICENSE committed, local app running — US1 screenshot capture and US3 badge verification can now proceed.

---

## Phase 3: User Story 1 — First-Time Visitor Gets the Point Fast (Priority: P1) 🎯 MVP

**Goal**: Rewrite the README header and visual sections so a first-time GitHub visitor understands what UniHub is and sees proof of the product — without scrolling.

**Independent Test**: Open `github.com/gocreating/unihub` on GitHub, look at the page without scrolling, and confirm: logo visible, slogan readable, overview paragraph present, and at least 2 screenshots visible.

### Implementation for User Story 1

- [x] T004 [US1] Create project logo SVG at `docs/assets/logo.svg` — hub/spoke motif (central dot + 6 radiating lines), `viewBox="0 0 80 80"`, single dark color suitable for both light and dark GitHub themes, no gradients or shadows (see quickstart.md Logo Design Brief)
- [ ] T005 [P] [US1] Stage mock data on Finance Accounts page using a temporary browser-side approach or backend shell (NOT committed); capture screenshot at 1400×900px to `docs/assets/screenshot-finance.png` — show multiple accounts with balances and the net worth aggregation row
- [ ] T006 [P] [US1] Stage mock data on Language Word Cards page (NOT committed); capture screenshot at 1400×900px to `docs/assets/screenshot-language.png` — show 8–10 vocabulary rows with word, translation, and example fields visible
- [ ] T007 [P] [US1] Stage mock data on Visiting Places page (NOT committed); capture screenshot at 1400×900px to `docs/assets/screenshot-visiting.png` — show 6–8 place entries
- [x] T008 [US1] Write README.md — centered header block: `<div align="center">` wrapping `<img src="docs/assets/logo.svg" alt="UniHub" width="80" />`, `<h1>UniHub</h1>`, slogan `<p><em>Your personal life OS — one dashboard to capture, organise, and browse everything that matters.</em></p>`, and badge row with CI/release/license badges (URLs from `specs/012-refine-docs/research.md`)
- [x] T009 [US1] Write README.md — Overview paragraph section (after the header `---` divider): 2–3 sentences explaining what UniHub is, why it replaces multiple single-purpose tools, and that new domains can be added over time
- [x] T010 [US1] Write README.md — Features/Domains section: markdown table with 6 rows (Finance, Visiting, Language, People, Music, and a "More coming" row) each with a one-line domain description
- [x] T011 [US1] Write README.md — Screenshots section: embed `docs/assets/screenshot-finance.png`, `docs/assets/screenshot-language.png`, `docs/assets/screenshot-visiting.png` using `<img>` tags with descriptive `alt` text and "(illustrative)" note in each caption
- [ ] T012 [US1] Push branch to GitHub and preview rendered README.md on `github.com/gocreating/unihub/tree/012-refine-docs`; confirm logo, slogan, and overview paragraph are all visible without scrolling on a 1440px-wide browser window

**Checkpoint**: US1 complete — first-time visitor experience fully implemented. Verify independently before proceeding.

---

## Phase 4: User Story 2 — New Developer Gets Up and Running (Priority: P2)

**Goal**: Add a Getting Started section to README.md that lets a developer go from zero to a running local instance using only the documented steps.

**Independent Test**: Follow only the README Getting Started steps on a fresh terminal session; confirm the app starts at `http://localhost:5173` within 15 minutes.

### Implementation for User Story 2

- [x] T013 [US2] Write README.md — Getting Started › Prerequisites subsection: bulleted list of Docker (any recent version), Docker Compose (v2+), and Git — with a note that no other tooling is required (Docker handles the rest)
- [x] T014 [US2] Write README.md — Getting Started › Run Locally subsection: numbered steps — (1) `git clone`, (2) `cd unihub`, (3) `docker compose -f apps/unihub/docker-compose.local.yml up`, followed by access URLs (`http://localhost:3001` for the app, `http://localhost:8001/api/docs/` for API docs)
- [x] T015 [US2] Write README.md — Getting Started › Troubleshooting subsection: two entries — (1) "Port already in use" → change ports in `docker-compose.local.yml`, (2) "Docker services not starting" → ensure Docker has 2 GB+ memory
- [x] T016 [US2] Write README.md — Contributing and License footer sections: one-sentence Contributing note pointing to GitHub issues + a License section linking to `LICENSE` file
- [ ] T017 [US2] Follow the Getting Started steps end-to-end on local machine in a clean terminal; confirm app starts within 15 minutes; fix any instruction that is unclear or incorrect

**Checkpoint**: US2 complete — new developer onboarding path verified end-to-end.

---

## Phase 5: User Story 3 — GitHub Browser Sees Trust Signals at a Glance (Priority: P2)

**Goal**: Verify that all three README badges display accurate, live-sourced data on GitHub; confirm the logo is visible.

**Independent Test**: View the rendered README on GitHub.com and confirm: CI badge shows current pipeline status, release badge shows a version, license badge shows "MIT" — all without any manual value in the markdown.

### Implementation for User Story 3

- [x] T018 [P] [US3] Verify CI badge resolves: open `https://github.com/gocreating/unihub/actions/workflows/ci.yml/badge.svg` in a browser and confirm it returns a valid SVG badge image (not a 404)
- [x] T019 [P] [US3] Verify release badge: check if any release/tag exists on the repo (`gh release list --repo gocreating/unihub`); latest release is `v2026.06.03.2` — badge will display correctly
- [ ] T020 [US3] Verify license badge resolves after LICENSE is committed: open `https://img.shields.io/github/license/gocreating/unihub` in browser and confirm it returns "MIT"
- [ ] T021 [US3] View the final rendered README on `github.com/gocreating/unihub/tree/012-refine-docs`; confirm all three badges display with valid data and the logo renders correctly alongside the project name

**Checkpoint**: US3 complete — all trust signals verified as live-sourced.

---

## Phase 6: User Story 4 — Contributor Understands Current Project Conventions (Priority: P3)

**Goal**: Correct CLAUDE.md so every claim it makes about the codebase is accurate and every instruction works against the current repository state.

**Independent Test**: Read CLAUDE.md top-to-bottom and run or verify each listed command, path, and instruction against the current repository — zero stale references.

### Implementation for User Story 4

- [x] T022 [P] [US4] Audit CLAUDE.md directory structure claims: for each path listed under "Core Architecture" and "Backend Structure", run `ls` or `find` to confirm the path exists under `apps/unihub/backend/` and `apps/unihub/frontend/src/`; record any mismatches
- [x] T023 [P] [US4] Audit CLAUDE.md Active Technologies versions: compare listed versions of TypeScript, React, Ant Design, Pro Components, TanStack Query, React Router, Vite, Python, Django, DRF, PostgreSQL against `apps/unihub/frontend/package.json` and `apps/unihub/backend/pyproject.toml`; record any mismatches — all versions accurate
- [x] T024 [US4] Audit CLAUDE.md "Adding a New Domain" steps: compare the listed 5-step sequence against the constitution's Domain Addition Protocol (6-step); correct CLAUDE.md to match the constitution's authoritative sequence
- [x] T025 [US4] Audit CLAUDE.md service layer files listing (`src/services/unihub-backend/`): compare against actual files under `apps/unihub/frontend/src/services/`; add missing files, remove phantom ones
- [x] T026 [US4] Apply all corrections found in T022–T025 to `CLAUDE.md`: update stale paths, fix version numbers, correct domain list, align new-domain steps with constitution
- [x] T027 [US4] Update CLAUDE.md — Active Feature section: upon merge this should be cleared; for now update to reflect `012-refine-docs` (already done in planning); add note in the spec to clear this section on merge
- [x] T028 [US4] Final read-through of corrected CLAUDE.md: confirm every `apps/unihub/` path is real, every tool command runs, and no instruction contradicts the constitution

**Checkpoint**: US4 complete — CLAUDE.md is fully accurate and contributor-ready.

---

## Phase 7: Polish & Final Review

**Purpose**: Cross-cutting verification that all deliverables are clean and consistent before merge.

- [x] T029 [P] Run `git status` and `git diff --cached` to confirm no temporary scripts, seed data, or staging artifacts were accidentally staged or committed — clean ✓
- [x] T030 [P] Confirm `docs/assets/` contains exactly: `logo.svg`, `screenshot-finance.png`, `screenshot-language.png`, `screenshot-visiting.png` — note: logo.svg present; screenshots pending manual capture (T005–T007)
- [x] T031 Review complete README.md top-to-bottom for section order against FR-010: logo → slogan → badges → overview → feature list → screenshots → getting started; confirmed and fixed
- [x] T032 Spot-check README.md tone: confirmed — overview and domains use non-technical language; Getting Started is technical-but-clear

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — blocks screenshot capture (T005–T007) and badge verification (T020)
- **US1 (Phase 3)**: Depends on Phase 2 (local app running for screenshots)
- **US2 (Phase 4)**: Depends on US1 (writes to the same README.md, extends it with Getting Started)
- **US3 (Phase 5)**: Depends on Phase 2 (LICENSE committed) and US1 (badge row written in T008)
- **US4 (Phase 6)**: Independent of US1–US3 — can start after Phase 2
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only — no other story dependencies
- **US2 (P2)**: Depends on US1 (writes to README.md after US1 sections exist)
- **US3 (P2)**: Depends on Phase 2 + US1 badge row; can partially overlap with US2
- **US4 (P3)**: Fully independent from US1–US3 — can start after Phase 2 checkpoint

### Parallel Opportunities Within Phases

- T002 and T003 (Phase 2): Fully parallel
- T005, T006, T007 (Phase 3 screenshots): Parallel — different pages
- T008–T011 (Phase 3 README sections): Sequential — same file, build top to bottom
- T018 and T019 (Phase 5 badge checks): Parallel — different badge URLs
- T022 and T023 (Phase 6 audits): Parallel — different sections of CLAUDE.md

---

## Parallel Example: User Story 1 Screenshot Capture

```
# After T003 (local app running), launch these three in parallel:
T005: Stage Finance mock data + capture docs/assets/screenshot-finance.png
T006: Stage Language mock data + capture docs/assets/screenshot-language.png
T007: Stage Visiting mock data  + capture docs/assets/screenshot-visiting.png

# Then once all three complete:
T011: Write README.md Screenshots section embedding all three images
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T003)
3. Complete Phase 3: User Story 1 (T004–T012)
4. **STOP and VALIDATE**: Preview README on GitHub — first-time visitor test passes
5. Ship US1 as the minimum viable improvement

### Incremental Delivery

1. Phase 1 + Phase 2 → foundation ready
2. US1 (Phase 3) → visual README header complete → preview and validate
3. US2 (Phase 4) → Getting Started added → validate end-to-end setup
4. US3 (Phase 5) → badge verification → trust signals confirmed
5. US4 (Phase 6, can overlap US2/US3) → CLAUDE.md corrected
6. Polish (Phase 7) → final pre-merge check

### Solo Developer Notes

- US4 (CLAUDE.md) can be worked in parallel with US2/US3 since it's a different file
- Screenshots (T005–T007) are logically parallel but practically sequential on a single machine — do them back-to-back in one sitting while the app is running
- Commit after each phase completes to preserve progress

---

## Notes

- `[P]` tasks = independent of other in-progress tasks in the same phase
- `[USN]` maps each task to its user story for traceability
- No tests generated — this is a documentation feature; acceptance is visual verification on GitHub.com
- Temporary staging scripts/seed data MUST NOT appear in `git status` at Phase 7
- CLAUDE.md Active Feature section should be cleared (not pointing to `012-refine-docs`) in the final commit on this branch, or as the first commit on the next feature branch after merge
