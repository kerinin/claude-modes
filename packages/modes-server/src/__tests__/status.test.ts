import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStatus, StatusResult } from "../status.js";
import { ModeStatus, StatusError } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Helper to check if result is an error
function isError(result: StatusResult): result is StatusError {
  return "error" in result;
}

// Helper to check if result is valid status
function isStatus(result: StatusResult): result is ModeStatus {
  return "currentMode" in result;
}

describe("getStatus", () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mode-status-test-"));
    stateFilePath = path.join(tempDir, "mode-state.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("response structure", () => {
    it("returns currentMode name", () => {
      // Write a valid state file
      const state = {
        currentMode: "test-dev",
        history: [],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.currentMode).toBe("test-dev");
      }
    });

    it("returns initialMode from config", () => {
      const state = {
        currentMode: "test-dev",
        history: [],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.initialMode).toBe("idle");
      }
    });

    it("returns lastTransition timestamp", () => {
      const timestamp = "2024-01-15T10:30:00.000Z";
      const state = {
        currentMode: "feature-dev",
        history: [
          {
            from: "test-dev",
            to: "feature-dev",
            timestamp,
            explanation: "Test is failing",
          },
        ],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.lastTransition).toBe(timestamp);
      }
    });

    it("returns transitionHistory array", () => {
      const state = {
        currentMode: "feature-dev",
        history: [
          {
            from: "idle",
            to: "test-dev",
            timestamp: "2024-01-15T10:00:00.000Z",
            explanation: "Starting TDD",
          },
          {
            from: "test-dev",
            to: "feature-dev",
            timestamp: "2024-01-15T10:30:00.000Z",
            explanation: "Test is failing",
          },
        ],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.transitionHistory).toHaveLength(2);
        expect(result.transitionHistory[0].from).toBe("idle");
        expect(result.transitionHistory[1].to).toBe("feature-dev");
      }
    });
  });

  describe("fresh state", () => {
    it("returns initialMode as currentMode when state file missing", () => {
      // Don't create state file
      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.currentMode).toBe("idle");
        expect(result.initialMode).toBe("idle");
      }
    });

    it("returns null lastTransition when no transitions", () => {
      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.lastTransition).toBeNull();
      }
    });

    it("returns empty transitionHistory when fresh", () => {
      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.transitionHistory).toEqual([]);
      }
    });
  });

  describe("transition history", () => {
    it("after one transition - history has one entry", () => {
      const state = {
        currentMode: "test-dev",
        history: [
          {
            from: "idle",
            to: "test-dev",
            timestamp: "2024-01-15T10:00:00.000Z",
            explanation: "User described a bug",
          },
        ],
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = getStatus(stateFilePath, "idle");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        expect(result.transitionHistory).toHaveLength(1);
        expect(result.transitionHistory[0]).toEqual({
          from: "idle",
          to: "test-dev",
          timestamp: "2024-01-15T10:00:00.000Z",
          explanation: "User described a bug",
        });
      }
    });

    it("history is capped at limit (last 10)", () => {
      // Create 15 history entries
      const history = Array.from({ length: 15 }, (_, i) => ({
        from: `mode-${i}`,
        to: `mode-${i + 1}`,
        timestamp: `2024-01-15T${String(i).padStart(2, "0")}:00:00.000Z`,
        explanation: `Transition ${i + 1}`,
      }));
      const state = {
        currentMode: "mode-15",
        history,
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = getStatus(stateFilePath, "mode-0");
      expect(isStatus(result)).toBe(true);
      if (isStatus(result)) {
        // Should only return last 10
        expect(result.transitionHistory.length).toBeLessThanOrEqual(10);
        // Should include most recent
        expect(
          result.transitionHistory[result.transitionHistory.length - 1].to
        ).toBe("mode-15");
      }
    });
  });

  describe("error handling", () => {
    it("returns error for corrupted state file", () => {
      fs.writeFileSync(stateFilePath, "{ invalid json");

      const result = getStatus(stateFilePath, "idle");
      expect(isError(result)).toBe(true);
      if (isError(result)) {
        expect(result.error).toBeDefined();
      }
    });

    it("error includes details about the problem", () => {
      fs.writeFileSync(stateFilePath, "{ invalid json");

      const result = getStatus(stateFilePath, "idle");
      expect(isError(result)).toBe(true);
      if (isError(result)) {
        expect(result.details).toBeDefined();
      }
    });
  });
});
