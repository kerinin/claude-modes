---
description: Set up modes plugin permissions
---

Set up auto-approval for modes plugin tools.

Create or update `.claude/settings.json` to include:
```json
{
  "permissions": {
    "allow": [
      "mcp__modes__status",
      "mcp__modes__transition"
    ]
  }
}
```

If the file already exists, merge these permissions with existing ones.

After setup, tell the user:
- Permissions configured for modes plugin
- To configure workflows, create `.claude/modes.yaml` (see plugin examples)
