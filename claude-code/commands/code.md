---
description: Delegate a coding task to Claude Code CLI
argument-hint: Describe the task (e.g. "add error handling to auth.ts")
allowed-tools: Bash(claude:*)
---

# Claude Code Delegation

Your job is to run Claude Code CLI in headless mode with the user's task and report the results. Do not attempt the task yourself.

**Task:** $ARGUMENTS

## Steps

1. Determine the working directory. Use `/home/claw/workspace` unless the user specified a different path in the task.

2. Run Claude Code with:
   ```
   claude -p "<task>" --dangerously-skip-permissions
   ```
   Pass the task exactly as the user wrote it. Handle any special characters by quoting properly.

3. Report the full output back to the user. Include:
   - What Claude Code did
   - Which files were created or modified (if any)
   - Any errors or warnings
   - The final result or output

**Do not paraphrase or abbreviate the output.** Relay it faithfully so the user can see exactly what Claude Code did.
