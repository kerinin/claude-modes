import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeTransition } from "../transition.js";
import { WorkflowConfig, TransitionResult } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Helper type guards
function isSuccess(
  result: TransitionResult
): result is { success: true; new_state: string } {
  return result.success === true;
}

function isFailure(
  result: TransitionResult
): result is { success: false; reason: string } {
  return result.success === false;
}

describe("executeTransition", () => {
  let tempDir: string;
  let stateFilePath: string;

  // Sample config for tests
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mode-transition-test-"));
    stateFilePath = path.join(tempDir, "mode-state.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("input validation", () => {
    it("requires target_state parameter", () => {
      const result = executeTransition(
        { target_state: "", explanation: "some reason" },
        stateFilePath,
        testConfig
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.reason).toContain("target_state");
      }
    });

    it("requires explanation parameter", () => {
      const result = executeTransition(
        { target_state: "test-dev", explanation: "" },
        stateFilePath,
        testConfig
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.reason).toContain("explanation");
      }
    });
  });

  describe("successful transitions", () => {
    it("valid transition returns success with new_state", () => {
      // Start in idle (no state file = initial state)
      const result = executeTransition(
        { target_state: "test-dev", explanation: "User described a bug" },
        stateFilePath,
        testConfig
      );
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.new_state).toBe("test-dev");
      }
    });

    it("state file is updated after successful transition", () => {
      executeTransition(
        { target_state: "test-dev", explanation: "User described a bug" },
        stateFilePath,
        testConfig
      );

      // Verify state file was written
      expect(fs.existsSync(stateFilePath)).toBe(true);
      const state = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(state.currentMode).toBe("test-dev");
    });

    it("transition is recorded in history with timestamp and explanation", () => {
      executeTransition(
        { target_state: "test-dev", explanation: "User described a bug" },
        stateFilePath,
        testConfig
      );

      const state = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toMatchObject({
        from: "idle",
        to: "test-dev",
        explanation: "User described a bug",
      });
      // Timestamp should be ISO format
      expect(state.history[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it("can transition from initial state", () => {
      // No state file exists - should use initial state from config
      const result = executeTransition(
        { target_state: "test-dev", explanation: "Starting work" },
        stateFilePath,
        testConfig
      );
      expect(isSuccess(result)).toBe(true);
    });
  });

  describe("invalid transitions", () => {
    it("transition to non-existent state returns failure", () => {
      const result = executeTransition(
        { target_state: "non-existent", explanation: "Trying invalid state" },
        stateFilePath,
        testConfig
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.reason).toContain("non-existent");
      }
    });

    it("transition to state not in allowed transitions returns failure", () => {
      // From idle, can only go to test-dev, not feature-dev
      const result = executeTransition(
        { target_state: "feature-dev", explanation: "Skipping test phase" },
        stateFilePath,
        testConfig
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.reason).toBeDefined();
      }
    });

    it("transition to current state returns failure", () => {
      // Set current state to test-dev
      const state = { currentMode: "test-dev", history: [] };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = executeTransition(
        { target_state: "test-dev", explanation: "Staying in same state" },
        stateFilePath,
        testConfig
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.reason).toContain("already");
      }
    });
  });

  describe("state persistence", () => {
    it("state persists across calls", () => {
      // First transition
      executeTransition(
        { target_state: "test-dev", explanation: "Starting" },
        stateFilePath,
        testConfig
      );

      // Second transition (from test-dev to feature-dev)
      const result = executeTransition(
        { target_state: "feature-dev", explanation: "Test is failing" },
        stateFilePath,
        testConfig
      );

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.new_state).toBe("feature-dev");
      }
    });

    it("history accumulates across multiple transitions", () => {
      // First transition
      executeTransition(
        { target_state: "test-dev", explanation: "Starting" },
        stateFilePath,
        testConfig
      );

      // Second transition
      executeTransition(
        { target_state: "feature-dev", explanation: "Test failing" },
        stateFilePath,
        testConfig
      );

      // Third transition
      executeTransition(
        { target_state: "idle", explanation: "Tests pass" },
        stateFilePath,
        testConfig
      );

      const state = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      expect(state.history).toHaveLength(3);
      expect(state.history[0].to).toBe("test-dev");
      expect(state.history[1].to).toBe("feature-dev");
      expect(state.history[2].to).toBe("idle");
    });
  });

  describe("error handling", () => {
    it("corrupted state file returns failure with reason", () => {
      fs.writeFileSync(stateFilePath, "{ invalid json");

      const result = executeTransition(
        { target_state: "test-dev", explanation: "Starting" },
        stateFilePath,
        testConfig
      );

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.reason).toBeDefined();
      }
    });
  });
});
