import * as fs from "fs";
import { SlashCommandResult, WorkflowConfig, TransitionHistoryEntry } from "./types.js";

interface StateFile {
  currentMode: string;
  history: TransitionHistoryEntry[];
}

/**
 * Read current state from file, or return default state.
 */
function readState(stateFilePath: string, initialMode: string): StateFile {
  try {
    if (fs.existsSync(stateFilePath)) {
      const content = fs.readFileSync(stateFilePath, "utf-8");
      return JSON.parse(content) as StateFile;
    }
  } catch {
    // Ignore errors, return default
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
 * Handle /mode slash command.
 *
 * Usage:
 *   /mode          - show current status
 *   /mode status   - show current status
 *   /mode reset    - reset to initial state
 *   /mode <name>   - force transition to named mode
 *   /mode help     - show usage info
 */
export function handleModeCommand(
  args: string,
  stateFilePath: string,
  config: WorkflowConfig | null
): SlashCommandResult {
  // Handle missing config
  if (!config) {
    return {
      output: "Error: Mode config not configured",
      success: false,
    };
  }

  const trimmedArgs = args.trim().toLowerCase();

  // /mode help
  if (trimmedArgs === "help") {
    return {
      output: `Usage:
  /mode          - show current status
  /mode status   - show current status
  /mode reset    - reset to initial state
  /mode <name>   - force transition to named mode
  /mode help     - show this help`,
      success: true,
    };
  }

  // /mode reset
  if (trimmedArgs === "reset") {
    const state: StateFile = {
      currentMode: config.initial,
      history: [],
    };
    writeState(stateFilePath, state);
    return {
      output: `Reset to initial mode: ${config.initial}`,
      success: true,
    };
  }

  // /mode or /mode status
  if (trimmedArgs === "" || trimmedArgs === "status") {
    const state = readState(stateFilePath, config.initial);
    const currentModeConfig = config.states[state.currentMode];
    const transitions = currentModeConfig?.transitions || [];

    const lines: string[] = [];
    lines.push(`Current mode: ${state.currentMode}`);

    if (transitions.length > 0) {
      lines.push("");
      lines.push("Available transitions:");
      for (const t of transitions) {
        lines.push(`  → ${t.to}`);
      }
    }

    if (state.history.length > 0) {
      lines.push("");
      lines.push("Recent history:");
      const recentHistory = state.history.slice(-5);
      for (const entry of recentHistory) {
        lines.push(`  ${entry.from} → ${entry.to}`);
      }
    }

    return {
      output: lines.join("\n"),
      success: true,
    };
  }

  // /mode <name> - force transition
  const targetMode = args.trim(); // Preserve original case for mode name

  // Check if it's a valid mode
  if (!config.states[targetMode]) {
    // Unknown command/mode
    return {
      output: `Unknown mode or command: '${targetMode}'. Use /mode help for usage.`,
      success: false,
    };
  }

  // Force transition
  const state = readState(stateFilePath, config.initial);
  const fromMode = state.currentMode;

  state.history.push({
    from: fromMode,
    to: targetMode,
    timestamp: new Date().toISOString(),
    explanation: "Forced via /mode command",
  });
  state.currentMode = targetMode;

  writeState(stateFilePath, state);

  return {
    output: `Transitioned to mode: ${targetMode}`,
    success: true,
  };
}
