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
3. Implement and verify the change.
4. Open a PR referencing the task (Refs #<taskId>) with manual test notes,
   or post the test plan with create_task_comment.
5. Ensure the task reaches qa with update_task when finished.
