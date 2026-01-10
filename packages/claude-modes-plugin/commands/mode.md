---
description: Control workflow mode state
---

Handle the /mode command for mode management.

Arguments: $ARGUMENTS

Based on the arguments:
- No args or "status": Call the `mode_status` MCP tool and display the result
- "reset": Call `mode_force_transition` with target_mode set to "idle"
- "<mode-name>": Call `mode_force_transition` with the specified target_mode
- "help": Show usage: /mode, /mode status, /mode <name>, /mode reset
