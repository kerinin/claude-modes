---
description: Control workflow mode state
---

Arguments: $ARGUMENTS

You MUST call an MCP tool. Do NOT just print help or explanations.

Based on the arguments, take ONE of these actions:

1. If no arguments OR argument is "status":
   → Call the `mcp__modes__status` MCP tool immediately

2. If argument is "reset":
   → Call `mcp__modes__force_transition` MCP tool with parameter target="idle"

3. If argument is "help":
   → Print: `/mode` `/mode status` `/mode <name>` `/mode reset`

4. If argument is any other string (a mode name):
   → Call `mcp__modes__force_transition` MCP tool with parameter target="<that argument>"

IMPORTANT: For options 1, 2, and 4 you must invoke the MCP tool, not describe it.
