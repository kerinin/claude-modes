import {
  ModePermissions,
  ToolCheckInput,
  ToolCheckResult,
  HookResponse,
} from "./types.js";

/**
 * Check if a tool call is allowed given the current mode's permissions.
 *
 * Tool categories:
 * - File tools (Read, Write, Edit, Glob, NotebookRead, NotebookEdit): gitignore-style globs
 * - Bash: prefix/wildcard matching
 * - WebFetch: domain:hostname matching
 * - WebSearch: exact match (no wildcards)
 */
export function checkToolPermission(
  input: ToolCheckInput,
  permissions: ModePermissions | null
): ToolCheckResult {
  // TODO: Implement permission checking
  return { decision: "pass" };
}

/**
 * Format the permission check result as a PreToolUse hook response.
 */
export function formatHookResponse(result: ToolCheckResult): HookResponse {
  // TODO: Implement response formatting
  return {};
}
