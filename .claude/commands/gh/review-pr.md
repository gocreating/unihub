---
description: "Review and address unresolved PR comments"
---

## Goal

Read **all** unresolved review sessions (not just the oldest) on a PR, analyze each comment, make changes if needed, fix any CI failures, commit, reply to each comment, and then refresh the PR description to reflect the new state.

## Input

$ARGUMENTS

The input should be a PR number or URL. If no input is provided, infer the PR from context: check if a PR was created earlier in this conversation, or use `gh pr view --json number` to find the PR for the current branch.

## Workflow

1. **Parse input**: Extract the PR number from the input (number or URL).

### Review loop (steps 2–7) — repeat until stable

Steps 2–7 form a loop. After pushing a commit, new bot reviews or CI runs may appear. The loop continues until there are no new unresolved threads and CI is green, or the maximum iteration count is reached.

**Track across iterations:** Keep a set of thread IDs and comment IDs that have already been processed. On each iteration, only act on threads/comments that are **new** since the last iteration. This prevents re-processing the same comments and re-committing the same fixes.

2. **Fetch all review threads**: Use `gh api` with GraphQL to get **every** review thread, not just individual comments:
   ```bash
   gh api graphql -f query='
     query($owner: String!, $repo: String!, $number: Int!) {
       repository(owner: $owner, name: $repo) {
         pullRequest(number: $number) {
           reviewThreads(first: 100) {
             nodes {
               id
               isResolved
               comments(first: 50) {
                 nodes {
                   id
                   databaseId
                   body
                   author { login }
                   path
                   line
                   startLine
                   diffHunk
                   createdAt
                 }
               }
             }
           }
         }
       }
     }' -f owner="{owner}" -f repo="{repo}" -F number={number}
   ```

3. **Filter to actionable threads**: Collect threads where `isResolved` is `false` **and** that have not been processed in a previous iteration. Within each thread, read **all** comments (the original review comment plus every reply) to understand the full conversation context before deciding on action.

4. **Process each new unresolved thread**:
   - Read the code context referenced by the thread (file path, line range, diff hunk).
   - Read the full comment chain to understand what was requested and any follow-up discussion.
   - Analyze whether a change is needed.
   - If a change is needed: make the edit.
   - If no change is needed: prepare an explanation of why.
   - If unsure: **ask the user** for guidance before proceeding.
   - Mark the thread as processed so it is skipped in future iterations.

5. **Check and fix CI failures**: Check the status of CI checks on the PR:
   ```bash
   gh pr checks {number}
   ```
   If any checks have failed:
   - Fetch the failed run logs to understand what went wrong:
     ```bash
     gh run view {run_id} --log-failed
     ```
   - Diagnose the root cause — common failures include lint errors, test failures, type errors, and build failures.
   - Fix the issues in the code. Apply the same skepticism as with bot comments: if a linter or test was intentionally configured a certain way, fix the code to satisfy it rather than disabling the check.
   - If a failure is unclear or seems environmental (flaky test, infra issue), **ask the user** before attempting a fix.

6. **Commit and push**: After processing all new threads and CI fixes, if any edits were made:
   ```bash
   git add <changed files>
   git commit -m "address PR review comments"
   git push
   ```

7. **Reply to comments**: For each processed thread in this iteration, reply to the **last** comment in the thread via `gh api`:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments/{last_comment_id}/replies -f body="<explanation>"
   ```
   - If a change was made: explain what was done and reference the commit.
   - If no change was made: explain why.

**Loop decision:** If a commit was pushed in step 6, wait briefly for new bot reviews and CI to trigger, then go back to step 2. If no edits were made (all new comments were declined and CI is green), exit the loop.

**Maximum iterations: 3.** If the loop has run 3 times and new comments are still appearing, stop and inform the user — further churn is unlikely to converge. The user can run the skill again manually if needed.

### Post-loop

8. **Refresh the PR** (cascade): Run the `gh:upsert-pr` skill only when **both** conditions are met:
   - At least one commit was pushed during the loop
   - The loop exited cleanly — no remaining unresolved threads and CI is green

   If the loop hit the max iteration limit with unresolved threads still remaining, do **not** run `gh:upsert-pr`. Instead, inform the user of what's still outstanding.

## Rules

- This skill is **stateless** across runs, but tracks processed thread IDs within a single run to avoid re-processing.
- Process **all** unresolved threads across **all** review sessions — do not stop after the first session or the oldest one.
- If unsure about a comment, ask the user instead of guessing.
- Process all new threads before committing (batch changes into one commit per iteration).
- Never force-push or rewrite history.
- The `gh:upsert-pr` cascade in step 8 only runs once, after the loop exits, and only if commits were pushed.
- CI fixes and review comment fixes are batched into the same commit when possible. If they touch unrelated files, separate commits are acceptable.
- **Maximum 3 loop iterations.** If new comments keep appearing after 3 rounds, stop and inform the user rather than churning indefinitely.

### Handling bot reviewer comments (Copilot, etc.)

Bot reviewers like Copilot **do not understand business logic, specs, or the intent behind merged features**. Default stance: **skepticism, not compliance.**

- **Trust intentional behavior over bot suggestions.** Features in this branch were built deliberately according to business needs. Merged PRs represent validated, intentional work. Do not undo or alter them because a bot flags a style preference, suggests a rename, or questions a design choice.
- **Before acting on a bot comment**, verify whether the existing behavior was intentional: check commit history, specs, CLAUDE.md, and the conversation context. If it was intentional, reply explaining why no change is needed.
- **Only apply bot suggestions for genuine bugs** — e.g., an actual IndexError, null dereference, or security vulnerability with a concrete exploit path. Style nitpicks, "consider renaming", "this could be simplified", or "add error handling for X" from bots should be declined with a brief explanation.
- **When unsure**, ask the user — do not make the change speculatively.
