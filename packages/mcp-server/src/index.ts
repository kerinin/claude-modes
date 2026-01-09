#!/usr/bin/env node

import { ConfigLoader } from "./config.js";
import { StateManager } from "./state.js";
import { HttpServer } from "./http-server.js";
import { McpServer } from "./mcp-server.js";

async function main() {
  // TODO: Parse CLI args (--socket path)
  const socketPath = process.argv[2] || ".claude/mode.sock";

  // Load configuration
  const config = new ConfigLoader();
  await config.load();

  // Initialize state manager
  const state = new StateManager(config);
  await state.load();

  // Start HTTP server for hooks
  const httpServer = new HttpServer(config, state);
  await httpServer.start(socketPath);

  // Start MCP server for tool exposure
  const mcpServer = new McpServer(config, state);
  await mcpServer.start();
}

main().catch(console.error);
