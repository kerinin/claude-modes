---
description: Control workflow mode state
---

Arguments: $ARGUMENTS

IMPORTANT: Do NOT use Bash commands. Do NOT read files. Call the MCP tool directly.

If arguments is empty, "status", or missing:
  → Call `mcp__modes__status` tool with no parameters

If arguments is "reset":
  → Call `mcp__modes__force_transition` tool with `{"target": "idle"}`

If arguments is "help":
  → Reply with: `/mode` `/mode status` `/mode <name>` `/mode reset`

Otherwise (arguments is a mode name like "test-dev"):
  → Call `mcp__modes__force_transition` tool with `{"target": "<arguments>"}`
