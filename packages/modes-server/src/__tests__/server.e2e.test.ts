import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, ModeServer } from "../server.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as http from "http";

// Helper to make HTTP requests over Unix socket
function request(
  socketPath: string,
  method: string,
  path: string,
  body?: object
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to parse JSON response
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

describe("Mode Server E2E", () => {
  let tempDir: string;
  let socketPath: string;
  let server: ModeServer;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mode-server-e2e-"));
    socketPath = path.join(tempDir, "mode.sock");

    // Create a valid modes.yaml config
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
    fs.writeFileSync(path.join(tempDir, "modes.yaml"), modesYaml);

    // Create mode-specific configs
    fs.writeFileSync(
      path.join(tempDir, "CLAUDE.test-dev.md"),
      "You are writing tests. Do not modify src/."
    );
    fs.writeFileSync(
      path.join(tempDir, "settings.test-dev.json"),
      JSON.stringify({
        permissions: {
          allow: ["Read(**)", "Write(test/**)"],
          deny: ["Write(src/**)", "Edit(src/**)"],
        },
      })
    );

    server = createServer({ socketPath, configDir: tempDir });
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("server lifecycle", () => {
    it("starts and binds to Unix socket", async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
      expect(fs.existsSync(socketPath)).toBe(true);
    });

    it("stops and cleans up socket", async () => {
      await server.start();
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it("handles multiple start/stop cycles", async () => {
      await server.start();
      await server.stop();
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it("removes stale socket file on start", async () => {
      // Create a stale socket file
      fs.writeFileSync(socketPath, "stale");
      await server.start();
      expect(server.isRunning()).toBe(true);
    });
  });

  describe("GET /context", () => {
    it("returns current mode context", async () => {
      await server.start();

      const res = await request(socketPath, "GET", "/context");
      expect(res.status).toBe(200);
      expect(res.body).toContain("idle"); // Current mode
    });

    it("includes available transitions", async () => {
      await server.start();

      const res = await request(socketPath, "GET", "/context");
      expect(res.status).toBe(200);
      expect(res.body).toContain("test-dev"); // Available transition
    });

    it("includes transition constraints", async () => {
      await server.start();

      const res = await request(socketPath, "GET", "/context");
      expect(res.status).toBe(200);
      expect(res.body).toContain("User described a bug");
    });

    it("includes mode instructions when available", async () => {
      // Set state to test-dev which has instructions
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(
        path.join(tempDir, "mode-state.json"),
        JSON.stringify(state)
      );

      await server.start();

      const res = await request(socketPath, "GET", "/context");
      expect(res.status).toBe(200);
      expect(res.body).toContain("writing tests");
    });
  });

  describe("POST /check-tool", () => {
    it("returns allow for permitted tool", async () => {
      // Set state to test-dev
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(
        path.join(tempDir, "mode-state.json"),
        JSON.stringify(state)
      );

      await server.start();

      const res = await request(socketPath, "POST", "/check-tool", {
        tool_name: "Read",
        tool_input: { file_path: "/project/src/foo.ts" },
      });

      expect(res.status).toBe(200);
      const body = parseJson(res.body) as { hookSpecificOutput?: { permissionDecision: string } };
      expect(body?.hookSpecificOutput?.permissionDecision).toBe("allow");
    });

    it("returns deny for blocked tool", async () => {
      // Set state to test-dev which blocks Write(src/**)
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(
        path.join(tempDir, "mode-state.json"),
        JSON.stringify(state)
      );

      await server.start();

      const res = await request(socketPath, "POST", "/check-tool", {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/foo.ts", content: "..." },
      });

      expect(res.status).toBe(200);
      const body = parseJson(res.body) as { hookSpecificOutput?: { permissionDecision: string } };
      expect(body?.hookSpecificOutput?.permissionDecision).toBe("deny");
    });

    it("returns pass for unconfigured mode", async () => {
      // idle mode has no permissions configured
      await server.start();

      const res = await request(socketPath, "POST", "/check-tool", {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/foo.ts", content: "..." },
      });

      expect(res.status).toBe(200);
      const body = parseJson(res.body) as { hookSpecificOutput?: unknown };
      // Pass means no hookSpecificOutput
      expect(body?.hookSpecificOutput).toBeUndefined();
    });

    it("handles invalid JSON body", async () => {
      await server.start();

      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          { socketPath, path: "/check-tool", method: "POST" },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
          }
        );
        req.on("error", reject);
        req.write("{ invalid json }");
        req.end();
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /status", () => {
    it("returns current mode status", async () => {
      await server.start();

      const res = await request(socketPath, "GET", "/status");
      expect(res.status).toBe(200);

      const body = parseJson(res.body) as { currentMode?: string };
      expect(body?.currentMode).toBe("idle");
    });

    it("includes transition history", async () => {
      const state = {
        currentMode: "test-dev",
        history: [
          {
            from: "idle",
            to: "test-dev",
            timestamp: "2024-01-15T10:00:00.000Z",
            explanation: "Starting TDD",
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempDir, "mode-state.json"),
        JSON.stringify(state)
      );

      await server.start();

      const res = await request(socketPath, "GET", "/status");
      expect(res.status).toBe(200);

      const body = parseJson(res.body) as { transitionHistory?: unknown[] };
      expect(body?.transitionHistory).toHaveLength(1);
    });

    it("includes available transitions", async () => {
      await server.start();

      const res = await request(socketPath, "GET", "/status");
      expect(res.status).toBe(200);
      expect(res.body).toContain("test-dev");
    });
  });

  describe("POST /force-transition", () => {
    it("transitions to valid mode", async () => {
      await server.start();

      const res = await request(socketPath, "POST", "/force-transition", {
        target_mode: "feature-dev",
      });

      expect(res.status).toBe(200);

      // Verify state changed
      const state = JSON.parse(
        fs.readFileSync(path.join(tempDir, "mode-state.json"), "utf-8")
      );
      expect(state.currentMode).toBe("feature-dev");
    });

    it("rejects invalid mode", async () => {
      await server.start();

      const res = await request(socketPath, "POST", "/force-transition", {
        target_mode: "nonexistent",
      });

      expect(res.status).toBe(400);
    });

    it("records forced transition in history", async () => {
      await server.start();

      await request(socketPath, "POST", "/force-transition", {
        target_mode: "test-dev",
      });

      const state = JSON.parse(
        fs.readFileSync(path.join(tempDir, "mode-state.json"), "utf-8")
      );
      expect(state.history).toHaveLength(1);
      expect(state.history[0].explanation).toMatch(/forced|manual/i);
    });
  });

  describe("POST /reset", () => {
    it("resets to default mode", async () => {
      // Start in non-default mode
      const state = { currentMode: "feature-dev", history: [] };
      fs.writeFileSync(
        path.join(tempDir, "mode-state.json"),
        JSON.stringify(state)
      );

      await server.start();

      const res = await request(socketPath, "POST", "/reset");
      expect(res.status).toBe(200);

      // Verify state reset
      const newState = JSON.parse(
        fs.readFileSync(path.join(tempDir, "mode-state.json"), "utf-8")
      );
      expect(newState.currentMode).toBe("idle");
    });

    it("clears transition history", async () => {
      const state = {
        currentMode: "feature-dev",
        history: [{ from: "idle", to: "feature-dev", timestamp: "...", explanation: "..." }],
      };
      fs.writeFileSync(
        path.join(tempDir, "mode-state.json"),
        JSON.stringify(state)
      );

      await server.start();

      await request(socketPath, "POST", "/reset");

      const newState = JSON.parse(
        fs.readFileSync(path.join(tempDir, "mode-state.json"), "utf-8")
      );
      expect(newState.history).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("returns 404 for unknown routes", async () => {
      await server.start();

      const res = await request(socketPath, "GET", "/unknown");
      expect(res.status).toBe(404);
    });

    it("returns 405 for wrong HTTP method", async () => {
      await server.start();

      const res = await request(socketPath, "DELETE", "/context");
      expect(res.status).toBe(405);
    });

    it("handles missing config gracefully", async () => {
      // Remove the modes.yaml
      fs.unlinkSync(path.join(tempDir, "modes.yaml"));

      // Server should fail to start or return error on requests
      try {
        await server.start();
        // If server starts, requests should return error
        const res = await request(socketPath, "GET", "/context");
        expect(res.status).toBeGreaterThanOrEqual(500);
      } catch (e) {
        // Expected - server failed to start
        expect(e).toBeDefined();
      }
    });
  });

  describe("concurrent requests", () => {
    it("handles multiple simultaneous requests", async () => {
      await server.start();

      const requests = Array.from({ length: 10 }, () =>
        request(socketPath, "GET", "/status")
      );

      const results = await Promise.all(requests);
      results.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });
  });
});
