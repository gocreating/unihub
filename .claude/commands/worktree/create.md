
---
argument-hint: [name]
description: Create a new Git worktree
---

Create a new Git worktree based on the provided arguments and automatically set up a complete development environment.

Argument format: `/worktree-create [name]`

- `name`: Feature description or identifier (required, AI will automatically determine the type based on content)

Examples:

- `/worktree-create user-dashboard` -> feature/user-dashboard
- `/worktree-create user dashboard redesign` -> feature/user-dashboard-redesign
- `/worktree-create permission validation fix` -> hotfix/permission-validation-fix (AI detects as a fix)
- `/worktree-create cache performance experiment` -> experiment/cache-performance-experiment (AI detects as an experiment)
- `/worktree-create story-1.5-workflow-integration` -> story/1.5-workflow-integration (AI detects as a story)

Execute the following workflow:

1. **Parse and normalize arguments**:

   - Analyze the name parameter from `$ARGUMENTS`
   - AI automatically determines the type based on content:
     - Contains "fix", "bug", "patch" -> hotfix
     - Contains "experiment", "test", "spike" -> experiment
     - Contains "story" or a numeric ID -> story
     - All other cases -> feature (default)
   - **Name normalization**: Convert the task name into a branch-safe format
     - Use clear, descriptive English words
     - Convert to kebab-case (lowercase, hyphen-separated)
     - Avoid abbreviations, ensure the name is descriptive
     - Follow the 4-6 word naming convention

2. **Create the worktree**:

   - Create a new worktree using `git worktree add`
   - Ensure directory and branch naming follow project conventions

3. **Summary report**:
   Provide a creation summary including:
   - Original input -> normalized branch name
   - Worktree path and branch name
   - Next steps

Perform all necessary safety checks to ensure no conflicts with existing worktrees.
