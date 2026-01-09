import * as http from "http";
import * as fs from "fs";

export interface ServerOptions {
  socketPath: string;
  configDir: string;
}

export interface ModeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Create the HTTP server that handles hook requests over Unix socket.
 */
export function createServer(options: ServerOptions): ModeServer {
  // TODO: Implement server
  let server: http.Server | null = null;
  let running = false;

  return {
    async start() {
      // TODO: Implement server startup
      throw new Error("Not implemented");
    },
    async stop() {
      // TODO: Implement server shutdown
      throw new Error("Not implemented");
    },
    isRunning() {
      return running;
    },
  };
}
