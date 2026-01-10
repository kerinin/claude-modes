import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { loadAllConfig } from "./config-loader.js";
import { renderContext } from "./context-renderer.js";
import { checkToolPermission, formatHookResponse } from "./permission-checker.js";
import {
  WorkflowConfig,
  LoadedModeConfig,
  ContextData,
  ToolCheckInput,
  ModeStatus,
  TransitionHistoryEntry,
} from "./types.js";

export interface ServerOptions {
  socketPath: string;
  configDir: string;
}

export interface ModeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

interface StateFile {
  currentMode: string;
  history: TransitionHistoryEntry[];
}

/**
 * Create the HTTP server that handles hook requests over Unix socket.
 * This is the "imperative shell" - all I/O happens here.
 */
export function createServer(options: ServerOptions): ModeServer {
  const { socketPath, configDir } = options;

  let server: http.Server | null = null;
  let running = false;

  // Loaded at startup
  let config: WorkflowConfig | null = null;
  let modeConfigs: Record<string, LoadedModeConfig> = {};

  // State file path
  const stateFilePath = path.join(configDir, "mode-state.json");

  /**
   * Read current state from file, or return default state.
   */
  function readState(): StateFile {
    if (!config) {
      return { currentMode: "idle", history: [] };
    }

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

  /**
   * Write state to file atomically.
   */
  function writeState(state: StateFile): void {
    const tempPath = `${stateFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, stateFilePath);
  }

  /**
   * Get context data for current mode.
   */
  function getContextData(): ContextData | null {
    if (!config) return null;

    const state = readState();
    const currentMode = state.currentMode;
    const modeConfig = modeConfigs[currentMode] || { instructions: null, permissions: null };
    const stateConfig = config.states[currentMode];

    return {
      currentMode,
      instructions: modeConfig.instructions,
      permissions: modeConfig.permissions,
      transitions: stateConfig?.transitions || [],
    };
  }

  /**
   * Get status for current mode.
   */
  function getStatus(): ModeStatus {
    const state = readState();
    const lastEntry = state.history[state.history.length - 1];
    const stateConfig = config?.states[state.currentMode];

    return {
      currentMode: state.currentMode,
      initialMode: config?.initial || "idle",
      lastTransition: lastEntry?.timestamp || null,
      transitionHistory: state.history.slice(-10), // Last 10 entries
      availableTransitions: stateConfig?.transitions || [],
    };
  }

  /**
   * Force transition to a mode (bypasses constraints).
   */
  function forceTransition(targetMode: string): { success: boolean; error?: string } {
    if (!config) {
      return { success: false, error: "Config not loaded" };
    }

    if (!config.states[targetMode]) {
      return { success: false, error: `Mode '${targetMode}' does not exist` };
    }

    const state = readState();
    const fromMode = state.currentMode;

    state.history.push({
      from: fromMode,
      to: targetMode,
      timestamp: new Date().toISOString(),
      explanation: "Forced transition via /mode command",
    });
    state.currentMode = targetMode;

    writeState(state);
    return { success: true };
  }

  /**
   * Reset to initial mode.
   */
  function reset(): void {
    if (!config) return;

    const state: StateFile = {
      currentMode: config.initial,
      history: [],
    };
    writeState(state);
  }

  /**
   * Handle incoming HTTP requests.
   */
  function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const url = req.url || "/";
    const method = req.method || "GET";

    // Set JSON content type for all responses
    res.setHeader("Content-Type", "application/json");

    // Route: GET /context
    if (method === "GET" && url === "/context") {
      const contextData = getContextData();
      const rendered = renderContext(contextData);
      res.writeHead(200);
      res.end(rendered);
      return;
    }

    // Route: POST /check-tool
    if (method === "POST" && url === "/check-tool") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const input = JSON.parse(body) as ToolCheckInput;
          const state = readState();
          const modeConfig = modeConfigs[state.currentMode];
          const result = checkToolPermission(input, modeConfig?.permissions || null);
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

    // Route: GET /status
    if (method === "GET" && url === "/status") {
      const status = getStatus();
      res.writeHead(200);
      res.end(JSON.stringify(status));
      return;
    }

    // Route: POST /force-transition
    if (method === "POST" && url === "/force-transition") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { target_mode } = JSON.parse(body) as { target_mode: string };
          const result = forceTransition(target_mode);
          if (result.success) {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, new_mode: target_mode }));
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: result.error }));
          }
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    // Route: POST /reset
    if (method === "POST" && url === "/reset") {
      reset();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, mode: config?.initial }));
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
  }

  return {
    async start() {
      // Remove stale socket file
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }

      // Load config
      const configResult = loadAllConfig(configDir);
      if (!configResult.success) {
        throw new Error(`Failed to load config: ${configResult.error}`);
      }

      config = configResult.config;
      modeConfigs = configResult.modeConfigs;

      // Create and start server
      server = http.createServer(handleRequest);

      await new Promise<void>((resolve, reject) => {
        server!.on("error", reject);
        server!.listen(socketPath, () => {
          running = true;
          resolve();
        });
      });
    },

    async stop() {
      if (server) {
        await new Promise<void>((resolve) => {
          server!.close(() => {
            running = false;
            server = null;

            // Clean up socket file
            if (fs.existsSync(socketPath)) {
              fs.unlinkSync(socketPath);
            }

            resolve();
          });
        });
      }
    },

    isRunning() {
      return running;
    },
  };
}
