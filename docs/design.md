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
│                    Combined Mode Server                          │
│  (Single process started by Claude Code via .mcp.json)          │
│                                                                  │
│  Interfaces:                                                     │
│  ├─ MCP (stdio) ─► status, transition, force_transition         │
│  └─ HTTP (Unix socket) ─► /context, /check-tool                 │
│                                                                  │
│  Shared in-memory:                                               │
│  ├─ Config (modes.yaml, settings.{mode}.json, CLAUDE.{mode}.md) │
│  └─ State (mode-state.json)                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │  Claude   │   │UserPrompt │   │PreToolUse │
    │ (tools)   │   │Submit Hook│   │   Hook    │
    └───────────┘   └───────────┘   └───────────┘
          │                │                │
          │                │                │
     Call MCP         Inject mode      Enforce mode
     tools            context          permissions
```

**Single process benefits:**
- Shared config loaded once
- No race conditions on state file
- Simpler deployment and debugging

Claude Modes uses two enforcement layers:
1. **Context injection** via UserPromptSubmit - Claude always sees current mode and transition constraints
2. **Permission enforcement** via PreToolUse - blocks disallowed tool usage as a safety net

---

## Components

### 1. Mode Server (`claude-modes-mcp`)

**Distribution:** npm package (`npx claude-modes-mcp`)

**Startup:** Configured in `.mcp.json`, started automatically by Claude Code

**Implementation:** Single process (`combined-server.ts`) that handles both interfaces:
- MCP tools via stdio (for Claude to call)
- HTTP API via Unix socket (for hooks)

**Responsibilities:**

| Function | Description |
|----------|-------------|
| Config loading | Read `modes.yaml` + `settings.{mode}.json` + `CLAUDE.{mode}.md` |
| State management | Read/write `mode-state.json` |
| MCP tools | Expose `status`, `transition`, `force_transition` |
| HTTP API | Serve endpoints for hooks (`/context`, `/check-tool`) |

**Multi-Session Handling:**

The MCP server manages **per-project** state, not per-session:
- `mode-state.json` is shared across all Claude sessions in the same project
- This is intentional: mode state represents where the *project* is in its development cycle
- Multiple sessions see and can modify the same mode state
- State file uses atomic writes to prevent corruption from concurrent access

**MCP Tools:**

```typescript
// transition - Constrained mode change (requires valid transition + explanation)
{
  name: "transition",
  description: "Transition to a new mode. Only transitions defined in modes.yaml are allowed.",
  inputSchema: {
    type: "object",
    properties: {
      target: { type: "string", description: "Mode to transition to" },
      explanation: { type: "string", description: "Why the transition constraint is satisfied" }
    },
    required: ["target", "explanation"]
  }
}
// Returns: { success: true, new_state } or { success: false, reason }

// status - Get current mode information
{
  name: "status",
  description: "Get current mode, available transitions, and recent history",
  inputSchema: { type: "object", properties: {} }
}
// Returns: { current_mode, available_transitions, history }

// force_transition - Forced mode change (skips constraint check)
{
  name: "force_transition",
  description: "Force transition to any mode, bypassing constraint checks. For user overrides only.",
  inputSchema: {
    type: "object",
    properties: {
      target: { type: "string", description: "Mode to transition to" }
    },
    required: ["target"]
  }
}
// Returns: { success: true, new_mode } or { success: false, reason }
```

**HTTP API (for hooks only):**

The MCP server exposes an HTTP API via Unix domain socket for hook communication:

```
Socket: .claude/mode.sock

GET  /context            - Get current mode context for injection (UserPromptSubmit)
POST /check-tool         - Check if tool allowed in current mode (PreToolUse)
```

User control (`/mode` commands) goes through MCP tools, not HTTP endpoints. This keeps all mode operations going through the same MCP interface.

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
3. **Explicit transition:** Claude calls `transition` tool with target mode and explanation
4. **State update:** MCP server updates state; subsequent prompts get new context and permissions

**Example injected context:**
```
MODE: test-dev

AVAILABLE TRANSITIONS:
→ feature-dev
  Constraint: A test exists that targets the bug/feature.
  The test has been executed and is currently failing.

When you believe the constraint is satisfied, call the transition tool
with your target mode and an explanation of why the constraint is met.
```

**Example transition call:**
```typescript
transition({
  target: "feature-dev",
  explanation: "Created auth.test.ts with test for 401 response. Ran 'npm test' - test fails with 'expected 401, got 200'. Ready to implement fix."
})
```

**User visibility:**
- Transition tool calls appear in conversation
- Explanation field shows Claude's reasoning
- User can intervene if Claude's judgment is incorrect

---

## User Control

Users can control the mode directly via slash commands:

```
/mode              # Show current mode + available transitions
/mode <mode>       # Force transition to <mode> (skips constraint check)
/mode reset        # Return to default mode
```

**Implementation:** Slash commands in Claude Code are prompt shortcuts - Markdown files in `.claude/commands/` that instruct Claude what to do. The `/mode` commands are alternate entrypoints to the MCP tools:

| Command | Instructs Claude to call |
|---------|--------------------------|
| `/mode` | `status` tool |
| `/mode status` | `status` tool |
| `/mode <name>` | `force_transition` tool |
| `/mode reset` | `force_transition` with `target: <default>` |

```markdown
# .claude/commands/mode.md

---
description: Control mode state
---

Handle the /mode command for mode management.

Arguments: $ARGUMENTS

Based on the arguments:
- No args or "status": Call the `status` MCP tool and display the result
- "reset": Call `force_transition` with target set to the default mode
- "<mode-name>": Call `force_transition` with the specified target
- "help": Show usage: /mode, /mode status, /mode <name>, /mode reset
```

**Key design decision:** Slash commands instruct Claude to call MCP tools rather than hitting HTTP endpoints directly. This ensures:
- Consistent behavior between programmatic and user-invoked mode changes
- MCP tool permissions control access to forced transitions
- All mode operations go through the same code path

---

## Distribution

Claude Modes is distributed as a **Claude Code plugin**, providing one-command installation.

### Installation

```bash
/plugin install modes
```

This installs and configures:
- MCP server (auto-starts when plugin enabled)
- Hooks (auto-registered)
- `/mode` slash command
- Example mode configurations

### Plugin Structure

```
packages/modes/                   # Plugin directory
├── plugin.json                   # Plugin manifest
├── server/
│   └── bundle.cjs                # Bundled MCP server (built from modes-server)
├── hooks/
│   └── hooks.json                # Hook configurations
├── commands/
│   ├── mode.md                   # /mode slash command
│   └── setup.md                  # /setup slash command
├── examples/
│   └── tdd/                      # TDD mode example
│       ├── modes.yaml
│       ├── CLAUDE.test-dev.md
│       ├── CLAUDE.feature-dev.md
│       ├── settings.test-dev.json
│       └── settings.feature-dev.json
└── README.md
```

### Plugin Manifest

```json
{
  "name": "modes",
  "version": "0.1.0",
  "description": "Modal execution for Claude Code",
  "commands": ["commands/mode.md", "commands/setup.md"],
  "hooks": "hooks/hooks.json",
  "mcpServers": {
    "modes": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/bundle.cjs"],
      "env": {
        "CLAUDE_MODES_CONFIG_DIR": "${CLAUDE_PROJECT_DIR}/.claude",
        "CLAUDE_MODES_SOCKET": "${CLAUDE_PROJECT_DIR}/.claude/mode.sock"
      }
    }
  }
}
```

### hooks/hooks.json

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "curl -s --unix-socket \"$CLAUDE_PROJECT_DIR/.claude/mode.sock\" http://./context 2>/dev/null || true"
      }]
    }],
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "curl -s --unix-socket \"$CLAUDE_PROJECT_DIR/.claude/mode.sock\" -X POST -d @- http://./check-tool 2>/dev/null || true"
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

### Phase 1: MCP Server ✓
- [x] Project setup (TypeScript)
- [x] modes.yaml parsing (modes, transitions, constraints)
- [x] Mode-specific config loading (settings.{mode}.json, CLAUDE.{mode}.md)
- [x] State management (read/write mode-state.json)
- [x] Unix socket HTTP API for hooks (/context, /check-tool)
- [x] MCP tools (status, transition, force_transition)

### Phase 2: Plugin Structure ✓
- [x] Plugin manifest (plugin.json)
- [x] Hook configurations (hooks.json)
- [x] /mode slash command
- [x] Bundle MCP server in plugin (esbuild → bundle.cjs)
- [x] Build automation (npm run bundle)

### Phase 3: Example Modes
- [x] TDD mode (modes.yaml, CLAUDE.*.md, settings.*.json)
- [ ] Code review mode
- [ ] Documentation

### Phase 4: Testing & Release
- [x] Unit tests for all components
- [x] E2E tests for MCP server
- [ ] End-to-end testing with real workflows
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

1. ~~**Transition history:** Log all transitions for audit?~~ **Resolved:** Yes, transitions are logged in `mode-state.json` history array. `status` tool returns recent history.
2. ~~**Context format:** What's the ideal format for injected mode context?~~ **Resolved:** Context renderer outputs structured text with mode, instructions, transitions, and guidance.
3. ~~**Server consolidation:** Should MCP server and HTTP server be consolidated?~~ **Resolved:** Yes, consolidated into single `combined-server.ts`.
4. ~~**Plugin auto-approve:** Can plugins auto-approve their own tools?~~ **Resolved:** No, this is a security design decision. Users must configure permissions in `.claude/settings.json`.
