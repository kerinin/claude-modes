# Claude Modes Plugin

Modal execution for Claude Code - enforce workflows like TDD by limiting actions based on current mode.

## Installation

```
/plugin install claude-modes
```

## Setup

### 1. Configure Your Modes

Copy the example TDD configuration:

```bash
cp -r ~/.claude/plugins/claude-modes/examples/tdd/* .claude/
```

Or create your own `modes.yaml` in `.claude/`:

### 2. Auto-approve Mode Tools (Optional)

Add to `.claude/settings.json` to skip permission prompts:

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

Note: `mode_force_transition` intentionally requires approval for safety.

### Creating Custom Modes

```yaml
name: my-workflow
default: idle

modes:
  idle:
    transitions:
      - to: working
        constraint: User has described a task

  working:
    transitions:
      - to: idle
        constraint: Task is complete
```

## Usage

### Slash Commands

- `/mode` - Show current mode and available transitions
- `/mode <name>` - Force transition to a mode (requires approval)
- `/mode reset` - Return to default mode

### Automatic Behavior

- **Context injection**: Every prompt shows current mode and constraints
- **Permission enforcement**: Tools blocked by mode permissions are automatically denied

## Configuration Files

Place these in your project's `.claude/` directory:

| File | Purpose |
|------|---------|
| `modes.yaml` | Define modes and transition constraints |
| `CLAUDE.<mode>.md` | Instructions for each mode |
| `settings.<mode>.json` | Tool permissions for each mode |

## Example: TDD Workflow

See `examples/tdd/` for a complete Test-Driven Development workflow with:
- `idle` → `test-dev` → `feature-dev` → `idle` cycle
- Test files only editable in test-dev mode
- Source files only editable in feature-dev mode
