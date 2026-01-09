# Claude Modes

**Modal execution for Claude Code**

---

## Problem Statement

Claude Code lacks structured workflow enforcement. Claude may skip important steps, jump ahead in a process, or forget constraints that were established earlier in a conversation. Users must manually remind Claude of workflow requirements and can't verify compliance.

**Examples of workflows that would benefit from structured enforcement:**

| Workflow | Problem Without Enforcement |
|----------|---------------------------|
| **Test-Driven Development** | Claude jumps to implementation without writing tests first, or modifies tests while fixing bugs |
| **Design-First Development** | Claude starts coding before design decisions are documented and approved |
| **Code Review** | Claude merges or deploys without review steps, skips required checks |
| **Refactoring** | Claude makes changes without ensuring tests pass before and after |
| **Security-Sensitive Changes** | Claude modifies auth/crypto code without required review gates |
| **Database Migrations** | Claude runs migrations without backup or verification steps |
| **Documentation-Driven** | Claude implements features before documenting the intended behavior |
| **Bug Triage** | Claude attempts fixes without first reproducing and diagnosing the issue |

**Common patterns across these workflows:**
- Sequential phases with different allowed actions per phase
- Gates/constraints that must be satisfied before progressing
- Prevention of certain actions in certain phases (e.g., no impl code in test phase)
- Need for the mode state to persist across context compaction

We want to introduce **modal execution** backed by a state machine, where different modes have different constraints on what Claude can do.

## Goals

- Enforce workflows like TDD by limiting available actions based on current mode
- Make constraints feel natural (context shaping) rather than frustrating (constant blocking)
- Integrate with existing Claude Code config patterns
- Keep the system flexible for iteration

---

## How It Works

Claude Modes provides two layers of enforcement:

**1. Mode constraints** - Each mode defines what Claude can and cannot do. In `test-dev` mode, Claude can write tests but cannot modify implementation code. This prevents wrong actions within a phase.

**2. Transition constraints** - Claude cannot freely jump between modes. Each transition has a constraint that must be satisfied first. To move from `test-dev` to `feature-dev`, Claude must have written a failing test. This prevents skipping phases.

Together, these ensure Claude follows the intended workflow sequence and performs the right actions at each step.

**Example: TDD workflow**

```
idle ──────────────► test-dev ──────────────► feature-dev ──────────────► idle
      "User described        "Test exists and           "All tests pass"
       a bug/feature"         is failing"
```

Without transition constraints, Claude might:
- Jump straight to implementation without writing a test
- Skip from `test-dev` to `idle` without ever implementing the fix
- Transition to `feature-dev` before confirming the test actually fails

The constraint system makes these shortcuts impossible. Claude must satisfy each gate before progressing.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Mode MCP Server                            │
│  (Long-running process, started by Claude Code via .mcp.json)   │
│                                                                  │
│  Responsibilities:                                               │
│  ├─ Load modes.yaml (state machine topology)                    │
│  ├─ Load mode-specific config (settings.{mode}.json, etc.)      │
│  ├─ Manage mode-state.json (per-project state)                  │
│  ├─ Expose MCP tool (mode_transition)                           │
│  └─ Serve HTTP API for hooks                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
         ┌───────────┐         ┌───────────┐
         │UserPrompt │         │PreToolUse │
         │Submit Hook│         │   Hook    │
         └───────────┘         └───────────┘
                │                     │
                │                     │
          Inject mode            Enforce mode
          context +             permissions
          constraints
```

Claude Modes uses two enforcement layers:
1. **Context injection** via UserPromptSubmit - Claude always sees current mode and transition constraints
2. **Permission enforcement** via PreToolUse - blocks disallowed tool usage as a safety net

---

## Components

### 1. MCP Server (`claude-mode-mcp`)

**Distribution:** npm package (`npx claude-mode-mcp`)

**Startup:** Configured in `.mcp.json`, started automatically by Claude Code

**Responsibilities:**

| Function | Description |
|----------|-------------|
| Config loading | Read `modes.yaml` + `settings.{mode}.json` + `CLAUDE.{mode}.md` |
| State management | Read/write `mode-state.json` |
| MCP tool | Expose `mode_transition` |
| HTTP API | Serve endpoints for hooks (low latency, config cached in memory) |

**Multi-Session Handling:**

The MCP server manages **per-project** state, not per-session:
- `mode-state.json` is shared across all Claude sessions in the same project
- This is intentional: mode state represents where the *project* is in its development cycle
- Multiple sessions see and can modify the same mode state
- State file uses atomic writes to prevent corruption from concurrent access

**MCP Tool:**

```typescript
// mode_transition - Request mode change
{
  name: "mode_transition",
  description: "Transition to a new mode",
  inputSchema: {
    type: "object",
    properties: {
      target_mode: { type: "string", description: "Mode to transition to" },
      explanation: { type: "string", description: "Why this transition is justified" }
    },
    required: ["target_mode", "explanation"]
  }
}
// Returns: { success: true, new_mode } or { success: false, reason }
```

**HTTP API (for hooks):**

The MCP server exposes an HTTP API via Unix domain socket (not TCP port) to avoid conflicts when running multiple projects:

```
Socket: .claude/mode.sock

# For hooks
GET  /context            - Get current mode context for injection
POST /check-tool         - Check if tool allowed in current mode

# For user control (/mode command)
GET  /status             - Current mode + available transitions (human-readable)
POST /force-transition   - Transition without constraint check
POST /reset              - Return to default mode
```

Using a Unix socket ensures each project's MCP server is isolated - no port conflicts when working on multiple projects simultaneously.

### 2. Hooks

**UserPromptSubmit Hook**
- Calls `GET /context` on MCP server
- Injects current mode + available transitions + constraints
- Ensures Claude always knows current mode (survives context compaction)

**PreToolUse Hook**
- Calls `POST /check-tool` with tool name and inputs
- MCP server checks against current mode's permissions (from `settings.{mode}.json`)
- Returns allow/block decision

### 3. Configuration

Claude Modes integrates with Claude Code's existing config patterns. The mode schema is minimal - just state topology and transition constraints. All other configuration uses standard Claude Code conventions.

**File Structure:**
```
.claude/
├── modes.yaml                 # State machine topology only
├── mode-state.json            # Runtime state (gitignored)
├── mode.sock                  # Unix socket for hook communication (gitignored)
├── settings.json              # Base permissions
├── settings.test-dev.json     # Permissions for test-dev mode
├── settings.feature-dev.json  # Permissions for feature-dev mode
├── CLAUDE.md                  # Base instructions
├── CLAUDE.test-dev.md         # Instructions for test-dev mode
├── CLAUDE.feature-dev.md      # Instructions for feature-dev mode
└── commands/
    └── mode.md                # /mode slash command
```

**modes.yaml (minimal schema):**
```yaml
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: test-dev
        constraint: User has described a bug or feature to work on

  test-dev:
    transitions:
      - to: feature-dev
        constraint: |
          A test exists that targets the bug/feature.
          The test has been executed and is currently failing.

  feature-dev:
    transitions:
      - to: idle
        constraint: |
          All tests are passing.
          No test files were modified in this mode.
```

**settings.test-dev.json:**
```json
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Write({test/**,**/*.test.ts,**/*.spec.ts})",
      "Bash(npm test*)"
    ],
    "deny": [
      "Write(src/**)",
      "Edit(src/**)"
    ]
  }
}
```

**CLAUDE.test-dev.md:**
```markdown
## Mode: test-dev

You are writing a failing test. Focus on:
1. Understanding the expected behavior
2. Writing a test that verifies that behavior
3. Running the test to confirm it fails

Do NOT modify implementation code in this mode.
```

**Benefits of this approach:**
- Mode schema is minimal and focused (just topology)
- Leverages existing Claude Code config patterns
- Permissions and instructions can be customized per user/project scope
- Standard file hierarchy rules apply (user < project < local)

---

## Integration Points

Claude Modes handles MCP server and hook registration automatically. Users only need to provide mode configuration.

### Provided by Claude Modes (automatic)
- MCP server startup
- Hook registration (UserPromptSubmit, PreToolUse)
- `/mode` slash command

### Provided by User (per-project)

**modes.yaml** - State machine definition:
```yaml
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: test-dev
        constraint: User has described a bug or feature
  # ... additional modes
```

**CLAUDE.{mode}.md** - Instructions per mode:
```markdown
## Mode: test-dev

You are writing a failing test. Focus on:
1. Understanding the expected behavior
2. Writing a test that verifies that behavior
3. Running the test to confirm it fails
```

**settings.{mode}.json** - Permissions per mode:
```json
{
  "permissions": {
    "allow": ["Read(**)", "Write(test/**)"],
    "deny": ["Write(src/**)"]
  }
}
```

---

## Transition Mechanism

Transitions are the gates between modes. Claude cannot simply declare it wants to change modes - it must justify why the transition constraint is satisfied.

This creates accountability:
- Claude must articulate *why* the constraint is met ("test fails with expected 401, got 200")
- The explanation is visible to the user in the conversation
- Users can challenge incorrect transitions before Claude proceeds

**Flow:**

1. **Context injection:** Every user prompt, the UserPromptSubmit hook injects current mode, available transitions, and their constraints
2. **Self-evaluation:** Claude determines when a transition is appropriate based on the injected constraints
3. **Explicit transition:** Claude calls `mode_transition` with target mode and explanation
4. **State update:** MCP server updates state; subsequent prompts get new context and permissions

**Example injected context:**
```
MODE: test-dev

AVAILABLE TRANSITIONS:
→ feature-dev
  Constraint: A test exists that targets the bug/feature.
  The test has been executed and is currently failing.

When you believe the constraint is satisfied, call mode_transition
with your target mode and an explanation of why the constraint is met.
```

**Example transition call:**
```typescript
mode_transition({
  target_mode: "feature-dev",
  explanation: "Created auth.test.ts with test for 401 response. Ran 'npm test' - test fails with 'expected 401, got 200'. Ready to implement fix."
})
```

**User visibility:**
- Transition tool calls appear in conversation
- Explanation field shows Claude's reasoning
- User can intervene if Claude's judgment is incorrect

---

## User Control

Users can control the mode directly via slash commands, independent of Claude:

```
/mode              # Show current mode + available transitions
/mode <mode>       # Force transition to <mode> (skips constraint check)
/mode reset        # Return to default mode
```

**Implementation:** Custom slash command (`.claude/commands/mode.md`) that calls the MCP server directly:

```markdown
# .claude/commands/mode.md

---
description: Control mode state
allowed-tools: Bash
---

Check or change the current mode.

Usage:
- /mode - show current mode
- /mode <mode> - force transition to mode
- /mode reset - return to default mode

Use curl to call the mode MCP server:
curl -s --unix-socket .claude/mode.sock http://localhost/status
```

**MCP Server endpoint for user control:**

```
GET  /status                    # Current mode + available transitions
POST /force-transition          # Transition without constraint check
     { "target_mode": "..." }
POST /reset                     # Return to default mode
```

**Why separate from Claude's transition:**
- Claude uses `mode_transition` tool with explanation and constraint awareness
- Users use `/mode` command for direct control without justification
- Both update the same state file

---

## Distribution

Claude Modes is distributed as a **Claude Code plugin**, providing one-command installation.

### Installation

```bash
claude plugin install claude-modes
```

This installs and configures:
- MCP server (auto-starts when plugin enabled)
- Hooks (auto-registered)
- `/mode` slash command
- Example mode configurations

### Plugin Structure

```
claude-modes-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── servers/
│   └── mode-mcp/                # Bundled MCP server
├── hooks/
│   └── hooks.json               # Hook configurations
├── commands/
│   └── mode.md                  # /mode slash command
├── examples/
│   ├── tdd/                     # TDD mode example
│   │   ├── modes.yaml
│   │   ├── CLAUDE.test-dev.md
│   │   ├── CLAUDE.feature-dev.md
│   │   ├── settings.test-dev.json
│   │   └── settings.feature-dev.json
│   └── code-review/             # Code review mode example
└── README.md
```

### Plugin Manifest

```json
{
  "name": "claude-modes",
  "version": "1.0.0",
  "description": "Modal execution for Claude Code",
  "mcpServers": {
    "mode": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/mode-mcp/bin/server.js",
      "args": ["--socket", ".claude/mode.sock"]
    }
  },
  "hooks": "./hooks/hooks.json",
  "commands": ["./commands/mode.md"]
}
```

### hooks/hooks.json

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s --unix-socket .claude/mode.sock http://localhost/context"
      }]
    }],
    "PreToolUse": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s --unix-socket .claude/mode.sock -X POST http://localhost/check-tool -d @-"
      }]
    }]
  }
}
```

### What Users Provide

After installing Claude Modes, users create their project-specific mode configuration:

```
.claude/
├── modes.yaml              # Define modes and transitions
├── CLAUDE.{mode}.md        # Instructions per mode
└── settings.{mode}.json    # Permissions per mode
```

Users can copy from the plugin's examples directory to get started quickly.

---

## Technical Constraints

These constraints informed the design:

- **Config file discovery:** Claude Code uses exact filename matching. Files like `CLAUDE.test-dev.md` and `settings.test-dev.json` are ignored by native loading (validated).
- **PreToolUse coverage:** Intercepts standard tools, MCP tools, Skills, subagents
- **Hook capabilities:** Can inject context (UserPromptSubmit), block tools (PreToolUse), modify inputs
- **Hooks run in parallel**, cannot chain or pass data between hooks
- **Base permissions must be permissive** - hooks can only add restrictions, not remove them

---

## Implementation Roadmap

### Phase 1: MCP Server
- [ ] Project setup (TypeScript)
- [ ] modes.yaml parsing (modes, transitions, constraints)
- [ ] Mode-specific config loading (settings.{mode}.json, CLAUDE.{mode}.md)
- [ ] State management (read/write mode-state.json)
- [ ] Unix socket HTTP API (/context, /check-tool, /status, /force-transition, /reset)
- [ ] MCP tool (mode_transition)

### Phase 2: Plugin Structure
- [ ] Plugin manifest (plugin.json)
- [ ] Hook configurations (hooks.json)
- [ ] /mode slash command
- [ ] Bundle MCP server in plugin

### Phase 3: Example Modes
- [ ] TDD mode (modes.yaml, CLAUDE.*.md, settings.*.json)
- [ ] Code review mode
- [ ] Documentation

### Phase 4: Testing & Release
- [ ] End-to-end testing with real tasks
- [ ] Iterate on context injection format
- [ ] Plugin marketplace setup
- [ ] Release v1.0

---

## Verification Plan

1. **Unit tests** for MCP server config loading and state management
2. **Integration test:** Start MCP server, verify HTTP endpoints work
3. **Hook test:** Verify hooks communicate with MCP server correctly
4. **End-to-end test:**
   - Start Claude Code with Claude Modes configured
   - Give Claude a bug to fix
   - Verify Claude enters test-dev mode
   - Verify Claude cannot write to src/ in test-dev
   - Verify Claude can transition after writing failing test
   - Verify Claude can write to src/ in feature-dev
   - Verify Claude cannot modify tests in feature-dev

---

## Open Questions

1. **Transition history:** Log all transitions for audit? Could help debug mode issues.
2. **Context format:** What's the ideal format for injected mode context? Need to test what Claude responds to best.
