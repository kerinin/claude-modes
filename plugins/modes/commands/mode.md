---
description: Control workflow mode state
---

Arguments: $ARGUMENTS

Use the MCP tools from the "modes" server. Do NOT use Bash - invoke the MCP tool directly:

- No args or "status": Use `mcp__modes__status` tool
- "reset": Use `mcp__modes__force_transition` tool with target: "idle"
- "<mode-name>": Use `mcp__modes__force_transition` tool with target set to that mode name
- "help": Show available commands: `/mode`, `/mode status`, `/mode <name>`, `/mode reset`
