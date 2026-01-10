import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn, ChildProcess } from "child_process";

/**
 * Helper to communicate with MCP server over stdio using newline-delimited JSON-RPC.
 */
class McpClient {
  private process: ChildProcess;
  private buffer = "";
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(process: ChildProcess) {
    this.process = process;

    process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    process.stderr?.on("data", (data: Buffer) => {
      // Suppress stderr in tests
    });
  }

  private processBuffer(): void {
    // MCP over stdio uses newline-delimited JSON
    const lines = this.buffer.split("\n");

    // Process complete lines (keep incomplete last line in buffer)
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        if ("id" in message && this.pendingRequests.has(message.id)) {
          const pending = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          if ("error" in message) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin?.write(JSON.stringify(message) + "\n");
    });
  }

  close(): void {
    this.process.kill();
  }
}

describe("MCP Server E2E", () => {
  let tempDir: string;
  let mcpProcess: ChildProcess;
  let client: McpClient;

  const modesYaml = `
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: test-dev
        constraint: User described a bug
  test-dev:
    transitions:
      - to: feature-dev
        constraint: Test is failing
      - to: idle
        constraint: User cancelled
  feature-dev:
    transitions:
      - to: idle
        constraint: Tests pass
`;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-server-e2e-"));

    // Create modes.yaml
    fs.writeFileSync(path.join(tempDir, "modes.yaml"), modesYaml);

    // Start combined server (handles both MCP and HTTP)
    const serverPath = path.join(__dirname, "../../dist/combined-server.js");
    mcpProcess = spawn("node", [serverPath], {
      env: { ...process.env, CLAUDE_MODES_CONFIG_DIR: tempDir },
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = new McpClient(mcpProcess);

    // Wait for server to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Initialize MCP connection
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
  });

  afterEach(() => {
    client?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("tools/list", () => {
    it("lists mode_status tool", async () => {
      const result = (await client.request("tools/list")) as {
        tools: Array<{ name: string }>;
      };

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("mode_status");
    });

    it("lists mode_transition tool", async () => {
      const result = (await client.request("tools/list")) as {
        tools: Array<{ name: string }>;
      };

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("mode_transition");
    });

    it("lists mode_force_transition tool", async () => {
      const result = (await client.request("tools/list")) as {
        tools: Array<{ name: string }>;
      };

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("mode_force_transition");
    });

    it("mode_transition has required parameters", async () => {
      const result = (await client.request("tools/list")) as {
        tools: Array<{ name: string; inputSchema: { required?: string[] } }>;
      };

      const tool = result.tools.find((t) => t.name === "mode_transition");
      expect(tool?.inputSchema.required).toContain("target_mode");
      expect(tool?.inputSchema.required).toContain("explanation");
    });

    it("mode_force_transition has required parameters", async () => {
      const result = (await client.request("tools/list")) as {
        tools: Array<{ name: string; inputSchema: { required?: string[] } }>;
      };

      const tool = result.tools.find((t) => t.name === "mode_force_transition");
      expect(tool?.inputSchema.required).toContain("target_mode");
    });
  });

  describe("tools/call mode_status", () => {
    it("returns current mode", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_status",
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> };

      const text = result.content[0].text;
      const status = JSON.parse(text);
      expect(status.current_mode).toBe("idle");
    });

    it("returns available transitions", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_status",
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> };

      const text = result.content[0].text;
      const status = JSON.parse(text);
      expect(status.available_transitions).toHaveLength(1);
      expect(status.available_transitions[0].to).toBe("test-dev");
    });

    it("includes transition constraints", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_status",
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> };

      const text = result.content[0].text;
      const status = JSON.parse(text);
      expect(status.available_transitions[0].constraint).toBe(
        "User described a bug"
      );
    });
  });

  describe("tools/call mode_transition", () => {
    it("succeeds for valid transition with explanation", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_transition",
        arguments: {
          target_mode: "test-dev",
          explanation: "User described a login bug",
        },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.new_state).toBe("test-dev");
    });

    it("fails for invalid transition", async () => {
      // From idle, cannot go directly to feature-dev
      const result = (await client.request("tools/call", {
        name: "mode_transition",
        arguments: {
          target_mode: "feature-dev",
          explanation: "Trying to skip ahead",
        },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it("fails for non-existent mode", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_transition",
        arguments: {
          target_mode: "nonexistent",
          explanation: "Testing",
        },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.reason).toContain("nonexistent");
    });

    it("records transition in history", async () => {
      await client.request("tools/call", {
        name: "mode_transition",
        arguments: {
          target_mode: "test-dev",
          explanation: "Starting TDD",
        },
      });

      const statusResult = (await client.request("tools/call", {
        name: "mode_status",
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> };

      const status = JSON.parse(statusResult.content[0].text);
      expect(status.history).toHaveLength(1);
      expect(status.history[0].from).toBe("idle");
      expect(status.history[0].to).toBe("test-dev");
      expect(status.history[0].explanation).toBe("Starting TDD");
    });
  });

  describe("tools/call mode_force_transition", () => {
    it("can bypass constraint rules", async () => {
      // From idle, force directly to feature-dev (normally not allowed)
      const result = (await client.request("tools/call", {
        name: "mode_force_transition",
        arguments: { target_mode: "feature-dev" },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.new_mode).toBe("feature-dev");
    });

    it("fails for non-existent mode", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_force_transition",
        arguments: { target_mode: "nonexistent" },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it("fails when already in target mode", async () => {
      const result = (await client.request("tools/call", {
        name: "mode_force_transition",
        arguments: { target_mode: "idle" },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.reason.toLowerCase()).toContain("already");
    });

    it("records forced transition in history", async () => {
      await client.request("tools/call", {
        name: "mode_force_transition",
        arguments: { target_mode: "feature-dev" },
      });

      const statusResult = (await client.request("tools/call", {
        name: "mode_status",
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> };

      const status = JSON.parse(statusResult.content[0].text);
      expect(status.history).toHaveLength(1);
      expect(status.history[0].explanation.toLowerCase()).toContain("forced");
    });
  });
});
