---
description: Control workflow mode state
---

Handle the /mode command for mode management.

Arguments: $ARGUMENTS

Based on the arguments:
- No args or "status": Call the `status` MCP tool and display the result
- "reset": Call `force_transition` with target set to "idle"
- "<mode-name>": Call `force_transition` with the specified target
- "help": Show usage: /mode, /mode status, /mode <name>, /mode reset
