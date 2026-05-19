---
description: "Create or update a PR with rich description and screenshots"
---

## Goal

Create or update a pull request from the current branch into a target branch, with a title and description that reflect all changes since the branch diverged. If an open PR already exists for this branch, update its title and body with fresh content instead of creating a duplicate. Include screenshots when possible.

## Input

$ARGUMENTS

Optional: a target branch name (e.g. `main`, `develop`). If not provided, auto-detect from the branch's divergence point (see below).

## Workflow

### 1. Determine context

```bash
BRANCH=$(git branch --show-current)
OWNER_REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
```

Determine the target branch:
- If the user provided one in the arguments, use it.
- Otherwise, auto-detect the branch this one diverged from:

  ```bash
  # Find all local branches whose tip is an ancestor of the current branch's
  # merge-base, i.e. branches the current branch was likely created from.
  # Exclude the current branch itself.
  git branch --contains $(git merge-base HEAD main) --no-contains HEAD --format='%(refname:short)' | grep -v "^${BRANCH}$"
  ```

  More practically, check which branches share a merge-base with HEAD and pick the closest ancestor:

  ```bash
  # For each local branch (excluding current), compute merge-base with HEAD
  # and pick the branch whose merge-base is closest (fewest commits behind HEAD).
  for ref in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v "^${BRANCH}$"); do
    mb=$(git merge-base HEAD "$ref" 2>/dev/null) || continue
    ahead=$(git rev-list --count "${mb}..HEAD")
    echo "${ahead} ${ref} ${mb}"
  done | sort -n | head -20
  ```

  Apply these rules to select the target:
  1. **Exactly one candidate** (excluding `main`/`master`): use it.
  2. **Two candidates** where one is `main`/`master` and one is not: use the non-`main`/`master` one (it's likely an integration branch the feature was based on).
  3. **Only `main`/`master`**: use it (the branch was created directly from main).
  4. **More than two candidates** (after filtering obvious non-parents): **stop and ask the user** which target branch to use, listing the candidates.

  The "closest ancestor" heuristic (fewest commits ahead) helps rank candidates — the branch with the smallest `ahead` count is most likely the true parent.

Find the merge base (branching point):
```bash
MERGE_BASE=$(git merge-base HEAD <target-branch>)
```

### 2. Analyze all changes since branch diverged

Collect the full picture of what this branch does:

```bash
# All commits since branching out
git log --oneline ${MERGE_BASE}..HEAD

# Full diff for understanding scope
git diff ${MERGE_BASE}..HEAD --stat
git diff ${MERGE_BASE}..HEAD
```

Read the commit messages, changed files, and actual diffs to understand:
- What features were added
- What bugs were fixed
- What was refactored
- Which apps were affected

#### Detect merged feature branches

Check if the branch contains merge commits from other feature branches:

```bash
git log --merges --oneline ${MERGE_BASE}..HEAD
```

For each merge commit found:
1. Extract the merged branch name from the merge commit message (e.g., `Merge branch '086-feature-name'` or `Merge pull request #NNN from owner/branch`).
2. If a PR number is referenced, fetch its title and body using `gh pr view <number> --json title,body,number` for reuse in the description.
3. Check for screenshots from that merged branch at `apps/<app_name>/docs/screenshots/<merged-branch>/`. These screenshots should be **reused** in the current PR description alongside any screenshots from the current branch.

This ensures that when a branch accumulates work from multiple merged feature PRs, the final PR to main provides a complete picture — summarizing each merged PR and showing all relevant screenshots.

### 3. Determine the app context

Identify which app(s) are affected based on the changed file paths (e.g., `apps/ov-hub/`, `apps/ov-fleet/`). This determines:
- Where to look for screenshots: `apps/<app_name>/docs/screenshots/<branch>/`
- Which e2e infrastructure to use if screenshots need to be generated

### 4. Gather screenshots

Use the branch name stripped of any path prefix for the directory (e.g., `feature/088-foo` → `088-foo`).

#### 4a. Check if existing screenshots are still fresh

Check for existing screenshots at `apps/<app_name>/docs/screenshots/<branch>/`.

If screenshots exist, determine whether they are still up-to-date by comparing the **last screenshot commit** against **the latest UI-affecting commit**:

```bash
# When were screenshots last committed?
SCREENSHOT_COMMIT=$(git log -1 --format="%H" -- "apps/<app_name>/docs/screenshots/<branch>/")

# Were any frontend/UI files changed after that commit?
git log --oneline ${SCREENSHOT_COMMIT}..HEAD -- "apps/<app_name>/frontend/src/" "apps/<app_name>/src/"
```

- **No UI changes since last screenshot commit** → screenshots are fresh, use them as-is.
- **UI changes exist after the screenshot commit** → screenshots are stale, regenerate (step 4b).
- **No screenshots exist at all** → generate them (step 4b).

#### 4b. Regenerate screenshots (only when needed)

Only run this step if 4a determined screenshots are missing or stale.

Analyze the changes from step 2 to determine which pages/features need screenshots. Consider:
- Which pages were modified? (look at changed routes, components, pages)
- What new UI was added? (new buttons, modals, panels, columns, etc.)
- What visual changes were made? (layout, styling, icons, responsive behavior)

Then generate screenshots using the following sources **in priority order**. Try each source in sequence; move to the next only if the previous source is not available or doesn't cover the needed scenarios.

##### Source 1: Mock app (Playwright with API mocks) — preferred

Use Playwright e2e tests with mocked API responses. This is the fastest, most reproducible approach and should cover most scenarios.

**For ov-fleet** (from `apps/ov-fleet/frontend/`):
1. Write or update `e2e/take-screenshots.spec.ts` to cover all relevant scenarios for features on this branch. Use API mocks from `e2e/helpers/api-mocks.ts` and the `screenshotPath()` helper from `e2e/helpers/screenshots.ts`.
2. Each test should:
   - Set up route mocks for all required API endpoints
   - Navigate to the relevant page
   - Wait for content to render (`expect(locator).toBeVisible()`, NOT just `waitForTimeout`)
   - Interact with the UI if needed (open modals, click buttons, expand panels)
   - Take a screenshot with a descriptive filename (e.g., `01-camera-list-overview.png`, `02-filter-builder.png`)
3. Run: `pnpm exec playwright test e2e/take-screenshots.spec.ts`
4. Screenshots are saved to `docs/screenshots/<branch>/` via the `screenshotPath()` helper.

**For ov-hub** (from `apps/ov-hub/frontend/`):
1. Write or update an e2e spec file for screenshot capture with API mocks if available.
2. Save screenshots to `apps/ov-hub/docs/screenshots/<branch>/`.

##### Source 2: Real app (running dev servers)

If mock-based screenshots don't cover a scenario (e.g., complex backend-driven state, real data needed), capture from a running dev environment.

1. Ensure backend and frontend dev servers are running (e.g., `uv run ov-hub serve --port 8000` for ov-hub, or Django + frontend dev servers for ov-fleet).
2. Write Playwright tests that hit the real dev server instead of using API mocks.
3. Save screenshots to the same `docs/screenshots/<branch>/` directory.

**Never use Storybook.** Storybook renders components in isolation with artificial decorators and does not reflect actual app behavior, layout, or context. Always use the mock app or real dev server — even for edge-case states or design variants.

**Screenshot best practices:**
- Number screenshots with zero-padded prefixes for ordering: `01-`, `02-`, `03-`, etc.
- Use descriptive filenames that explain what is shown: `01-camera-list-overview.png`, not `screenshot1.png`
- Capture both default state AND interactive states (e.g., open modals, active filters, expanded panels)
- For responsive features, capture at multiple viewport sizes (desktop 1440x900, tablet 768x720, mobile 375x812)
- Always wait for data to load before capturing — use `expect(...).toBeVisible({ timeout: 15_000 })` on key elements
- Add a short `waitForTimeout(1000)` AFTER content is visible to let animations settle

#### 4c. Verify screenshots

After generating (or when reusing existing ones), **read every screenshot file** to visually verify:
- Real content is shown (not loading spinners, blank pages, or error states)
- Interactive states were captured correctly (modals open, dropdowns visible, etc.)

If any screenshot looks wrong:
1. Check that dev servers are running and accessible
2. Check that API mocks return realistic data
3. Increase wait timeouts
4. Retry the specific screenshot spec

#### 4d. Collect merged branch screenshots

For each merged feature branch detected in step 2, check `apps/<app_name>/docs/screenshots/<merged-branch>/`. These screenshots were generated when the feature branch was active, and since those features are already merged and frozen, they can be reused as-is. Collect them for inclusion in the PR description, grouped by the feature they belong to (not by branch name).

### 5. Commit and push screenshots

If new screenshots were generated:

```bash
git add apps/<app_name>/docs/screenshots/<branch>/
git commit -m "docs(<app_name>): add screenshots for ${BRANCH}"
```

Push the branch (with upstream tracking if needed):
```bash
git push -u origin ${BRANCH}
```

### 6. Draft PR title and description

**Title:** Short (under 70 characters), reflecting the main purpose of the branch. Follow the pattern: `feat(<app>): <description>` or `fix(<app>): <description>`.

**Description:** Build the body using this structure:

```markdown
## Summary

<1-3 bullet points summarizing what this PR does, derived from the commit history and diffs>

## Changes

<Grouped list of changes by category: features, fixes, refactors, etc. Reference specific commits or files where helpful.>

### Merged PRs

<If the branch contains merge commits from other feature branches, list each merged PR with a brief summary. Link to the original PR when a number is available.>

- **#<number> — <PR title>**: <1-sentence summary of what it did>
- ...

<Omit this subsection entirely if there are no merged feature branches.>

## Screenshots

<Group screenshots by **feature**, not by source or branch. When the same feature has screenshots from multiple sources (mock app, real app, Storybook) or branches (current + merged), place them together under one feature heading. Order features logically (e.g., main feature first, then supporting changes). Within each feature group, order screenshots to tell a story: overview → details → interactive states.>

### <Feature name>

![Description](https://github.com/${OWNER_REPO}/blob/${BRANCH}/apps/<app_name>/docs/screenshots/<branch-or-merged-branch>/<filename>.png?raw=true)

![Description](https://github.com/${OWNER_REPO}/blob/${BRANCH}/apps/<app_name>/docs/screenshots/<branch-or-merged-branch>/<filename>.png?raw=true)

## Test plan

- [ ] <Testing checklist items>

<If merging into main/master and no version bump was detected, include the following warning>

> ⚠️ **No version bump detected.** This PR targets `main` but no version change was found in `pyproject.toml` or `package.json`. Please ensure the version is bumped before merging (CalVer: `vYYYY.MM.DD.N`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

#### Version bump check (main/master target only)

When the target branch is `main` or `master`, check whether the branch includes a version bump. Look for version changes in:
- `pyproject.toml` (Python apps — look for `version = "..."` changes)
- `package.json` (frontend apps — look for `"version": "..."` changes)

```bash
git diff ${MERGE_BASE}..HEAD -- '**/pyproject.toml' '**/package.json' | grep -E '^\+.*version'
```

If no version bump is found in the diff, add the warning banner shown above in the PR description. This project uses CalVer (`vYYYY.MM.DD.N`).

**Critical: Image URL format.** Always use `?raw=true` suffix on blob URLs. Without it, GitHub renders a file preview page instead of the image, showing as a broken 404-like link. The correct format is:

```
https://github.com/${OWNER_REPO}/blob/${BRANCH}/path/to/image.png?raw=true
```

### 7. Create or update the PR

Check for an existing open PR on this branch:

```bash
gh pr list --head <branch> --state all --json number,state,title,url
```

- **Open PR found**: Update it with the freshly drafted content:
  ```bash
  gh pr edit <number> --title "<title>" --body "$(cat <<'EOF'
  <full PR body with screenshots>
  EOF
  )"
  ```
  Inform the user that the existing PR was updated.

- **No open PR** (only closed/merged or none at all): Create a new one:
  ```bash
  gh pr create --base <target-branch> --title "<title>" --body "$(cat <<'EOF'
  <full PR body with screenshots>
  EOF
  )"
  ```

### 8. Add labels, project, and assignee

After creating or updating the PR, apply metadata:

**Assignee:** Assign the PR to the current GitHub user (the person running this skill):
```bash
gh pr edit <number> --add-assignee "@me"
```

**Labels:** Infer relevant labels from the changes and add them. Use `gh label list --json name` to see available labels, then match based on:
- App affected (e.g., `ov-hub`, `ov-fleet`)
- Change type (e.g., `feature`, `bug`, `refactor`, `docs`)
- Any other labels that match the scope of changes

```bash
gh pr edit <number> --add-label "<label1>,<label2>"
```

**Project:** Check for available projects and add the PR if a relevant one exists:
```bash
gh project list --json title,number
```

If a matching project is found, add the PR to it. Skip silently if no projects exist or none are relevant.

Return the PR URL to the user.

## Rules

### Screenshots
- **Check freshness first** — compare the last screenshot commit against the latest UI-affecting commit. Only regenerate if UI files changed since the last screenshot commit, or if no screenshots exist.
- Screenshots from merged feature branches can be reused as-is (those features are frozen).
- Verify screenshots visually before including in the PR.
- Screenshots go in `apps/<app_name>/docs/screenshots/<branch-name>/` (branch name stripped of path prefixes like `feature/`).
- If multiple apps are affected, generate and include screenshots from each app.
- If no UI changes were made (e.g., backend-only change), skip the Screenshots section and note that in the description.
- **Never use Storybook for screenshots.** Always use the mock app (Source 1) or real dev server (Source 2). Storybook renders components in isolation and does not represent what ships.

### Images
- **Always use `?raw=true`** on image URLs in the PR body. This is non-negotiable — without it, images render as broken links.

### PR content
- Analyze ALL commits since the merge base, not just the latest commit.
- Title should be concise; put details in the description body.

### PR lifecycle
- Before creating, check for existing PRs on this branch with `gh pr list --head <branch> --state all --json number,state,title,url`. Branch names are often reused across features, and integration branches that collect multiple feature merges typically already have an open PR whose content becomes stale. If a PR exists:
  - **Open PR**: The content is likely stale (new features merged since it was created). **Update** the existing PR's title and body with the freshly drafted content using `gh pr edit <number> --title "<title>" --body "<body>"`. Inform the user that the existing PR was updated and provide the URL.
  - **Closed/Merged PR**: This is a reused branch name — proceed to create a new PR. The old PR is for a previous feature and is not a conflict.
- If the branch has no commits ahead of the target, inform the user instead of creating an empty PR.
- Never force-push or rewrite history.
