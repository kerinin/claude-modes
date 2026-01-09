export interface ModeTransition {
  to: string;
  constraint: string;
}

export interface ModePermissions {
  allow: string[];
  deny: string[];
}

export interface ContextData {
  currentMode: string;
  instructions: string | null;
  permissions: ModePermissions | null;
  transitions: ModeTransition[];
}

export interface ToolCheckInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ToolCheckResult {
  // "allow" | "deny" | "pass" (pass = let Claude Code decide)
  decision: "allow" | "deny" | "pass";
  reason?: string;
}

export interface HookResponse {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny";
    permissionDecisionReason?: string;
  };
}

// Status endpoint types
export interface TransitionHistoryEntry {
  from: string;
  to: string;
  timestamp: string; // ISO 8601
  explanation: string;
}

export interface ModeStatus {
  currentMode: string;
  initialMode: string;
  lastTransition: string | null; // ISO 8601 or null if fresh
  transitionHistory: TransitionHistoryEntry[];
}

export interface StatusError {
  error: string;
  details?: string;
}

// MCP tool types
export interface TransitionInput {
  target_state: string;
  explanation: string;
}

export interface TransitionSuccess {
  success: true;
  new_state: string;
}

export interface TransitionFailure {
  success: false;
  reason: string;
}

export type TransitionResult = TransitionSuccess | TransitionFailure;

// Config types (minimal for transition validation)
export interface ModeConfig {
  name: string;
  transitions: ModeTransition[];
}

export interface WorkflowConfig {
  initial: string;
  states: Record<string, ModeConfig>;
}

// Slash command types
export interface SlashCommandResult {
  output: string;
  success: boolean;
}

// Config loading types
export interface ModesYaml {
  name: string;
  default: string;
  modes: Record<string, {
    transitions: ModeTransition[];
  }>;
}

export interface ModeSettingsFile {
  permissions?: ModePermissions;
}

export interface LoadedModeConfig {
  instructions: string | null;
  permissions: ModePermissions | null;
}

export interface ConfigLoadResult {
  success: true;
  config: WorkflowConfig;
  modeConfigs: Record<string, LoadedModeConfig>;
} | {
  success: false;
  error: string;
}
