---
description: Control workflow mode state
---

Arguments: $ARGUMENTS

Immediately call the appropriate MCP tool (do not read files first):

- No args or "status": Call `status` tool
- "reset": Call `force_transition` with target "idle"
- "<mode-name>": Call `force_transition` with that target
- "help": Show: `/mode`, `/mode status`, `/mode <name>`, `/mode reset`
