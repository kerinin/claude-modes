import picomatch from "picomatch";
import {
  ModePermissions,
  ToolCheckInput,
  ToolCheckResult,
  HookResponse,
} from "./types.js";

// Tools that use file path glob matching
const FILE_PATTERN_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Glob",
  "NotebookRead",
  "NotebookEdit",
]);

// Tools that use command prefix matching
const BASH_PREFIX_TOOLS = new Set(["Bash"]);

// Tools that use domain matching
const DOMAIN_TOOLS = new Set(["WebFetch"]);

/**
 * Parse a permission rule like "Write(src/**)" into tool name and pattern.
 */
function parseRule(rule: string): { tool: string; pattern: string } | null {
  const match = rule.match(/^(\w+)\((.+)\)$/);
  if (!match) return null;
  return { tool: match[1], pattern: match[2] };
}

/**
 * Check if a file path matches a glob pattern.
 * The pattern is matched against the basename and path segments.
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Extract the path portion after any absolute prefix
  // e.g., "/project/src/foo.ts" -> check if "src/foo.ts" matches "src/**"
  const isMatch = picomatch(pattern, { contains: true });
  return isMatch(filePath);
}

/**
 * Check if a command matches a prefix pattern.
 * Pattern "npm test*" matches "npm test", "npm test:unit", etc.
 */
function matchesPrefix(command: string, pattern: string): boolean {
  // Convert glob-style wildcards to regex
  // "npm test*" -> matches commands starting with "npm test"
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return command.startsWith(prefix);
  }
  return command === pattern;
}

/**
 * Check if a URL's domain matches a domain pattern.
 * Pattern "domain:*.github.com" matches "api.github.com", "raw.github.com"
 */
function matchesDomain(url: string, pattern: string): boolean {
  if (!pattern.startsWith("domain:")) return false;
  const domainPattern = pattern.slice("domain:".length);

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    if (domainPattern.startsWith("*.")) {
      // Wildcard subdomain match
      const baseDomain = domainPattern.slice(2);
      return hostname.endsWith(baseDomain) && hostname !== baseDomain;
    }
    return hostname === domainPattern;
  } catch {
    return false;
  }
}

/**
 * Check if a tool call matches a permission rule.
 */
function matchesRule(
  toolName: string,
  toolInput: Record<string, unknown>,
  rule: string
): boolean {
  const parsed = parseRule(rule);
  if (!parsed) return false;

  // Tool name must match
  if (parsed.tool !== toolName) return false;

  // Check based on tool category
  if (FILE_PATTERN_TOOLS.has(toolName)) {
    const filePath = toolInput.file_path as string | undefined;
    if (!filePath) return false;
    return matchesGlob(filePath, parsed.pattern);
  }

  if (BASH_PREFIX_TOOLS.has(toolName)) {
    const command = toolInput.command as string | undefined;
    if (!command) return false;
    return matchesPrefix(command, parsed.pattern);
  }

  if (DOMAIN_TOOLS.has(toolName)) {
    const url = toolInput.url as string | undefined;
    if (!url) return false;
    return matchesDomain(url, parsed.pattern);
  }

  // Unknown tool category - no match
  return false;
}

/**
 * Check if a tool call is allowed given the current mode's permissions.
 * This is a pure function with no I/O.
 *
 * Returns:
 * - "allow" if tool matches an allow rule (and no deny rule)
 * - "deny" if tool matches a deny rule
 * - "pass" if no rules match (let Claude Code decide)
 */
export function checkToolPermission(
  input: ToolCheckInput,
  permissions: ModePermissions | null
): ToolCheckResult {
  // No permissions configured - pass through
  if (!permissions) {
    return { decision: "pass" };
  }

  const { tool_name, tool_input } = input;

  // Check if tool is in a known category
  const isKnownTool =
    FILE_PATTERN_TOOLS.has(tool_name) ||
    BASH_PREFIX_TOOLS.has(tool_name) ||
    DOMAIN_TOOLS.has(tool_name);

  if (!isKnownTool) {
    return { decision: "pass" };
  }

  // Check deny rules first (deny takes precedence)
  for (const rule of permissions.deny) {
    if (matchesRule(tool_name, tool_input, rule)) {
      return {
        decision: "deny",
        reason: `Blocked by deny rule: ${rule}`,
      };
    }
  }

  // Check allow rules
  for (const rule of permissions.allow) {
    if (matchesRule(tool_name, tool_input, rule)) {
      return { decision: "allow" };
    }
  }

  // No matching rules - pass through
  return { decision: "pass" };
}

/**
 * Format the permission check result as a PreToolUse hook response.
 * This is a pure function with no I/O.
 */
export function formatHookResponse(result: ToolCheckResult): HookResponse {
  // Pass means we don't include hookSpecificOutput - let Claude Code decide
  if (result.decision === "pass") {
    return {};
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      ...(result.reason && { permissionDecisionReason: result.reason }),
    },
  };
}
