import Conf from "conf";
import type { ConfigSchema } from "../types.js";

export class ConfigManager {
  private store: Conf<ConfigSchema>;

  constructor(testDir?: string) {
    this.store = new Conf<ConfigSchema>({
      projectName: "pingfyr",
      // testDir allows tests to use an isolated temp directory
      ...(testDir ? { cwd: testDir } : {}),
    });
  }

  getApiKey(): string | undefined {
    // Env var takes precedence over file — always check first
    return process.env.PINGFYR_API_KEY || this.store.get("apiKey");
  }

  getApiUrl(): string | undefined {
    return process.env.PINGFYR_API_URL || this.store.get("apiUrl");
  }

  setApiKey(value: string): void {
    this.store.set("apiKey", value);
  }

  setApiUrl(value: string): void {
    this.store.set("apiUrl", value);
  }

  getAll(): ConfigSchema {
    return {
      apiKey: this.getApiKey(),
      apiUrl: this.getApiUrl(),
    };
  }

  /**
   * Returns config for display — API key is masked (first 3 + last 4 chars visible).
   * Example: "rm_longkeyvalue1234" → "rm_****1234"
   */
  show(): Record<string, string | undefined> {
    const apiKey = this.getApiKey();
    return {
      apiKey: apiKey ? `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}` : undefined,
      apiUrl: this.getApiUrl(),
    };
  }

  /**
   * Returns the underlying conf store path (for display/debugging).
   */
  get configPath(): string {
    return this.store.path;
  }
}
