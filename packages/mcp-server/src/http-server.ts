import { createServer, Server } from "node:http";
import { ConfigLoader } from "./config.js";
import { StateManager } from "./state.js";

export class HttpServer {
  private config: ConfigLoader;
  private state: StateManager;
  private server: Server | null = null;

  constructor(config: ConfigLoader, state: StateManager) {
    this.config = config;
    this.state = state;
  }

  async start(socketPath: string): Promise<void> {
    // TODO: Remove existing socket file if present
    // TODO: Create HTTP server listening on Unix socket

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // TODO: Listen on socketPath
  }

  private handleRequest(req: any, res: any): void {
    const url = req.url;
    const method = req.method;

    // Route to handlers
    if (method === "GET" && url === "/context") {
      this.handleGetContext(req, res);
    } else if (method === "POST" && url === "/check-tool") {
      this.handleCheckTool(req, res);
    } else if (method === "GET" && url === "/status") {
      this.handleGetStatus(req, res);
    } else if (method === "POST" && url === "/force-transition") {
      this.handleForceTransition(req, res);
    } else if (method === "POST" && url === "/reset") {
      this.handleReset(req, res);
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  }

  private handleGetContext(req: any, res: any): void {
    // TODO: Return current mode context for injection into Claude's context
  }

  private handleCheckTool(req: any, res: any): void {
    // TODO: Check if tool is allowed in current mode
  }

  private handleGetStatus(req: any, res: any): void {
    // TODO: Return human-readable status for /mode command
  }

  private handleForceTransition(req: any, res: any): void {
    // TODO: Force transition without constraint check
  }

  private handleReset(req: any, res: any): void {
    // TODO: Reset to default mode
  }

  async stop(): Promise<void> {
    // TODO: Close server and clean up socket file
  }
}
