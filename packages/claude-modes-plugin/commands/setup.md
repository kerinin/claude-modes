---
description: Set up claude-modes in the current project
---

Set up the claude-modes plugin in this project by creating the required configuration files.

Create the following files if they don't exist:

1. **`.claude/settings.json`** (create or merge with existing) for auto-approval:
```json
{
  "permissions": {
    "allow": [
      "mcp__mode__mode_status",
      "mcp__mode__mode_transition"
    ]
  }
}
```

2. Copy the TDD example modes if no modes.yaml exists:
   - `.claude/modes.yaml`
   - `.claude/CLAUDE.test-dev.md`
   - `.claude/CLAUDE.feature-dev.md`
   - `.claude/settings.test-dev.json`
   - `.claude/settings.feature-dev.json`

The MCP server is provided by the plugin automatically.
