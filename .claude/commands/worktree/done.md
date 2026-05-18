---
description: Merge worktree branch and clean up
---

Run the worktree completion workflow from the main directory: select and merge a worktree branch into main, then clean up the worktree.

**Use case**: When you have finished development in a worktree and want to merge changes back into the main branch and clean up.

Execute the following workflow:

1. **Environment check**:

   - Confirm currently in the main worktree directory
   - Check that the working tree is clean
   - Verify on the main branch

2. **Discover worktree branches**:

   - Scan all existing worktrees
   - Check the status and commits of each worktree branch
   - List mergeable worktree branches (those with commits and a clean working directory)

3. **Interactive branch selection**:

   - Display the worktree branch list, including:
     - Branch name
     - Latest commit message
     - Commit timestamp
     - Worktree path
   - Let the user select a branch to merge
   - Confirm the merge operation

4. **Execute merge**:

   - Update the main branch: `git pull origin main`
   - Merge the selected worktree branch into main
   - Push the merged main branch to the remote
   - Run quality checks to ensure a successful merge

5. **Automatic cleanup**:
   - Remove the merged worktree directory
   - Delete the local worktree branch
   - Display cleanup results

**Usage example**:

```bash
# Run from the main worktree directory
cd /Users/jackle/workspace/Fortuna
/worktree:done
```

**Output example**:

```
Discovered the following mergeable worktree branches:

1. feature/strapi-typescript-optimization
   Path: /Users/jackle/workspace/fortuna-feature-strapi-typescript-optimization
   Commit: feat(typescript): complete Strapi v5 TypeScript optimization and shared package build fix
   Date: 2025-07-19 23:41:23

2. feature/workflow-engine-v2
   Path: /Users/jackle/workspace/fortuna-feature-workflow-engine-v2
   Commit: feat(workflow): implement workflow execution engine core
   Date: 2025-07-19 15:30:45

Select a branch to merge (enter number):
```

**Safety checks**:

- Only show worktrees with commits and a clean working directory
- Confirm the main branch is up to date before merging
- Provide merge preview and confirmation steps

**Notes**:

- Must be run from the main worktree directory (not a secondary worktree)
- Ensure the selected worktree has all development work committed
- The worktree will be automatically cleaned up after merging — make sure all important changes are committed
