# Feature Specification: Refine Repository Documentation

**Feature Branch**: `012-refine-docs`

**Created**: 2026-06-03

**Status**: Draft

**Input**: GitHub Issue #30 — Refine docs: update README.md, CLAUDE.md, and other docs; add icon, slogans, screenshots with mock data, and badges to make the repo look polished and welcoming like popular open-source projects.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Visitor Gets the Point Fast (Priority: P1)

A developer or curious user discovers the Unihub repo on GitHub via search or a link. Within seconds of landing on the repo page, they can tell exactly what Unihub is, why it exists, and whether it's relevant to them — without clicking any links or scrolling past the fold.

**Why this priority**: First impressions on GitHub happen in under 10 seconds. A compelling, scannable README header is the single highest-leverage change: it either hooks the visitor or loses them. Everything else in the repo depends on people deciding to read further.

**Independent Test**: Can be fully tested by opening the repo home page on GitHub and verifying a new visitor can answer "what is this?" and "why would I want it?" from the above-the-fold content alone.

**Acceptance Scenarios**:

1. **Given** a user lands on the GitHub repo page, **When** they look at the README without scrolling, **Then** they see a project logo/icon, a one-line slogan that describes the product's value, and a brief overview paragraph.
2. **Given** a user reads the README header section, **When** they finish the first screen of content, **Then** they understand Unihub is a personal all-in-one life dashboard and know which domains it covers (finance, geography, travel, health, etc.).
3. **Given** a user views the README, **When** they look for visual proof of the product, **Then** they see at least 2 screenshots with realistic (mock) data showing the dashboard in use.

---

### User Story 2 - New Developer Gets Up and Running (Priority: P2)

A developer who wants to self-host or contribute to Unihub can follow the README to get the project running locally without needing to ask questions or dig through source files.

**Why this priority**: A fast onboarding path converts curious visitors into active contributors or users. Without clear setup instructions, even interested developers give up.

**Independent Test**: Can be fully tested by following only the README instructions on a clean machine and verifying the app starts successfully.

**Acceptance Scenarios**:

1. **Given** a developer clones the repo, **When** they follow the "Getting Started" section step by step, **Then** the application is running locally within 15 minutes.
2. **Given** a developer reads the README prerequisites, **When** they check the listed requirements, **Then** all prerequisite tools are clearly listed with version expectations.
3. **Given** a developer encounters an error during setup, **When** they re-read the relevant README section, **Then** the instructions include common troubleshooting tips or pointers to where help can be found.

---

### User Story 3 - GitHub Browser Sees Trust Signals at a Glance (Priority: P2)

A GitHub user browsing repositories sees Unihub in search results or a link share. The repo's badges, icon, and description give immediate signals of project health and maturity.

**Why this priority**: Badges convey CI status, license, and version without any reading — they are the fastest possible trust signal. A repo without them looks abandoned or unfinished.

**Independent Test**: Can be fully tested by viewing the rendered README on GitHub and confirming all badges display valid, current information from live sources.

**Acceptance Scenarios**:

1. **Given** a user views the README on GitHub, **When** they look at the badge row, **Then** they see badges for CI/CD pipeline status, software license, and current release version — all showing accurate, up-to-date values.
2. **Given** the CI pipeline runs, **When** it completes (pass or fail), **Then** the corresponding README badge automatically reflects the current status without manual updates.
3. **Given** a user views the README, **When** they look for the project icon, **Then** a logo or icon is displayed alongside the project name.

---

### User Story 4 - Contributor Understands Current Project Conventions (Priority: P3)

An existing developer returning to the project, or a new contributor, reads CLAUDE.md and other developer docs to understand the current conventions, architecture decisions, and active work — and finds everything accurate.

**Why this priority**: Developer docs matter only once someone is already committed to contributing. Important for long-term project health, but secondary to the public-facing docs that drive discovery.

**Independent Test**: Can be fully tested by reading CLAUDE.md and verifying every claim it makes (stack, tooling, directory structure, active feature) matches the actual current state of the repository.

**Acceptance Scenarios**:

1. **Given** a contributor reads CLAUDE.md, **When** they follow any instruction in it, **Then** the instruction works as written against the current codebase with no stale references.
2. **Given** the project has evolved since CLAUDE.md was first written, **When** a contributor reads the file, **Then** the file reflects the current directory structure, active domains, and tooling.
3. **Given** a contributor reads the "Active Feature" section of CLAUDE.md, **When** they look at the listed branch and plan link, **Then** the information is current and the linked spec file exists.

---

### Edge Cases

- If the CI badge service is temporarily unavailable, a broken image should degrade gracefully (not break the README layout).
- Screenshots show mock data — captions should note "illustrative" to prevent confusion as the UI evolves.
- If CLAUDE.md references a spec or branch that has since been merged and closed, the "Active Feature" section must be cleared to avoid pointing to stale work.
- If no project license file exists yet, adding a license badge should be deferred until a license is chosen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The README MUST display a project icon/logo in the header section alongside the project name. The logo MUST be a committed image file referenced via a relative path in the README (not an external URL or emoji placeholder).
- **FR-002**: The README MUST include a single-sentence slogan that communicates the core value of Unihub (what it is, who it's for, why it matters).
- **FR-003**: The README MUST include a "Getting Started" section that guides a new user from clone to running application using only the documented steps.
- **FR-004**: The README MUST include at least 3 screenshots of the application populated with realistic mock data, covering distinct dashboard domains. Temporary scripts or seed data used solely to stage the app for screenshot capture are permitted and must not be committed to the codebase.
- **FR-005**: The README MUST include a badge row showing CI/CD pipeline status, software license, and current release version.
- **FR-006**: All badges MUST be dynamically sourced (CI system, release tags, license file) — no manually maintained badge values.
- **FR-007**: The README MUST include a "Features" section listing all supported life domains (finance, geography, etc.) with a one-line description each.
- **FR-008**: CLAUDE.md MUST be reviewed and corrected so every described directory, tool, command, and convention matches the current codebase state.
- **FR-009**: The "Active Feature" section in CLAUDE.md MUST reflect the current in-progress work at the time of this feature's completion, or be removed if no feature is actively in progress.
- **FR-010**: The overall README structure MUST follow conventions of popular open-source projects: project logo, slogan, badges, brief overview, feature list, screenshots, and getting-started instructions — in that order.

### Key Entities

- **README.md**: The public-facing project introduction document displayed by default on the GitHub repository page.
- **CLAUDE.md**: The developer guidelines document consumed by human contributors and AI coding assistants.
- **Badge**: A dynamic status indicator linked to a live data source (CI, license, version registry) that auto-updates without manual intervention.
- **Screenshot**: A static image of the running application populated with mock (non-personal) data, used to demonstrate features visually.
- **Project Icon/Logo**: A visual identity image file committed to the repository and referenced from the README header via a relative path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can identify the project's purpose and primary value within 30 seconds of landing on the GitHub repo page without scrolling or clicking any links.
- **SC-002**: A developer following only the README "Getting Started" instructions on a clean machine can have the application running locally within 15 minutes.
- **SC-003**: All README badges display accurate, live-sourced data — zero manually maintained badge values at the time of merge.
- **SC-004**: The README includes a minimum of 3 screenshots, each covering a distinct dashboard domain, each containing mock data rather than real personal data.
- **SC-005**: Every command, path, and tool reference in CLAUDE.md executes successfully against the current codebase — zero stale references remain after the update.
- **SC-006**: The README contains all six structural elements expected by popular open-source repo conventions: logo, slogan, badges, overview, feature list, screenshots, and getting-started guide.

## Clarifications

### Session 2026-06-03

- Q: Are screenshots in scope given the "doc text and wording only" constraint? → A: Yes — screenshots are documentation assets (image files linked in markdown). Temporary code or scripts used solely to stage mock data for capture are permitted; no permanent system code changes are introduced.
- Q: How should the project icon/logo be included in the README? → A: A logo image file is committed to the repository as a documentation asset and referenced directly from the README using a relative path (same approach as screenshots).

## Assumptions

- A project icon/logo does not yet exist and needs to be created or sourced as part of this work. It will be committed to the repository as a documentation asset (e.g., under `docs/` or similar) and referenced from the README via a relative path.
- Mock data for screenshots will be staged in the running application using temporary scripts or seed data; these are not committed to the codebase.
- No permanent changes to application source code, configuration, or behavior are permitted under this feature — all deliverables are documentation assets (text files and images).
- The CI/CD pipeline (from feature #010) is already operational and can be linked to via a badge.
- A software license file exists or will be added to the repo; the choice of license is outside the scope of this feature.
- Screenshots will be captured from the local development environment, not a deployed production instance.
- CLAUDE.md changes are limited to accuracy corrections — no new architectural decisions are introduced under this feature.
- The "Active Feature" section in CLAUDE.md will be updated to reflect feature #012 during this work, then cleared upon merge.
