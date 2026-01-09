import * as fs from "fs";
import {
  TransitionInput,
  TransitionResult,
  WorkflowConfig,
  TransitionHistoryEntry,
} from "./types.js";

interface StateFile {
  currentMode: string;
  history: TransitionHistoryEntry[];
}

/**
 * Read current state from file, or return default state.
 * Throws if file exists but cannot be parsed (corrupted).
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
 * Execute a mode transition.
 * Called by the mode_transition MCP tool.
 */
export function executeTransition(
  input: TransitionInput,
  stateFilePath: string,
  config: WorkflowConfig
): TransitionResult {
  // Validate input
  if (!input.target_state || input.target_state.trim() === "") {
    return { success: false, reason: "target_state is required" };
  }

  if (!input.explanation || input.explanation.trim() === "") {
    return { success: false, reason: "explanation is required" };
  }

  // Validate target state exists
  if (!config.states[input.target_state]) {
    return {
      success: false,
      reason: `Mode '${input.target_state}' does not exist`,
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

  const currentMode = state.currentMode;

  // Check if already in target state
  if (currentMode === input.target_state) {
    return {
      success: false,
      reason: `Already in mode '${input.target_state}'`,
    };
  }

  // Check if transition is allowed from current mode
  const currentModeConfig = config.states[currentMode];
  const allowedTransitions = currentModeConfig?.transitions || [];
  const isAllowed = allowedTransitions.some((t) => t.to === input.target_state);

  if (!isAllowed) {
    return {
      success: false,
      reason: `Transition from '${currentMode}' to '${input.target_state}' is not allowed`,
    };
  }

  // Execute transition
  state.history.push({
    from: currentMode,
    to: input.target_state,
    timestamp: new Date().toISOString(),
    explanation: input.explanation,
  });
  state.currentMode = input.target_state;

  // Write state
  try {
    writeState(stateFilePath, state);
  } catch (e) {
    return {
      success: false,
      reason: `Failed to write state: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { success: true, new_state: input.target_state };
}
