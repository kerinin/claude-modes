# Claude Modes Development

## Project Structure

```
packages/
├── modes/           # Plugin (distributed to users)
│   ├── plugin.json
│   ├── server/bundle.cjs
│   ├── commands/
│   ├── hooks/
│   └── examples/
│
└── modes-server/    # MCP server source code
    └── src/
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
# In packages/modes-server/
npm run build      # Compile TypeScript
npm run bundle     # Build + bundle to ../modes/server/bundle.cjs
npm test           # Run tests
```

## Key Files

| File | Purpose |
|------|---------|
| `modes-server/src/combined-server.ts` | Main server (MCP + HTTP) |
| `modes-server/src/config-loader.ts` | Load modes.yaml and mode configs |
| `modes-server/src/context-renderer.ts` | Render context for UserPromptSubmit hook |
| `modes-server/src/permission-checker.ts` | Check permissions for PreToolUse hook |
| `modes/plugin.json` | Plugin manifest |
| `modes/hooks/hooks.json` | Hook configurations |
