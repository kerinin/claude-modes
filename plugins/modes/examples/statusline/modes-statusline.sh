#!/bin/bash
# Modes Plugin Status Line Script
# Displays current mode in Claude Code's status line
#
# Install:
#   1. Copy this script to ~/.claude/modes-statusline.sh
#   2. Make it executable: chmod +x ~/.claude/modes-statusline.sh
#   3. Add to ~/.claude/settings.json:
#      {
#        "statusLine": {
#          "type": "command",
#          "command": "~/.claude/modes-statusline.sh"
#        }
#      }

# Read JSON input from Claude Code
input=$(cat)

# Extract project directory from workspace info
PROJECT_DIR=$(echo "$input" | jq -r '.workspace.project_dir // .workspace.current_dir // empty')

# If no project dir, exit silently
if [[ -z "$PROJECT_DIR" ]]; then
  exit 0
fi

# Look for mode state file
STATE_FILE="$PROJECT_DIR/.claude/mode-state.json"

if [[ -f "$STATE_FILE" ]]; then
  MODE=$(jq -r '.currentMode // empty' "$STATE_FILE" 2>/dev/null)
  if [[ -n "$MODE" ]]; then
    # Display mode with cyan color and unicode bracket
    # Format: ⟪mode-name⟫
    echo -e "\e[36m⟪${MODE}⟫\e[0m"
  fi
fi
