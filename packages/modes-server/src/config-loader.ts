import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import {
  ConfigLoadResult,
  WorkflowConfig,
  LoadedModeConfig,
  ModeConfig,
  ModeTransition,
  ModePermissions,
} from "./types.js";

/**
 * Load and parse modes.yaml from the given directory.
 */
export function loadModesYaml(configDir: string): ConfigLoadResult {
  const modesPath = path.join(configDir, "modes.yaml");

  // Check if file exists
  if (!fs.existsSync(modesPath)) {
    return { success: false, error: "modes.yaml not found" };
  }

  // Read and parse YAML
  let parsed: unknown;
  try {
    const content = fs.readFileSync(modesPath, "utf-8");
    parsed = YAML.parse(content);
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse modes.yaml: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Validate structure
  if (typeof parsed !== "object" || parsed === null) {
    return { success: false, error: "modes.yaml must be an object" };
  }

  const doc = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof doc.name !== "string") {
    return { success: false, error: "modes.yaml missing required field: name" };
  }

  if (typeof doc.default !== "string") {
    return { success: false, error: "modes.yaml missing required field: default" };
  }

  if (typeof doc.modes !== "object" || doc.modes === null) {
    return { success: false, error: "modes.yaml missing required field: modes" };
  }

  const modesObj = doc.modes as Record<string, unknown>;
  const modeNames = Object.keys(modesObj);

  // Validate default mode exists
  if (!modeNames.includes(doc.default)) {
    return {
      success: false,
      error: `default mode '${doc.default}' does not exist in modes`,
    };
  }

  // Parse modes and transitions
  const states: Record<string, ModeConfig> = {};

  for (const modeName of modeNames) {
    const modeData = modesObj[modeName] as Record<string, unknown>;
    const transitions: ModeTransition[] = [];

    const rawTransitions = modeData?.transitions;
    if (Array.isArray(rawTransitions)) {
      for (const t of rawTransitions) {
        if (typeof t !== "object" || t === null) continue;
        const trans = t as Record<string, unknown>;

        if (typeof trans.to !== "string") {
          return {
            success: false,
            error: `Invalid transition in mode '${modeName}': missing 'to' field`,
          };
        }

        if (typeof trans.constraint !== "string") {
          return {
            success: false,
            error: `Invalid transition in mode '${modeName}': missing 'constraint' field`,
          };
        }

        transitions.push({
          to: trans.to,
          constraint: trans.constraint.trim(),
        });
      }
    }

    states[modeName] = {
      name: modeName,
      transitions,
    };
  }

  // Validate all transition targets exist
  for (const [modeName, modeConfig] of Object.entries(states)) {
    for (const transition of modeConfig.transitions) {
      if (!states[transition.to]) {
        return {
          success: false,
          error: `Transition from '${modeName}' references non-existent mode '${transition.to}'`,
        };
      }
    }
  }

  const config: WorkflowConfig = {
    initial: doc.default,
    states,
  };

  // Load mode-specific configs
  const modeConfigs: Record<string, LoadedModeConfig> = {};
  for (const modeName of modeNames) {
    modeConfigs[modeName] = loadModeConfig(configDir, modeName);
  }

  return {
    success: true,
    config,
    modeConfigs,
  };
}

/**
 * Load mode-specific config files (settings.{mode}.json, CLAUDE.{mode}.md).
 */
export function loadModeConfig(
  configDir: string,
  modeName: string
): LoadedModeConfig {
  const result: LoadedModeConfig = {
    instructions: null,
    permissions: null,
  };

  // Load CLAUDE.{mode}.md
  const instructionsPath = path.join(configDir, `CLAUDE.${modeName}.md`);
  if (fs.existsSync(instructionsPath)) {
    const content = fs.readFileSync(instructionsPath, "utf-8");
    if (content.trim().length > 0) {
      result.instructions = content;
    }
  }

  // Load settings.{mode}.json
  const settingsPath = path.join(configDir, `settings.${modeName}.json`);
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;

      if (parsed.permissions && typeof parsed.permissions === "object") {
        const perms = parsed.permissions as Record<string, unknown>;
        const permissions: ModePermissions = {
          allow: Array.isArray(perms.allow) ? (perms.allow as string[]) : [],
          deny: Array.isArray(perms.deny) ? (perms.deny as string[]) : [],
        };
        result.permissions = permissions;
      }
    } catch {
      // Ignore parse errors - treat as no permissions
    }
  }

  return result;
}

/**
 * Load all config: modes.yaml + all mode-specific configs.
 */
export function loadAllConfig(configDir: string): ConfigLoadResult {
  return loadModesYaml(configDir);
}
