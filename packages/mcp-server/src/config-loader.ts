import { ConfigLoadResult, WorkflowConfig, LoadedModeConfig } from "./types.js";

/**
 * Load and parse modes.yaml from the given directory.
 */
export function loadModesYaml(configDir: string): ConfigLoadResult {
  // TODO: Implement modes.yaml loading
  return { success: false, error: "Not implemented" };
}

/**
 * Load mode-specific config files (settings.{mode}.json, CLAUDE.{mode}.md).
 * Returns merged config with base + mode-specific overlay.
 */
export function loadModeConfig(
  configDir: string,
  modeName: string
): LoadedModeConfig {
  // TODO: Implement mode config loading
  return { instructions: null, permissions: null };
}

/**
 * Load all config: modes.yaml + all mode-specific configs.
 */
export function loadAllConfig(configDir: string): ConfigLoadResult {
  // TODO: Implement full config loading
  return { success: false, error: "Not implemented" };
}
