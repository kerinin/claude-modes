#!/usr/bin/env node

import * as path from "path";
import { createServer } from "./server.js";

async function main() {
  // Config directory - defaults to .claude in current working directory
  const configDir = process.env.CLAUDE_MODES_CONFIG_DIR || path.join(process.cwd(), ".claude");

  // Socket path - defaults to .claude/mode.sock
  const socketPath = process.env.CLAUDE_MODES_SOCKET || process.argv[2] || path.join(configDir, "mode.sock");

  console.log(`Starting Claude Modes server...`);
  console.log(`  Config dir: ${configDir}`);
  console.log(`  Socket: ${socketPath}`);

  const server = createServer({
    configDir,
    socketPath,
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.stop();
    process.exit(0);
  });

  await server.start();
  console.log(`Server listening on ${socketPath}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
