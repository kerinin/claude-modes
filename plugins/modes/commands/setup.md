---
description: Set up modes plugin permissions and status line
---

Set up the modes plugin by performing these steps:

## Step 1: Configure Permissions

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

## Step 2: Status Line (Optional)

Ask the user: "Would you like to display the current mode in Claude Code's status line? This shows something like ⟪test-dev⟫ at the bottom of the screen."

If they say yes:

1. Copy the status line script:
```bash
cp ~/.claude/plugins/modes/examples/statusline/modes-statusline.sh ~/.claude/
chmod +x ~/.claude/modes-statusline.sh
```

2. Read `~/.claude/settings.json` (create if it doesn't exist) and add or merge in:
```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/modes-statusline.sh"
  }
}
```

Preserve any existing settings when merging.

## After Setup

Tell the user:
- Permissions configured for modes plugin
- Status line configured (if they opted in) - they may need to restart Claude Code to see it
- To configure workflows, create `.claude/modes.yaml` (or copy from plugin examples)
- Run `/modes:mode` to check current mode status
