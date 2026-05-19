---
name: git:commit-and-push
description: 'Execute the /git:commit workflow (conventional commit message analysis, intelligent staging, and message generation), then push the resulting commit to the remote tracking branch. Use when the user asks to commit and push, or mentions "/commit-and-push".'
license: MIT
allowed-tools: Bash
---

# Git Commit and Push

Run the full `/git:commit` workflow, then push the commit to the remote.

## Workflow

### 1. Commit

Follow the entire `/git:commit` workflow exactly as documented in [commit.md](commit.md):

1. Analyze diff (`git diff --staged`, `git diff`, `git status --porcelain`).
2. Stage files if needed (never stage secrets like `.env`, credentials, private keys).
3. Generate a Conventional Commits message (type, optional scope, imperative description <72 chars).
4. Execute the commit (single-line or HEREDOC multi-line as appropriate).

If there is nothing to commit, stop and report that to the user — do not push an empty state.

### 2. Push

After the commit succeeds:

```bash
# Determine current branch
git rev-parse --abbrev-ref HEAD

# Push to the existing upstream
git push

# If the branch has no upstream yet, set it on the first push
git push -u origin <current-branch>
```

If `git push` fails because the branch has no upstream, retry with `git push -u origin <current-branch>`. Do not invent other remotes — use `origin` unless the repo clearly uses a different default.

### 3. Report

Report back to the user:

- The commit hash and subject line
- The branch the commit was pushed to
- Any warnings from the push (e.g. new upstream set, hooks output)

## Git Safety Protocol

All safety rules from `/git:commit` apply, plus:

- NEVER force push (`--force`, `--force-with-lease`) unless the user explicitly requests it
- NEVER push to `main` / `master` directly unless the user explicitly requests it — if the current branch is `main`/`master`, stop and confirm with the user before pushing
- NEVER skip hooks (`--no-verify`) unless the user explicitly asks
- If the push is rejected (non-fast-forward, hook failure, etc.), stop and report the error — do not retry with destructive flags
