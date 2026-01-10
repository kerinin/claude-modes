import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigLoader } from "./config.js";
import { StateManager } from "./state.js";

export class McpServer {
  private config: ConfigLoader;
  private state: StateManager;
  private server: Server | null = null;

  constructor(config: ConfigLoader, state: StateManager) {
    this.config = config;
    this.state = state;
  }

  async start(): Promise<void> {
    this.server = new Server(
      { name: "claude-modes", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );

    this.registerTools();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  private registerTools(): void {
    if (!this.server) return;

    // TODO: Register mode_transition tool
    this.server.setRequestHandler(
      // ListToolsRequestSchema
      {} as any,
      async () => {
        return {
          tools: [
            {
              name: "mode_transition",
              description: "Transition to a new mode",
              inputSchema: {
                type: "object",
                properties: {
                  target_mode: {
                    type: "string",
                    description: "Mode to transition to",
                  },
                  explanation: {
                    type: "string",
                    description: "Why this transition is justified",
                  },
                },
                required: ["target_mode", "explanation"],
              },
            },
          ],
        };
      }
    );

    // TODO: Register tool call handler
  }

  private async handleModeTransition(
    targetMode: string,
    explanation: string
  ): Promise<{ success: boolean; new_mode?: string; reason?: string }> {
    // TODO: Validate transition is allowed from current mode
    // TODO: Update state
    // TODO: Return result
    return { success: false, reason: "Not implemented" };
  }
}
