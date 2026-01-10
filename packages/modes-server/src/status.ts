import * as fs from "fs";
import { ModeStatus, StatusError, TransitionHistoryEntry } from "./types.js";

export type StatusResult = ModeStatus | StatusError;

interface StateFile {
  currentMode: string;
  history: TransitionHistoryEntry[];
}

/**
 * Get current mode status including history.
 * Used for debugging and tooling.
 */
export function getStatus(
  stateFilePath: string,
  initialMode: string
): StatusResult {
  let state: StateFile;

  try {
    if (fs.existsSync(stateFilePath)) {
      const content = fs.readFileSync(stateFilePath, "utf-8");
      state = JSON.parse(content) as StateFile;
    } else {
      // No state file - return fresh state
      state = { currentMode: initialMode, history: [] };
    }
  } catch (e) {
    return {
      error: "Failed to read state file",
      details: e instanceof Error ? e.message : String(e),
    };
  }

  const lastEntry = state.history[state.history.length - 1];

  return {
    currentMode: state.currentMode,
    initialMode,
    lastTransition: lastEntry?.timestamp || null,
    transitionHistory: state.history.slice(-10), // Cap at 10
    availableTransitions: [], // Not available without config
  };
}
