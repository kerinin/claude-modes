import { ConfigLoader } from "./config.js";

export interface ModeState {
  currentMode: string;
  updatedAt: string;
}

export class StateManager {
  private config: ConfigLoader;
  private state: ModeState | null = null;

  constructor(config: ConfigLoader) {
    this.config = config;
  }

  async load(): Promise<void> {
    // TODO: Load .claude/mode-state.json or initialize with default
  }

  async save(): Promise<void> {
    // TODO: Atomic write to .claude/mode-state.json
  }

  getCurrentMode(): string {
    // TODO: Return current mode
    return this.state?.currentMode ?? this.config.getDefaultMode();
  }

  async transition(targetMode: string): Promise<void> {
    // TODO: Update current mode and save
  }

  async reset(): Promise<void> {
    // TODO: Reset to default mode
  }
}
