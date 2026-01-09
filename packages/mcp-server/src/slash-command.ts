import { SlashCommandResult, WorkflowConfig } from "./types.js";

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
  config: WorkflowConfig
): SlashCommandResult {
  // TODO: Implement slash command handling
  return { output: "Not implemented", success: false };
}
