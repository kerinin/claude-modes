import { ContextData } from "./types.js";

/**
 * Render mode context data as human-readable text for prompt injection.
 * This is a pure function with no I/O.
 */
export function renderContext(data: ContextData | null): string {
  if (data === null) {
    return "";
  }

  const sections: string[] = [];

  // Mode header
  sections.push(`MODE: ${data.currentMode}`);

  // Instructions (if provided)
  if (data.instructions && data.instructions.trim().length > 0) {
    sections.push(`INSTRUCTIONS:\n${data.instructions}`);
  }

  // Permissions (if provided and non-empty)
  if (data.permissions) {
    const hasAllow = data.permissions.allow.length > 0;
    const hasDeny = data.permissions.deny.length > 0;

    if (hasAllow || hasDeny) {
      const permLines: string[] = ["PERMISSIONS:"];

      if (hasAllow) {
        permLines.push("Allowed:");
        for (const rule of data.permissions.allow) {
          permLines.push(`  - ${rule}`);
        }
      }

      if (hasDeny) {
        permLines.push("Denied:");
        for (const rule of data.permissions.deny) {
          permLines.push(`  - ${rule}`);
        }
      }

      sections.push(permLines.join("\n"));
    }
  }

  // Transitions (if any)
  if (data.transitions.length > 0) {
    const transLines: string[] = ["AVAILABLE TRANSITIONS:"];

    for (const transition of data.transitions) {
      transLines.push(`→ ${transition.to}`);
      transLines.push(`  Constraint: ${transition.constraint}`);
    }

    sections.push(transLines.join("\n"));

    // Add transition instructions
    sections.push(
      "When you believe a constraint is satisfied, call mode_transition " +
        "with your target mode and an explanation of why the constraint is met."
    );
  }

  // Add general mode guidance
  sections.push(
    "MODE GUIDANCE: If an action is blocked by mode permissions, briefly explain " +
      "the constraint. Do not suggest mode transitions - you can only transition when " +
      "constraints are met. The user can force a mode change with /mode <name> if needed."
  );

  return sections.join("\n\n");
}
