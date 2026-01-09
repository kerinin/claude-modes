import {
  TransitionInput,
  TransitionResult,
  WorkflowConfig,
} from "./types.js";

/**
 * Execute a mode transition.
 * Called by the mode_transition MCP tool.
 */
export function executeTransition(
  input: TransitionInput,
  stateFilePath: string,
  config: WorkflowConfig
): TransitionResult {
  // TODO: Implement transition logic
  return { success: false, reason: "Not implemented" };
}
