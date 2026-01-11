import { describe, it, expect } from "vitest";
import { renderContext } from "../context-renderer.js";
import { ContextData } from "../types.js";

describe("renderContext", () => {
  describe("empty/null input", () => {
    it("returns empty string for null input", () => {
      const result = renderContext(null);
      expect(result).toBe("");
    });
  });

  describe("current mode rendering", () => {
    it("includes mode name in output", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: null,
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("test-dev");
    });

    it("handles mode names with special characters", () => {
      const data: ContextData = {
        currentMode: "my_custom-mode.v2",
        instructions: null,
        permissions: null,
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("my_custom-mode.v2");
    });
  });

  describe("instructions rendering", () => {
    it("includes instructions when provided", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "You are writing tests. Focus on edge cases.",
        permissions: null,
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("You are writing tests");
      expect(result).toContain("Focus on edge cases");
    });

    it("handles multiline instructions", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "Line one.\nLine two.\nLine three.",
        permissions: null,
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("Line one.");
      expect(result).toContain("Line two.");
      expect(result).toContain("Line three.");
    });

    it("omits instructions section when null", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: { allow: ["Read(**)"], deny: [] },
        transitions: [{ to: "feature-dev", constraint: "Test failing" }],
      };
      const result = renderContext(data);
      // Verify we have output but no instructions section
      expect(result).toContain("test-dev");
      expect(result).not.toContain("Instructions:");
    });

    it("handles empty string instructions", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "",
        permissions: { allow: ["Read(**)"], deny: [] },
        transitions: [{ to: "feature-dev", constraint: "Test failing" }],
      };
      const result = renderContext(data);
      // Empty string should be treated same as null
      expect(result).toContain("test-dev");
      expect(result).not.toContain("Instructions:");
    });
  });

  describe("permissions rendering", () => {
    it("includes allow list when provided", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: {
          allow: ["Read(**)", "Write(test/**)"],
          deny: [],
        },
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("Read(**)");
      expect(result).toContain("Write(test/**)");
    });

    it("includes deny list when provided", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: {
          allow: [],
          deny: ["Write(src/**)", "Edit(src/**)"],
        },
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("Write(src/**)");
      expect(result).toContain("Edit(src/**)");
    });

    it("includes both allow and deny lists", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: {
          allow: ["Read(**)"],
          deny: ["Write(src/**)"],
        },
        transitions: [],
      };
      const result = renderContext(data);
      expect(result).toContain("Read(**)");
      expect(result).toContain("Write(src/**)");
    });

    it("omits permissions section when null", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "Write tests first",
        permissions: null,
        transitions: [{ to: "feature-dev", constraint: "Test failing" }],
      };
      const result = renderContext(data);
      // Verify we have output but no permissions section
      expect(result).toContain("test-dev");
      expect(result).not.toContain("Allowed:");
      expect(result).not.toContain("Denied:");
    });

    it("handles empty allow and deny lists", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "Write tests first",
        permissions: {
          allow: [],
          deny: [],
        },
        transitions: [{ to: "feature-dev", constraint: "Test failing" }],
      };
      const result = renderContext(data);
      // Empty permissions should be treated same as null
      expect(result).toContain("test-dev");
      expect(result).not.toContain("Allowed:");
      expect(result).not.toContain("Denied:");
    });
  });

  describe("transitions rendering", () => {
    it("includes single transition", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: null,
        transitions: [
          { to: "feature-dev", constraint: "Test exists and is failing" },
        ],
      };
      const result = renderContext(data);
      expect(result).toContain("feature-dev");
      expect(result).toContain("Test exists and is failing");
    });

    it("includes multiple transitions", () => {
      const data: ContextData = {
        currentMode: "idle",
        instructions: null,
        permissions: null,
        transitions: [
          { to: "test-dev", constraint: "User described a bug" },
          { to: "docs-dev", constraint: "User wants documentation" },
        ],
      };
      const result = renderContext(data);
      expect(result).toContain("test-dev");
      expect(result).toContain("User described a bug");
      expect(result).toContain("docs-dev");
      expect(result).toContain("User wants documentation");
    });

    it("handles multiline constraints", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: null,
        transitions: [
          {
            to: "feature-dev",
            constraint:
              "A test exists that targets the bug/feature.\nThe test has been executed and is currently failing.",
          },
        ],
      };
      const result = renderContext(data);
      expect(result).toContain("A test exists that targets the bug/feature.");
      expect(result).toContain(
        "The test has been executed and is currently failing."
      );
    });

    it("handles empty transitions array", () => {
      const data: ContextData = {
        currentMode: "done",
        instructions: null,
        permissions: null,
        transitions: [],
      };
      const result = renderContext(data);
      // Should indicate no transitions available or omit section
      expect(result).toContain("done"); // Mode still shown
    });

    it("handles constraint with special characters", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: null,
        transitions: [
          {
            to: "feature-dev",
            constraint: 'Test shows: "expected 401, got 200"',
          },
        ],
      };
      const result = renderContext(data);
      expect(result).toContain('Test shows: "expected 401, got 200"');
    });
  });

  describe("transition instructions", () => {
    it("includes instructions for how to transition", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: null,
        permissions: null,
        transitions: [
          { to: "feature-dev", constraint: "Test is failing" },
        ],
      };
      const result = renderContext(data);
      expect(result).toContain("mode_transition");
    });

    it("omits transition instructions when no transitions available", () => {
      const data: ContextData = {
        currentMode: "done",
        instructions: "Task complete. No further actions needed.",
        permissions: null,
        transitions: [],
      };
      const result = renderContext(data);
      // Verify we have output but no transition instructions
      expect(result).toContain("done");
      expect(result).not.toContain("mode_transition");
    });
  });

  describe("output format", () => {
    it("returns plain text, not JSON", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "Write tests",
        permissions: { allow: ["Read(**)"], deny: [] },
        transitions: [{ to: "feature-dev", constraint: "Test failing" }],
      };
      const result = renderContext(data);
      // Verify we have output
      expect(result.length).toBeGreaterThan(0);
      // Should not start with { or [
      expect(result.trim()).not.toMatch(/^[\[{]/);
    });

    it("is human readable", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions: "Write tests",
        permissions: { allow: ["Read(**)"], deny: ["Write(src/**)"] },
        transitions: [{ to: "feature-dev", constraint: "Test failing" }],
      };
      const result = renderContext(data);
      // Should have clear section breaks/structure
      expect(result).toMatch(/MODE|mode/i);
    });
  });

  describe("full context rendering", () => {
    it("renders complete context with all fields", () => {
      const data: ContextData = {
        currentMode: "test-dev",
        instructions:
          "You are writing a failing test.\nFocus on edge cases.\nDo NOT modify implementation code.",
        permissions: {
          allow: ["Read(**)", "Write(test/**)", "Bash(npm test*)"],
          deny: ["Write(src/**)", "Edit(src/**)"],
        },
        transitions: [
          {
            to: "feature-dev",
            constraint:
              "A test exists that targets the bug/feature.\nThe test has been executed and is currently failing.",
          },
        ],
      };
      const result = renderContext(data);

      // Mode
      expect(result).toContain("test-dev");

      // Instructions
      expect(result).toContain("You are writing a failing test.");
      expect(result).toContain("Do NOT modify implementation code.");

      // Permissions
      expect(result).toContain("Read(**)");
      expect(result).toContain("Write(src/**)");

      // Transitions
      expect(result).toContain("feature-dev");
      expect(result).toContain("A test exists that targets the bug/feature.");

      // Transition instructions
      expect(result).toContain("mode_transition");
    });
  });
});
