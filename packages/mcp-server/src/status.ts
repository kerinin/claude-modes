import { ModeStatus, StatusError } from "./types.js";

export type StatusResult = ModeStatus | StatusError;

/**
 * Get current mode status including history.
 * Used for debugging and tooling.
 */
export function getStatus(
  stateFilePath: string,
  initialMode: string
): StatusResult {
  // TODO: Implement status retrieval
  return { error: "Not implemented" };
}
