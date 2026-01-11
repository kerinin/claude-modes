# Modes Plugin

Modal execution for Claude Code - enforce workflows like TDD by limiting actions based on current mode.

## The Problem

Claude Code is great at completing tasks, but it often takes shortcuts. Ask it to do TDD and it might:
- Jump straight to implementation without writing a test
- Modify your test file while "fixing" a bug
- Skip the red-green-refactor cycle entirely

You can remind Claude to follow the process, but those instructions get lost during context compaction. There's no enforcement - just hope.

## The Solution

Modes creates a state machine for your workflow. Each mode defines:
- **What Claude can do** - file permissions, tool access
- **When Claude can move on** - transition constraints that must be satisfied

```
idle ──────────► test-dev ──────────► feature-dev ──────────► idle
     "describe a       "test exists        "all tests
      bug/feature"      and fails"          pass"
```

In `test-dev` mode, Claude can edit test files but not source files. It can't move to `feature-dev` until a failing test exists. In `feature-dev`, it can edit source but not tests. It can't return to `idle` until tests pass.

**Why this works:**
- Mode state survives context compaction (injected every prompt)
- Permissions are enforced by hooks, not just instructions
- Constraints are visible to Claude, guiding rather than just blocking

## Installation

```
/plugin marketplace add kerinin/claude-modes
/plugin install modes@claude-modes
```

## Setup

### 1. Configure Your Modes

Copy the example TDD configuration:

```bash
cp -r ~/.claude/plugins/modes/examples/tdd/* .claude/
```

Or create your own `modes.yaml` in `.claude/`:

### 2. Auto-approve Mode Tools (Optional)

Add to `.claude/settings.json` to skip permission prompts:

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

Note: `force_transition` intentionally requires approval for safety.

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

- `/modes:mode` - Show current mode and available transitions
- `/modes:mode <name>` - Force transition to a mode (requires approval)
- `/modes:mode reset` - Return to default mode
- `/modes:setup` - Configure auto-approval permissions

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
