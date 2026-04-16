# Claude Code Plugin

Delegates coding tasks to the Claude Code CLI, running it in headless mode and relaying the results.

## Command: `/code`

Runs Claude Code (`claude -p`) with your task and reports back what it did.

**Usage:**
```
/code <task description>
```

**Examples:**
```
/code add error handling to the login function in src/auth.ts
/code refactoriza el módulo de pagos para usar async/await
/code write tests for the UserService class
/code fix the bug where the cart doesn't update after removing an item
```

## How it works

1. OpenClaw receives your `/code` command
2. Runs `claude -p "<task>" --dangerously-skip-permissions` in `/home/claw/workspace`
3. Claude Code does the actual coding work (reads files, edits code, etc.)
4. OpenClaw relays the full output back to you

## Notes

- Claude Code runs in the `/home/claw/workspace` directory by default
- Use natural language — Claude Code understands context well
- For tasks in a specific subdirectory, mention the path in your task description
