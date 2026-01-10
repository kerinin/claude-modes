import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { modeStatus, modeForceTransition } from "../mcp-tools.js";
import { WorkflowConfig } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("MCP Tools", () => {
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
      terminal: {
        name: "terminal",
        transitions: [],
      },
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-tools-test-"));
    stateFilePath = path.join(tempDir, "mode-state.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("mode_status", () => {
    describe("basic functionality", () => {
      it("returns current mode name", () => {
        const state = { currentMode: "test-dev", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeStatus(stateFilePath, testConfig);
        expect(result.current_mode).toBe("test-dev");
      });

      it("returns available transitions from current mode", () => {
        const state = { currentMode: "test-dev", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeStatus(stateFilePath, testConfig);
        expect(result.available_transitions).toHaveLength(2);
        expect(result.available_transitions.map((t) => t.to)).toContain("feature-dev");
        expect(result.available_transitions.map((t) => t.to)).toContain("idle");
      });

      it("includes constraint text for each available transition", () => {
        const state = { currentMode: "test-dev", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeStatus(stateFilePath, testConfig);
        const featureDevTransition = result.available_transitions.find(
          (t) => t.to === "feature-dev"
        );
        expect(featureDevTransition?.constraint).toBe("Test is failing");
      });

      it("returns recent transition history", () => {
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

        const result = modeStatus(stateFilePath, testConfig);
        expect(result.history).toHaveLength(2);
        expect(result.history[0].from).toBe("idle");
        expect(result.history[1].to).toBe("feature-dev");
      });

      it("returns initial mode when no state file exists", () => {
        // Don't create state file
        const result = modeStatus(stateFilePath, testConfig);
        expect(result.current_mode).toBe("idle");
      });
    });

    describe("error handling", () => {
      it("handles corrupted state file gracefully", () => {
        fs.writeFileSync(stateFilePath, "{ invalid json");

        const result = modeStatus(stateFilePath, testConfig);
        expect(result.error).toBeDefined();
      });

      it("works when current mode has no transitions (terminal mode)", () => {
        const state = { currentMode: "terminal", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeStatus(stateFilePath, testConfig);
        expect(result.current_mode).toBe("terminal");
        expect(result.available_transitions).toEqual([]);
      });
    });
  });

  describe("mode_force_transition", () => {
    describe("basic functionality", () => {
      it("can transition to any valid mode (bypasses constraint rules)", () => {
        // From idle, normally can only go to test-dev
        // But force should allow going directly to feature-dev
        const state = { currentMode: "idle", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "feature-dev" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(true);

        const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
        expect(newState.currentMode).toBe("feature-dev");
      });

      it("records transition in history marked as forced", () => {
        const state = { currentMode: "idle", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        modeForceTransition({ target_mode: "feature-dev" }, stateFilePath, testConfig);

        const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
        expect(newState.history).toHaveLength(1);
        expect(newState.history[0].from).toBe("idle");
        expect(newState.history[0].to).toBe("feature-dev");
        expect(newState.history[0].explanation.toLowerCase()).toMatch(/forced/);
      });

      it("returns new mode on success", () => {
        const state = { currentMode: "idle", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "test-dev" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.new_mode).toBe("test-dev");
        }
      });

      it("can skip intermediate modes (idle -> feature-dev directly)", () => {
        const state = { currentMode: "idle", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "feature-dev" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(true);

        const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
        expect(newState.currentMode).toBe("feature-dev");
      });

      it("can transition to initial mode (reset behavior)", () => {
        const state = { currentMode: "feature-dev", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "idle" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(true);

        const newState = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
        expect(newState.currentMode).toBe("idle");
      });
    });

    describe("error handling", () => {
      it("returns failure for non-existent mode", () => {
        const state = { currentMode: "idle", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "non-existent" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toContain("non-existent");
        }
      });

      it("returns failure when already in target mode", () => {
        const state = { currentMode: "test-dev", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "test-dev" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(false);
      });

      it("error message includes 'already in this mode'", () => {
        const state = { currentMode: "test-dev", history: [] };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));

        const result = modeForceTransition(
          { target_mode: "test-dev" },
          stateFilePath,
          testConfig
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason.toLowerCase()).toContain("already");
        }
      });
    });
  });
});
