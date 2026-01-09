import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleModeCommand } from "../slash-command.js";
import { WorkflowConfig } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("handleModeCommand", () => {
  let tempDir: string;
  let stateFilePath: string;

  const testConfig: WorkflowConfig = {
    initial: "idle",
    states: {
      idle: {
        name: "idle",
        transitions: [{ to: "test-dev", constraint: "User described a bug" }],
      },
      "test-dev": {
        name: "test-dev",
        transitions: [
          { to: "feature-dev", constraint: "Test is failing" },
          { to: "idle", constraint: "User cancelled" },
        ],
      },
      "feature-dev": {
        name: "feature-dev",
        transitions: [{ to: "idle", constraint: "Tests pass" }],
      },
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mode-slash-test-"));
    stateFilePath = path.join(tempDir, "mode-state.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("command parsing", () => {
    it("/mode (no args) returns current status", () => {
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("", stateFilePath, testConfig);
      expect(result.success).toBe(true);
      expect(result.output).toContain("test-dev");
    });

    it("/mode status returns current status", () => {
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("status", stateFilePath, testConfig);
      expect(result.success).toBe(true);
      expect(result.output).toContain("test-dev");
    });

    it("/mode reset resets to initial state", () => {
      const state = {
        currentMode: "feature-dev",
        history: [{ from: "idle", to: "feature-dev", timestamp: "...", explanation: "..." }],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("reset", stateFilePath, testConfig);
      expect(result.success).toBe(true);

      // Verify state was reset
      const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(newState.currentMode).toBe("idle");
    });

    it("/mode <name> force transitions to named mode", () => {
      const state = { currentMode: "idle", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      // Force transition to feature-dev (skipping test-dev)
      const result = handleModeCommand("feature-dev", stateFilePath, testConfig);
      expect(result.success).toBe(true);

      const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(newState.currentMode).toBe("feature-dev");
    });

    it("/mode help returns usage info", () => {
      const result = handleModeCommand("help", stateFilePath, testConfig);
      expect(result.success).toBe(true);
      expect(result.output).toContain("usage");
    });
  });

  describe("status display", () => {
    it("shows current mode name", () => {
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("", stateFilePath, testConfig);
      expect(result.output).toContain("test-dev");
    });

    it("shows available transitions from current mode", () => {
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("", stateFilePath, testConfig);
      // test-dev can transition to feature-dev or idle
      expect(result.output).toContain("feature-dev");
      expect(result.output).toContain("idle");
    });

    it("shows recent history", () => {
      const state = {
        currentMode: "feature-dev",
        history: [
          {
            from: "idle",
            to: "test-dev",
            timestamp: "2024-01-15T10:00:00.000Z",
            explanation: "Started TDD",
          },
          {
            from: "test-dev",
            to: "feature-dev",
            timestamp: "2024-01-15T10:30:00.000Z",
            explanation: "Test failing",
          },
        ],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("", stateFilePath, testConfig);
      expect(result.output).toContain("test-dev");
      expect(result.output).toContain("feature-dev");
    });
  });

  describe("reset behavior", () => {
    it("resets currentMode to initialMode", () => {
      const state = { currentMode: "feature-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      handleModeCommand("reset", stateFilePath, testConfig);

      const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(newState.currentMode).toBe("idle");
    });

    it("clears transition history", () => {
      const state = {
        currentMode: "feature-dev",
        history: [
          { from: "idle", to: "test-dev", timestamp: "...", explanation: "..." },
          { from: "test-dev", to: "feature-dev", timestamp: "...", explanation: "..." },
        ],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      handleModeCommand("reset", stateFilePath, testConfig);

      const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(newState.history).toEqual([]);
    });

    it("returns confirmation message", () => {
      const state = { currentMode: "feature-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("reset", stateFilePath, testConfig);
      expect(result.output).toMatch(/reset|idle/i);
    });
  });

  describe("force transition", () => {
    it("can transition to any valid state (bypasses transition rules)", () => {
      // From idle, normally can only go to test-dev
      // But force should allow going directly to feature-dev
      const state = { currentMode: "idle", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("feature-dev", stateFilePath, testConfig);
      expect(result.success).toBe(true);

      const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(newState.currentMode).toBe("feature-dev");
    });

    it("records forced transition in history (marked as forced)", () => {
      const state = { currentMode: "idle", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      handleModeCommand("feature-dev", stateFilePath, testConfig);

      const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(newState.history).toHaveLength(1);
      expect(newState.history[0].from).toBe("idle");
      expect(newState.history[0].to).toBe("feature-dev");
      expect(newState.history[0].explanation).toMatch(/forced|manual/i);
    });

    it("returns failure for non-existent state", () => {
      const state = { currentMode: "idle", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("non-existent", stateFilePath, testConfig);
      expect(result.success).toBe(false);
      expect(result.output).toContain("non-existent");
    });

    it("returns new state on success", () => {
      const state = { currentMode: "idle", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = handleModeCommand("test-dev", stateFilePath, testConfig);
      expect(result.success).toBe(true);
      expect(result.output).toContain("test-dev");
    });
  });

  describe("error handling", () => {
    it("unknown subcommand returns help text", () => {
      const result = handleModeCommand("unknown-command", stateFilePath, testConfig);
      // Should fail since it's not a valid state or command
      expect(result.success).toBe(false);
      expect(result.output).toMatch(/usage|help|unknown/i);
    });

    it("missing config returns meaningful error", () => {
      const result = handleModeCommand("", stateFilePath, null as unknown as WorkflowConfig);
      expect(result.success).toBe(false);
      expect(result.output).toMatch(/config|not configured/i);
    });
  });
});
