import * as fs from "fs";
import {
  WorkflowConfig,
  ModeTransition,
  TransitionHistoryEntry,
} from "./types.js";

interface StateFile {
  currentMode: string;
  history: TransitionHistoryEntry[];
}

// Return types for MCP tools (using snake_case for MCP convention)
export interface ModeStatusResult {
  current_mode: string;
  available_transitions: ModeTransition[];
  history: TransitionHistoryEntry[];
  error?: string;
}

export interface ForceTransitionInput {
  target_mode: string;
}

export type ForceTransitionResult =
  | { success: true; new_mode: string }
  | { success: false; reason: string };

/**
 * Read current state from file, or return default state.
 */
function readState(stateFilePath: string, initialMode: string): StateFile {
  if (fs.existsSync(stateFilePath)) {
    const content = fs.readFileSync(stateFilePath, "utf-8");
    return JSON.parse(content) as StateFile;
  }
  return { currentMode: initialMode, history: [] };
}

/**
 * Write state to file atomically.
 */
function writeState(stateFilePath: string, state: StateFile): void {
  const tempPath = `${stateFilePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
  fs.renameSync(tempPath, stateFilePath);
}

/**
 * Get current mode status.
 * MCP tool: mode_status
 */
export function modeStatus(
  stateFilePath: string,
  config: WorkflowConfig
): ModeStatusResult {
  let state: StateFile;

  try {
    state = readState(stateFilePath, config.initial);
  } catch (e) {
    return {
      current_mode: config.initial,
      available_transitions: [],
      history: [],
      error: `Failed to read state: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const stateConfig = config.states[state.currentMode];

  return {
    current_mode: state.currentMode,
    available_transitions: stateConfig?.transitions || [],
    history: state.history,
  };
}

/**
 * Force transition to any mode (bypasses constraint checks).
 * MCP tool: mode_force_transition
 */
export function modeForceTransition(
  input: ForceTransitionInput,
  stateFilePath: string,
  config: WorkflowConfig
): ForceTransitionResult {
  // Validate target mode exists
  if (!config.states[input.target_mode]) {
    return {
      success: false,
      reason: `Mode '${input.target_mode}' does not exist`,
    };
  }

  // Read current state
  let state: StateFile;
  try {
    state = readState(stateFilePath, config.initial);
  } catch (e) {
    return {
      success: false,
      reason: `Failed to read state: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Check if already in target mode
  if (state.currentMode === input.target_mode) {
    return {
      success: false,
      reason: `Already in mode '${input.target_mode}'`,
    };
  }

  // Execute transition
  const fromMode = state.currentMode;
  state.history.push({
    from: fromMode,
    to: input.target_mode,
    timestamp: new Date().toISOString(),
    explanation: "Forced transition",
  });
  state.currentMode = input.target_mode;

  // Write state
  try {
    writeState(stateFilePath, state);
  } catch (e) {
    return {
      success: false,
      reason: `Failed to write state: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { success: true, new_mode: input.target_mode };
}
