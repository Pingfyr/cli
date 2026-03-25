import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ConfigManager } from "../src/lib/config.js";

// Use isolated temp directory for each test to avoid polluting ~/.config/pingfyr
let tempDir: string;
let config: ConfigManager;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pingfyr-test-"));
  config = new ConfigManager(tempDir);
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("CFG-01: config set api-key", () => {
  test("persists API key to conf store", () => {
    config.setApiKey("rm_test_key_123456");
    expect(config.getApiKey()).toBe("rm_test_key_123456");
  });

  test("overwrites existing API key", () => {
    config.setApiKey("rm_old_key");
    config.setApiKey("rm_new_key");
    expect(config.getApiKey()).toBe("rm_new_key");
  });
});

describe("CFG-02: config set api-url", () => {
  test("persists API URL to conf store", () => {
    config.setApiUrl("https://pingfyr.com");
    expect(config.getApiUrl()).toBe("https://pingfyr.com");
  });

  test("overwrites existing API URL", () => {
    config.setApiUrl("https://old.example.com");
    config.setApiUrl("https://new.example.com");
    expect(config.getApiUrl()).toBe("https://new.example.com");
  });
});

describe("CFG-03: PINGFYR_API_KEY env var overrides config file", () => {
  test("env var takes precedence over stored key", () => {
    config.setApiKey("rm_file_key_456");
    vi.stubEnv("PINGFYR_API_KEY", "rm_env_key_789");

    expect(config.getApiKey()).toBe("rm_env_key_789");
  });

  test("stored key returned when env var not set", () => {
    config.setApiKey("rm_file_key_only");
    // No env var set
    expect(config.getApiKey()).toBe("rm_file_key_only");
  });

  test("env var does not modify the stored file value", () => {
    config.setApiKey("rm_file_key_original");
    vi.stubEnv("PINGFYR_API_KEY", "rm_env_override");

    // Env var is returned
    expect(config.getApiKey()).toBe("rm_env_override");

    // After unsetting env var, original file value is still there
    vi.unstubAllEnvs();
    expect(config.getApiKey()).toBe("rm_file_key_original");
  });
});

describe("CFG-04: Config file location", () => {
  test("conf store path is set (platform-aware via conf library)", () => {
    // conf library determines the correct platform path
    // We verify it exists as a string (not undefined or empty)
    expect(config.configPath).toBeTruthy();
    expect(typeof config.configPath).toBe("string");
  });
});

describe("show(): API key masking", () => {
  test("masks API key keeping first 3 and last 4 chars", () => {
    config.setApiKey("rm_longkeyvalue1234");
    const shown = config.show();
    expect(shown.apiKey).toBe("rm_****1234");
  });

  test("returns undefined for apiKey when not set", () => {
    const shown = config.show();
    expect(shown.apiKey).toBeUndefined();
  });

  test("returns apiUrl unmasked", () => {
    config.setApiUrl("https://pingfyr.com");
    const shown = config.show();
    expect(shown.apiUrl).toBe("https://pingfyr.com");
  });
});
