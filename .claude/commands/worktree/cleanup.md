
---
argument-hint: [target]
description: Smart cleanup of Git worktrees
---

Intelligently analyze and safely clean up Git worktrees, ensuring no important work is lost.

Argument format: `/worktree-cleanup [target]`

- `target`: Cleanup target (optional)
  - A specific worktree name (e.g. "story-1.4", "feature-dashboard")
  - If omitted: show cleanup suggestions without executing

Examples:

- `/worktree-cleanup` (analyze and suggest only)
- `/worktree-cleanup story-1.4` (clean up a specific worktree)

Execute the following cleanup workflow:

1. **Parse cleanup arguments**:

   - Analyze the cleanup target specified in `$ARGUMENTS`
   - Select the appropriate cleanup strategy based on the arguments
   - Set the safety check level

2. **Identify cleanup candidates**:
   Apply different detection strategies based on the arguments:

   - **Specific worktree**: directly clean up the specified target

3. **Risk assessment**:

   - Flag worktrees that require user confirmation
   - Check for completed branches with unpushed commits

4. **Execute cleanup**:

   - Provide cleanup suggestions and interactive options
   - Automatically back up important information to `.claude/worktree-backups/`
   - Safely remove worktrees using `git worktree remove`
   - Clean up the corresponding local branches

5. **Cleanup report**:
   - Show cleanup statistics (number removed, space freed)
   - Provide backup locations and restore instructions
   - Analyze performance improvements after cleanup

Provide detailed impact analysis and recovery options for each cleanup candidate.
