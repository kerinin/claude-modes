import { describe, it, expect } from "vitest";
import {
  checkToolPermission,
  formatHookResponse,
} from "../permission-checker.js";
import { ModePermissions, ToolCheckInput } from "../types.js";

describe("checkToolPermission", () => {
  describe("tool categorization", () => {
    it("file tools use glob matching", () => {
      const permissions: ModePermissions = {
        allow: [],
        deny: ["Write(src/**)"],
      };
      const input: ToolCheckInput = {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/foo.ts", content: "..." },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("deny");
    });

    it("Bash uses prefix matching", () => {
      const permissions: ModePermissions = {
        allow: ["Bash(npm test*)"],
        deny: [],
      };
      const input: ToolCheckInput = {
        tool_name: "Bash",
        tool_input: { command: "npm test:unit" },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("allow");
    });

    it("WebFetch uses domain matching", () => {
      const permissions: ModePermissions = {
        allow: ["WebFetch(domain:*.github.com)"],
        deny: [],
      };
      const input: ToolCheckInput = {
        tool_name: "WebFetch",
        tool_input: { url: "https://api.github.com/repos" },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("allow");
    });

    it("unknown tools pass through", () => {
      const permissions: ModePermissions = {
        allow: ["Write(src/**)"],
        deny: ["Read(secrets/**)"],
      };
      const input: ToolCheckInput = {
        tool_name: "UnknownTool",
        tool_input: { some: "data" },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("pass");
    });
  });

  describe("matching strategy smoke tests", () => {
    it("glob match works - Write(src/**) blocks Write to src/foo.ts", () => {
      const permissions: ModePermissions = {
        allow: [],
        deny: ["Write(src/**)"],
      };
      const input: ToolCheckInput = {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/foo.ts", content: "..." },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("deny");
    });

    it("glob non-match works - Write(src/**) does not block Write to test/foo.ts", () => {
      const permissions: ModePermissions = {
        allow: [],
        deny: ["Write(src/**)"],
      };
      const input: ToolCheckInput = {
        tool_name: "Write",
        tool_input: { file_path: "/project/test/foo.ts", content: "..." },
      };
      const result = checkToolPermission(input, permissions);
      // Should pass through (no match) - not deny, not allow
      expect(result.decision).toBe("pass");
    });

    it("Bash prefix match works - Bash(npm test*) matches npm test:unit", () => {
      const permissions: ModePermissions = {
        allow: ["Bash(npm test*)"],
        deny: [],
      };
      const input: ToolCheckInput = {
        tool_name: "Bash",
        tool_input: { command: "npm test:unit" },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("allow");
    });

    it("Bash prefix non-match - Bash(npm test*) does not match npm build", () => {
      const permissions: ModePermissions = {
        allow: ["Bash(npm test*)"],
        deny: [],
      };
      const input: ToolCheckInput = {
        tool_name: "Bash",
        tool_input: { command: "npm build" },
      };
      const result = checkToolPermission(input, permissions);
      // Should pass through (no match) - not allow, not deny
      expect(result.decision).toBe("pass");
    });

    it("domain match works - WebFetch(domain:*.github.com) matches api.github.com", () => {
      const permissions: ModePermissions = {
        allow: ["WebFetch(domain:*.github.com)"],
        deny: [],
      };
      const input: ToolCheckInput = {
        tool_name: "WebFetch",
        tool_input: { url: "https://api.github.com/repos", prompt: "get repos" },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("allow");
    });
  });

  describe("precedence", () => {
    it("deny beats allow - tool in both lists results in deny", () => {
      const permissions: ModePermissions = {
        allow: ["Write(src/**)"],
        deny: ["Write(src/protected/**)"],
      };
      const input: ToolCheckInput = {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/protected/secret.ts", content: "..." },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("deny");
    });
  });

  describe("pass-through behavior", () => {
    it("no permissions configured returns pass", () => {
      const input: ToolCheckInput = {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/foo.ts", content: "..." },
      };
      const result = checkToolPermission(input, null);
      expect(result.decision).toBe("pass");
    });

    it("tool does not match any rule returns pass", () => {
      const permissions: ModePermissions = {
        allow: ["Read(docs/**)"],
        deny: ["Write(secrets/**)"],
      };
      const input: ToolCheckInput = {
        tool_name: "Write",
        tool_input: { file_path: "/project/src/foo.ts", content: "..." },
      };
      const result = checkToolPermission(input, permissions);
      expect(result.decision).toBe("pass");
    });
  });

  describe("input handling", () => {
    it("handles missing tool_input gracefully", () => {
      const permissions: ModePermissions = {
        allow: ["Bash(npm test*)"],
        deny: [],
      };
      const input: ToolCheckInput = {
        tool_name: "Bash",
        tool_input: {},
      };
      // Should not throw, should return pass or appropriate decision
      const result = checkToolPermission(input, permissions);
      expect(result).toHaveProperty("decision");
    });
  });
});

describe("formatHookResponse", () => {
  describe("response format", () => {
    it("allow response is valid hook format", () => {
      const result = formatHookResponse({ decision: "allow" });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
      expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
    });

    it("deny response includes reason", () => {
      const result = formatHookResponse({
        decision: "deny",
        reason: "Write to src/ not allowed in test-dev mode",
      });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
      expect(result.hookSpecificOutput?.permissionDecisionReason).toBe(
        "Write to src/ not allowed in test-dev mode"
      );
    });

    it("pass-through response is empty", () => {
      const result = formatHookResponse({ decision: "pass" });
      // Pass means we don't include hookSpecificOutput - let Claude Code decide
      expect(result.hookSpecificOutput).toBeUndefined();
    });
  });
});
