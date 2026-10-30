# AGENTS.md

## Runewire

This project is managed in Runewire (project slug: unnamed-video-editor).
Use the Runewire MCP tools (get_task, list_tasks, update_task,
create_task_comment) for all task context — do not call
the REST API or GitHub directly for task data.

The Runewire MCP config in this repo holds a personal API key. It is
gitignored and must never be committed.

Workflow:
1. Read the task with get_task.
2. Move it to doing with update_task before implementation.
3. Create a git worktree for the task, branched off main, inside
   `.worktrees/` in this repo (gitignored), e.g.
   `git worktree add .worktrees/<taskId>-<slug> -b <taskId>-<slug> main`.
   Do all work in that worktree, never directly on main.
4. Implement and verify the change.
5. Merge the latest main into your branch, then open a PR against main
   referencing the task (Refs #<taskId>) with manual test notes, or post
   the test plan with create_task_comment.
6. Present evidence of the change in the thread (screenshots or other
   pictures when it applies) and move the task to qa with update_task.
7. Wait until the user says "merge". Do not merge before that.
8. When told to merge: merge the latest main into your branch again,
   then merge the PR.
9. After merging, delete the worktree (`git worktree remove`) and its
   local branch, and move the task to done with update_task.
