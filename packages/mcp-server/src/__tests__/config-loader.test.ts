import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadModesYaml, loadModeConfig, loadAllConfig } from "../config-loader.js";
import { ConfigLoadResult, LoadedModeConfig } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Helper type guards
function isSuccess(result: ConfigLoadResult): result is {
  success: true;
  config: import("../types.js").WorkflowConfig;
  modeConfigs: Record<string, LoadedModeConfig>;
} {
  return result.success === true;
}

function isFailure(result: ConfigLoadResult): result is {
  success: false;
  error: string;
} {
  return result.success === false;
}

describe("loadModesYaml", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-loader-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("valid config parsing", () => {
    it("parses valid modes.yaml structure", () => {
      const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: test-dev
        constraint: User has described a bug or feature
  test-dev:
    transitions:
      - to: feature-dev
        constraint: Test is failing
  feature-dev:
    transitions:
      - to: idle
        constraint: Tests pass
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.config.initial).toBe("idle");
        expect(Object.keys(result.config.states)).toHaveLength(3);
      }
    });

    it("extracts mode names correctly", () => {
      const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions: []
  test-dev:
    transitions: []
  feature-dev:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.config.states).toHaveProperty("idle");
        expect(result.config.states).toHaveProperty("test-dev");
        expect(result.config.states).toHaveProperty("feature-dev");
      }
    });

    it("extracts transitions with constraints", () => {
      const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: test-dev
        constraint: User described a bug
      - to: docs
        constraint: User wants documentation
  test-dev:
    transitions: []
  docs:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.config.states.idle.transitions).toHaveLength(2);
        expect(result.config.states.idle.transitions[0]).toEqual({
          to: "test-dev",
          constraint: "User described a bug",
        });
      }
    });

    it("handles multiline constraints", () => {
      const yaml = `
name: tdd
default: test-dev

modes:
  test-dev:
    transitions:
      - to: feature-dev
        constraint: |
          A test exists that targets the bug/feature.
          The test has been executed and is currently failing.
  feature-dev:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        const constraint = result.config.states["test-dev"].transitions[0].constraint;
        expect(constraint).toContain("A test exists");
        expect(constraint).toContain("currently failing");
      }
    });

    it("handles modes with no transitions (terminal modes)", () => {
      const yaml = `
name: simple
default: start

modes:
  start:
    transitions:
      - to: done
        constraint: Work complete
  done:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.config.states.done.transitions).toEqual([]);
      }
    });
  });

  describe("default mode handling", () => {
    it("uses default field as initial mode", () => {
      const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions: []
  active:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.config.initial).toBe("idle");
      }
    });

    it("fails if default mode does not exist in modes", () => {
      const yaml = `
name: tdd
default: nonexistent

modes:
  idle:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/default|nonexistent/i);
      }
    });
  });

  describe("validation errors", () => {
    it("fails on missing modes.yaml", () => {
      // Don't create the file
      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/not found|missing|modes\.yaml/i);
      }
    });

    it("fails on invalid YAML syntax", () => {
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), "{ invalid yaml:");

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/parse|syntax|invalid/i);
      }
    });

    it("fails on missing name field", () => {
      const yaml = `
default: idle

modes:
  idle:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/name/i);
      }
    });

    it("fails on missing default field", () => {
      const yaml = `
name: tdd

modes:
  idle:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/default/i);
      }
    });

    it("fails on missing modes field", () => {
      const yaml = `
name: tdd
default: idle
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/modes/i);
      }
    });

    it("fails when transition references non-existent mode", () => {
      const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: nonexistent
        constraint: Some constraint
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/nonexistent/i);
      }
    });

    it("fails when transition missing constraint", () => {
      const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: other
  other:
    transitions: []
`;
      fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

      const result = loadModesYaml(tempDir);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toMatch(/constraint/i);
      }
    });
  });
});

describe("loadModeConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mode-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("settings.{mode}.json loading", () => {
    it("loads permissions from settings.{mode}.json", () => {
      const settings = {
        permissions: {
          allow: ["Read(**)", "Write(test/**)"],
          deny: ["Write(src/**)"],
        },
      };
      fs.writeFileSync(
        path.join(tempDir, "settings.test-dev.json"),
        JSON.stringify(settings)
      );

      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.permissions).toEqual({
        allow: ["Read(**)", "Write(test/**)"],
        deny: ["Write(src/**)"],
      });
    });

    it("returns null permissions when file does not exist", () => {
      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.permissions).toBeNull();
    });

    it("handles empty permissions object", () => {
      const settings = { permissions: { allow: [], deny: [] } };
      fs.writeFileSync(
        path.join(tempDir, "settings.test-dev.json"),
        JSON.stringify(settings)
      );

      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.permissions).toEqual({ allow: [], deny: [] });
    });

    it("handles settings file without permissions field", () => {
      const settings = { someOtherField: "value" };
      fs.writeFileSync(
        path.join(tempDir, "settings.test-dev.json"),
        JSON.stringify(settings)
      );

      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.permissions).toBeNull();
    });
  });

  describe("CLAUDE.{mode}.md loading", () => {
    it("loads instructions from CLAUDE.{mode}.md", () => {
      const instructions = `## Mode: test-dev

You are writing a failing test. Focus on:
1. Understanding the expected behavior
2. Writing a test that verifies that behavior

Do NOT modify implementation code.`;
      fs.writeFileSync(path.join(tempDir, "CLAUDE.test-dev.md"), instructions);

      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.instructions).toContain("writing a failing test");
      expect(result.instructions).toContain("Do NOT modify implementation");
    });

    it("returns null instructions when file does not exist", () => {
      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.instructions).toBeNull();
    });

    it("handles empty instructions file", () => {
      fs.writeFileSync(path.join(tempDir, "CLAUDE.test-dev.md"), "");

      const result = loadModeConfig(tempDir, "test-dev");
      // Empty string should be treated as null
      expect(result.instructions).toBeNull();
    });

    it("preserves whitespace and formatting", () => {
      const instructions = `Line 1

Line 3 after blank line

- Bullet 1
- Bullet 2`;
      fs.writeFileSync(path.join(tempDir, "CLAUDE.test-dev.md"), instructions);

      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.instructions).toContain("\n\n");
      expect(result.instructions).toContain("- Bullet 1");
    });
  });

  describe("combined loading", () => {
    it("loads both instructions and permissions", () => {
      const settings = {
        permissions: {
          allow: ["Read(**)"],
          deny: ["Write(src/**)"],
        },
      };
      fs.writeFileSync(
        path.join(tempDir, "settings.test-dev.json"),
        JSON.stringify(settings)
      );
      fs.writeFileSync(
        path.join(tempDir, "CLAUDE.test-dev.md"),
        "Test instructions"
      );

      const result = loadModeConfig(tempDir, "test-dev");
      expect(result.instructions).toBe("Test instructions");
      expect(result.permissions).toEqual({
        allow: ["Read(**)"],
        deny: ["Write(src/**)"],
      });
    });

    it("handles mode names with special characters", () => {
      fs.writeFileSync(
        path.join(tempDir, "CLAUDE.my-custom_mode.md"),
        "Custom mode instructions"
      );

      const result = loadModeConfig(tempDir, "my-custom_mode");
      expect(result.instructions).toBe("Custom mode instructions");
    });
  });
});

describe("loadAllConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "all-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads modes.yaml and all mode configs", () => {
    // Create modes.yaml
    const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions:
      - to: test-dev
        constraint: User described a bug
  test-dev:
    transitions:
      - to: idle
        constraint: Done
`;
    fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

    // Create mode configs
    fs.writeFileSync(
      path.join(tempDir, "CLAUDE.test-dev.md"),
      "Test dev instructions"
    );
    fs.writeFileSync(
      path.join(tempDir, "settings.test-dev.json"),
      JSON.stringify({ permissions: { allow: ["Read(**)"], deny: [] } })
    );

    const result = loadAllConfig(tempDir);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.config.initial).toBe("idle");
      expect(result.modeConfigs["test-dev"].instructions).toBe("Test dev instructions");
      expect(result.modeConfigs["test-dev"].permissions).toEqual({
        allow: ["Read(**)"],
        deny: [],
      });
    }
  });

  it("includes empty config for modes without config files", () => {
    const yaml = `
name: simple
default: idle

modes:
  idle:
    transitions: []
`;
    fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);
    // Don't create CLAUDE.idle.md or settings.idle.json

    const result = loadAllConfig(tempDir);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.modeConfigs).toHaveProperty("idle");
      expect(result.modeConfigs["idle"].instructions).toBeNull();
      expect(result.modeConfigs["idle"].permissions).toBeNull();
    }
  });

  it("fails if modes.yaml is invalid", () => {
    fs.writeFileSync(path.join(tempDir, "modes.yaml"), "{ invalid");

    const result = loadAllConfig(tempDir);
    expect(isFailure(result)).toBe(true);
  });

  it("loads config for all defined modes", () => {
    const yaml = `
name: tdd
default: idle

modes:
  idle:
    transitions: []
  test-dev:
    transitions: []
  feature-dev:
    transitions: []
`;
    fs.writeFileSync(path.join(tempDir, "modes.yaml"), yaml);

    const result = loadAllConfig(tempDir);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(Object.keys(result.modeConfigs)).toHaveLength(3);
      expect(result.modeConfigs).toHaveProperty("idle");
      expect(result.modeConfigs).toHaveProperty("test-dev");
      expect(result.modeConfigs).toHaveProperty("feature-dev");
    }
  });
});
