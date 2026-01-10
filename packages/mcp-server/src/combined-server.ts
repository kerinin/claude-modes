#!/usr/bin/env node

/**
 * Combined server that handles both:
 * - MCP tools via stdio (for Claude to call)
 * - HTTP API via Unix socket (for hooks)
 *
 * This ensures shared config/state and eliminates race conditions.
 */

import * as path from "path";
import * as http from "http";
import * as fs from "fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAllConfig } from "./config-loader.js";
import { renderContext } from "./context-renderer.js";
import { checkToolPermission, formatHookResponse } from "./permission-checker.js";
import { modeStatus, modeForceTransition } from "./mcp-tools.js";
import { executeTransition } from "./transition.js";
import {
  WorkflowConfig,
  LoadedModeConfig,
  ToolCheckInput,
  TransitionHistoryEntry,
} from "./types.js";

interface StateFile {
  currentMode: string;
  history: TransitionHistoryEntry[];
}

async function main() {
  const configDir =
    process.env.CLAUDE_MODES_CONFIG_DIR || path.join(process.cwd(), ".claude");
  const socketPath =
    process.env.CLAUDE_MODES_SOCKET || path.join(configDir, "mode.sock");
  const stateFilePath = path.join(configDir, "mode-state.json");

  // Load config once, shared by both servers
  const configResult = loadAllConfig(configDir);
  if (!configResult.success) {
    console.error(`Failed to load config: ${configResult.error}`);
    process.exit(1);
  }

  const config: WorkflowConfig = configResult.config;
  const modeConfigs: Record<string, LoadedModeConfig> = configResult.modeConfigs;

  // --- State helpers (shared) ---

  function readState(): StateFile {
    try {
      if (fs.existsSync(stateFilePath)) {
        const content = fs.readFileSync(stateFilePath, "utf-8");
        return JSON.parse(content) as StateFile;
      }
    } catch {
      // Ignore errors, return default
    }
    return { currentMode: config.initial, history: [] };
  }

  // --- HTTP Server for hooks ---

  function startHttpServer(): Promise<http.Server> {
    // Remove stale socket file
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    const httpServer = http.createServer((req, res) => {
      const url = req.url || "/";
      const method = req.method || "GET";

      res.setHeader("Content-Type", "application/json");

      // GET /context - for UserPromptSubmit hook
      if (method === "GET" && url === "/context") {
        const state = readState();
        const currentMode = state.currentMode;
        const modeConfig = modeConfigs[currentMode] || {
          instructions: null,
          permissions: null,
        };
        const stateConfig = config.states[currentMode];

        const contextData = {
          currentMode,
          instructions: modeConfig.instructions,
          permissions: modeConfig.permissions,
          transitions: stateConfig?.transitions || [],
        };

        const rendered = renderContext(contextData);
        res.writeHead(200);
        res.end(rendered);
        return;
      }

      // POST /check-tool - for PreToolUse hook
      if (method === "POST" && url === "/check-tool") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const input = JSON.parse(body) as ToolCheckInput;
            const state = readState();
            const modeConfig = modeConfigs[state.currentMode];
            const result = checkToolPermission(
              input,
              modeConfig?.permissions || null
            );
            const response = formatHookResponse(result);
            res.writeHead(200);
            res.end(JSON.stringify(response));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }

      // Unknown route
      if (!["GET", "POST"].includes(method)) {
        res.writeHead(405);
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    });

    return new Promise((resolve, reject) => {
      httpServer.on("error", reject);
      httpServer.listen(socketPath, () => {
        resolve(httpServer);
      });
    });
  }

  // --- MCP Server for tools ---

  function startMcpServer(): Server {
    const server = new Server(
      { name: "modes", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "status",
            description:
              "Get current mode, available transitions, and recent history",
            inputSchema: {
              type: "object" as const,
              properties: {},
            },
          },
          {
            name: "transition",
            description:
              "Transition to a new mode. Only transitions defined in modes.yaml are allowed.",
            inputSchema: {
              type: "object" as const,
              properties: {
                target: {
                  type: "string",
                  description: "Mode to transition to",
                },
                explanation: {
                  type: "string",
                  description: "Why the transition constraint is satisfied",
                },
              },
              required: ["target", "explanation"],
            },
          },
          {
            name: "force_transition",
            description:
              "Force transition to any mode, bypassing constraint checks. For user overrides only.",
            inputSchema: {
              type: "object" as const,
              properties: {
                target: {
                  type: "string",
                  description: "Mode to transition to",
                },
              },
              required: ["target"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "status": {
          const result = modeStatus(stateFilePath, config);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "transition": {
          const target = (args as Record<string, unknown>)?.target as string;
          const explanation = (args as Record<string, unknown>)
            ?.explanation as string;
          const result = executeTransition(
            { target_state: target, explanation },
            stateFilePath,
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: !result.success,
          };
        }

        case "force_transition": {
          const target = (args as Record<string, unknown>)?.target as string;
          const result = modeForceTransition(
            { target_mode: target },
            stateFilePath,
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: !result.success,
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    });

    return server;
  }

  // --- Start both servers ---

  // Start HTTP server for hooks
  const httpServer = await startHttpServer();
  console.error(`HTTP server listening on ${socketPath}`);

  // Start MCP server for tools
  const mcpServer = startMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("MCP server connected via stdio");

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error("\nShutting down...");
    httpServer.close();
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
