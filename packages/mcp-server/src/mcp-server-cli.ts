#!/usr/bin/env node

import * as path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAllConfig } from "./config-loader.js";
import { modeStatus, modeForceTransition } from "./mcp-tools.js";
import { executeTransition } from "./transition.js";
import { WorkflowConfig } from "./types.js";

async function main() {
  const configDir =
    process.env.CLAUDE_MODES_CONFIG_DIR || path.join(process.cwd(), ".claude");
  const stateFilePath = path.join(configDir, "mode-state.json");

  // Load config
  const configResult = loadAllConfig(configDir);
  if (!configResult.success) {
    console.error(`Failed to load config: ${configResult.error}`);
    process.exit(1);
  }
  const config: WorkflowConfig = configResult.config;

  // Create MCP server
  const server = new Server(
    { name: "claude-modes", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "mode_status",
          description:
            "Get current mode, available transitions, and recent history",
          inputSchema: {
            type: "object" as const,
            properties: {},
          },
        },
        {
          name: "mode_transition",
          description:
            "Transition to a new mode. Only transitions defined in modes.yaml are allowed.",
          inputSchema: {
            type: "object" as const,
            properties: {
              target_mode: {
                type: "string",
                description: "Mode to transition to",
              },
              explanation: {
                type: "string",
                description: "Why the transition constraint is satisfied",
              },
            },
            required: ["target_mode", "explanation"],
          },
        },
        {
          name: "mode_force_transition",
          description:
            "Force transition to any mode, bypassing constraint checks. For user overrides only.",
          inputSchema: {
            type: "object" as const,
            properties: {
              target_mode: {
                type: "string",
                description: "Mode to transition to",
              },
            },
            required: ["target_mode"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "mode_status": {
        const result = modeStatus(stateFilePath, config);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mode_transition": {
        const targetMode = (args as Record<string, unknown>)
          ?.target_mode as string;
        const explanation = (args as Record<string, unknown>)
          ?.explanation as string;
        const result = executeTransition(
          { target_state: targetMode, explanation },
          stateFilePath,
          config
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      }

      case "mode_force_transition": {
        const targetMode = (args as Record<string, unknown>)
          ?.target_mode as string;
        const result = modeForceTransition(
          { target_mode: targetMode },
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

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
