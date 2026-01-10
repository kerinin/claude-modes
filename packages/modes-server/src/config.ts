export interface ModeTransition {
  to: string;
  constraint: string;
}

export interface ModeDefinition {
  transitions: ModeTransition[];
}

export interface ModesConfig {
  name: string;
  default: string;
  modes: Record<string, ModeDefinition>;
}

export class ConfigLoader {
  private config: ModesConfig | null = null;

  async load(): Promise<void> {
    // TODO: Load and parse .claude/modes.yaml
  }

  getConfig(): ModesConfig {
    if (!this.config) {
      throw new Error("Config not loaded");
    }
    return this.config;
  }

  getMode(name: string): ModeDefinition | undefined {
    // TODO: Return mode definition by name
    return undefined;
  }

  getDefaultMode(): string {
    // TODO: Return default mode name
    return "idle";
  }
}
