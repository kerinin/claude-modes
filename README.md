# Modes Plugin

Modal execution for Claude Code - enforce workflows like TDD by limiting actions based on current mode.

## The Problem

Claude Code is great at completing tasks, but it often takes shortcuts. Ask it to do TDD and it might:
- Jump straight to implementation without writing a test
- Modify your test file while "fixing" a bug
- Skip the red-green-refactor cycle entirely

You can remind Claude to follow the process, but those instructions get lost during context compaction. There's no enforcement - just hope.

## The Solution

Define your own workflow as a state machine. You create modes with:
- **Permissions** - what files/tools Claude can use in each mode
- **Transition constraints** - conditions for moving between modes

You decide what works for you. Want strict TDD? Lock down source files until tests fail. Prefer a lighter touch? Skip permissions and just use transitions as guideposts.

**Example: a TDD workflow**

```
idle ──────────► test-dev ──────────► feature-dev ──────────► idle
     "describe a       "test exists        "all tests
      bug/feature"      and fails"          pass"
```

This config restricts `test-dev` to test files only, `feature-dev` to source files only. But that's just one approach - your `modes.yaml` defines whatever workflow fits your process.

**Why this works:**
- Mode state survives context compaction (injected every prompt)
- Permissions enforced by hooks, not just instructions
- Constraints visible to Claude, guiding rather than just blocking
- Fully customizable to match how you actually work

## Installation

```
/plugin marketplace add kerinin/claude-modes
/plugin install modes@claude-modes
```

Then run `/modes:setup` to configure permissions. This adds the modes MCP tools to your allow list so Claude can check and update mode state without prompting you each time.

## Setup

### Quick Start

Copy the example TDD workflow to your project:

```bash
cp -r ~/.claude/plugins/modes/examples/tdd/* .claude/
```

This gives you a working TDD workflow out of the box. Read on to understand what each file does and how to customize it.

### Configuration Files

Modes config lives in your project's `.claude/` directory:

#### `.claude/modes.yaml` - The Workflow Definition

This is your state machine. It defines what modes exist and when Claude can move between them.

```yaml
name: tdd-workflow
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
        constraint: All tests are passing.
```

The `constraint` is shown to Claude and guides when it should transition. Claude evaluates whether the constraint is satisfied and calls the transition tool when ready.

#### `.claude/CLAUDE.<mode>.md` - Mode Instructions

These work just like your project's root `CLAUDE.md`, but only get loaded when Claude is in that mode. Use them to give Claude mode-specific guidance.

```markdown
<!-- .claude/CLAUDE.test-dev.md -->
You are writing a failing test. Focus on:
1. Understanding the expected behavior
2. Writing a test that verifies that behavior
3. Running the test to confirm it fails

Do NOT modify implementation code in this mode.
```

Your root `CLAUDE.md` is always loaded. Mode instructions are additive - they don't replace your base instructions, they supplement them for that phase of work.

#### `.claude/settings.<mode>.json` - Mode Permissions

These constrain what Claude can do while in a specific mode. The `allow` and `deny` lists use glob patterns to control file and tool access.

```json
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Write({test/**,**/*.test.ts})",
      "Edit({test/**,**/*.test.ts})",
      "Bash(npm test*)"
    ],
    "deny": [
      "Write(src/**)",
      "Edit(src/**)"
    ]
  }
}
```

In this example, while in `test-dev` mode Claude can read anything, write/edit test files, and run tests - but it cannot touch source files. The hook blocks the action before it happens.

**Permissions are optional.** If you just want transitions as guideposts without hard enforcement, skip the settings files entirely.

## Usage

### How It Works in Practice

Once configured, modes work automatically. Here's what a TDD session might look like:

```
You: Fix the bug where users can't log in with email addresses containing a plus sign

Claude: I'll help fix that login bug. Let me first write a test to verify the issue.
        [MODE: idle → test-dev]

        Creating test for plus sign in email...
        [Creates test/auth.test.ts]

        Running the test to confirm it fails...
        [Runs: npm test]

        Test fails as expected. Now I'll implement the fix.
        [MODE: test-dev → feature-dev]

        [Edits src/auth.ts to fix email parsing]

        Running tests to verify the fix...
        [Runs: npm test]

        All tests pass.
        [MODE: feature-dev → idle]

You: Great, thanks!
```

**What's happening behind the scenes:**

1. **Context injection** - Every prompt, Claude sees the current mode, its instructions, and available transitions. This is why Claude knows to start with a test.

2. **Permission enforcement** - In `test-dev`, if Claude tried to edit `src/auth.ts`, the hook would block it. Claude literally can't skip ahead.

3. **Transition gating** - Claude can't move to `feature-dev` until it's written and run a failing test. The constraint is visible, so Claude knows what it needs to do.

4. **State persistence** - Even if the conversation compacts and loses earlier messages, the mode state persists. Claude stays in `feature-dev` until tests pass.

### Escape Hatches

Sometimes you need to override the workflow. The slash commands let you intervene:

- `/modes:mode` - Check current mode and available transitions
- `/modes:mode <name>` - Force transition to a specific mode (requires approval)
- `/modes:mode reset` - Return to the default mode

Force transitions require explicit approval because they bypass the constraint system. This is intentional - the workflow should guide normal operation, with manual overrides as the exception.

### Status Line

You can display the current mode in Claude Code's status line - similar to how terminal prompts show the git branch. This gives you constant visibility into which mode is active.

When configured, you'll see something like `⟪test-dev⟫` at the bottom of Claude Code.

To set this up, run `/modes:setup` and opt in when asked about the status line. Or manually:

1. Copy the script:
```bash
cp ~/.claude/plugins/modes/examples/statusline/modes-statusline.sh ~/.claude/
chmod +x ~/.claude/modes-statusline.sh
```

2. Add to `~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/modes-statusline.sh"
  }
}
```

The status line updates automatically when you transition between modes.

## Example Workflows

The `examples/` directory includes a TDD workflow. Here are other workflows where modes shine:

### Test-Driven Development

**The problem:** Claude jumps straight to implementation, or modifies tests while "fixing" bugs.

**Why modes help:** Separate `test-dev` and `feature-dev` phases with file permissions. Claude literally cannot edit source files until a failing test exists, and cannot touch tests while implementing. The red-green-refactor cycle becomes the only path forward.

### Design-First Development

**The problem:** Claude starts coding before design decisions are documented and approved.

**Why modes help:** A `design` mode that only allows editing docs/design files. The transition constraint requires design approval before moving to implementation. Claude can explore and prototype in design mode, but can't ship code until the approach is locked in.

### Bug Triage

**The problem:** Claude attempts fixes without first reproducing and diagnosing the issue.

**Why modes help:** A `reproduce` → `diagnose` → `fix` workflow. In `reproduce` mode, Claude can only read code and run tests - no edits allowed. It must demonstrate the bug exists before moving on. In `diagnose` mode, it documents the root cause before `fix` mode unlocks editing.

### Refactoring

**The problem:** Claude makes changes without ensuring tests pass before and after.

**Why modes help:** A `verify-green` → `refactor` → `verify-green` cycle. The first phase confirms tests pass (constraint: "all tests passing"). Refactoring mode allows edits but the transition back requires tests to pass again. No refactor can leave tests broken.

### Security-Sensitive Changes

**The problem:** Claude modifies auth, crypto, or other sensitive code without proper review.

**Why modes help:** Permissions can restrict which files are editable in each mode. A `security-review` mode might allow reading sensitive files but require explicit user approval (via forced transition) before entering a mode that can edit them.

## Best Practices

### Keep your base permissions open

Your project's base `settings.json` permissions are always enforced - mode permissions can only add restrictions, not remove them. If your base settings deny `Write(src/**)`, no mode can override that.

This means your base permissions should generally be permissive. Let modes handle the restrictions for specific workflow phases.

### Start with transitions, add permissions later

You don't need permissions to get value from modes. Start with just `modes.yaml` - the transition constraints alone help Claude follow your workflow. Add `settings.<mode>.json` files later if you find Claude needs harder guardrails.

### Write constraints for Claude, not for you

Constraints are shown to Claude to help it decide when to transition. Write them as clear conditions Claude can evaluate:

```yaml
# Good - Claude can check this
constraint: A failing test exists that covers the bug

# Less good - vague, hard to evaluate
constraint: Ready to implement
```

### Mode instructions should focus, not repeat

`CLAUDE.<mode>.md` files work best when they focus Claude's attention on the current phase. Don't repeat everything from your root `CLAUDE.md` - mode instructions are additive.

```markdown
<!-- Good - focused on this phase -->
You are writing a failing test. Focus on the expected behavior.
Do NOT modify implementation code yet.

<!-- Less good - restating general practices -->
You are writing a failing test. Follow our coding standards.
Use TypeScript. Write clean code. Add comments...
```

### Design for how you actually work

Don't copy a workflow verbatim - adapt it to your actual process. If you sometimes skip writing tests for trivial changes, maybe your constraint should be "User has described a bug or feature that warrants a test" rather than requiring tests for everything.
