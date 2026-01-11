# Claude Modes Development

## Project Structure

```
claude-modes/
├── .claude-plugin/
│   └── plugin.json     # Plugin manifest
├── commands/           # Slash commands
├── hooks/              # Hook configurations
├── server/
│   └── bundle.cjs      # Bundled server for distribution
├── src/                # Server source code
├── examples/           # Example mode configurations
└── docs/
    └── design.md       # Architecture documentation
```

## Design Document

**Read `docs/design.md` before making significant changes.** It contains:
- Architecture overview and component relationships
- MCP tool specifications (status, transition, force_transition)
- Hook configurations and context injection format
- Implementation roadmap and remaining work

## After Making Changes

Update `docs/design.md` if you:
- Add, remove, or rename MCP tools
- Change the plugin structure
- Modify hook behavior or context format
- Complete roadmap items

## Build Commands

```bash
npm run build      # Compile TypeScript
npm run bundle     # Build + bundle to server/bundle.cjs
npm test           # Run tests
```

## Key Files

| File | Purpose |
|------|---------|
| `src/combined-server.ts` | Main server (MCP + HTTP) |
| `src/config-loader.ts` | Load modes.yaml and mode configs |
| `src/context-renderer.ts` | Render context for UserPromptSubmit hook |
| `src/permission-checker.ts` | Check permissions for PreToolUse hook |
| `.claude-plugin/plugin.json` | Plugin manifest |
| `hooks/hooks.json` | Hook configurations |
