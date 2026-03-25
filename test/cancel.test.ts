import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// Shared mutable mock fns — reconfigured per test in beforeEach
let mockCancelReminder = vi.fn();
let mockLoadConfig = vi.fn().mockReturnValue({
  apiKey: "rm_test",
  apiUrl: "http://localhost:3000",
});

vi.mock("../src/lib/client.js", () => {
  const AuthError = class AuthError extends Error {
    readonly exitCode = 3;
    constructor(message: string) {
      super(message);
      this.name = "AuthError";
    }
  };
  const ApiError = class ApiError extends Error {
    readonly exitCode = 1;
    constructor(message: string) {
      super(message);
      this.name = "ApiError";
    }
  };
  const NotFoundError = class NotFoundError extends Error {
    readonly exitCode = 2;
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  };
  const PingfyrClient = vi.fn(function (this: unknown) {
    return { cancelReminder: mockCancelReminder };
  });
  return { PingfyrClient, AuthError, ApiError, NotFoundError };
});

vi.mock("../src/lib/config.js", () => {
  const ConfigManager = vi.fn(function (this: unknown) {
    return { getAll: mockLoadConfig };
  });
  return { ConfigManager };
});

vi.mock("../src/lib/spinner.js", () => ({
  withSpinner: vi.fn((_text: string, _isJson: boolean, fn: (s: null) => Promise<unknown>) =>
    fn(null)
  ),
}));

// Import after mocks
const { cancelCommand } = await import("../src/commands/cancel.js");

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  cancelCommand(program);
  return program;
}

const TEST_ID = "reminder-uuid-123";

beforeEach(() => {
  mockCancelReminder = vi.fn().mockResolvedValue({ message: "Reminder cancelled" });
  mockLoadConfig = vi.fn().mockReturnValue({ apiKey: "rm_test", apiUrl: "http://localhost:3000" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cancel command — success cases", () => {
  test("cancelReminder called with correct id, success message to stdout, exits 0", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "cancel", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(mockCancelReminder).toHaveBeenCalledWith(TEST_ID);
    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("cancelled");
    expect(written).toContain(TEST_ID);
  });

  test("--json flag outputs JSON envelope with success=true and id, exits 0", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync(["node", "pingfyr", "cancel", TEST_ID, "--json"])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(written.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.data.id).toBe(TEST_ID);
  });
});

describe("cancel command — config errors", () => {
  test("missing apiKey in config exits with code 3", async () => {
    mockLoadConfig = vi
      .fn()
      .mockReturnValue({ apiKey: undefined, apiUrl: "http://localhost:3000" });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "cancel", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("API key");
  });
});

describe("cancel command — API errors", () => {
  test("NotFoundError from cancelReminder writes not-found message to stderr, exits 2", async () => {
    const { NotFoundError } = await import("../src/lib/client.js");
    mockCancelReminder = vi.fn().mockRejectedValue(new NotFoundError("Reminder not found"));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "cancel", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(2);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("not found");
  });

  test("ApiError (409) from cancelReminder exits with code 1", async () => {
    const ApiErr = class extends Error {
      readonly exitCode = 1;
    };
    mockCancelReminder = vi.fn().mockRejectedValue(new ApiErr("API error: 409"));

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "cancel", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test("AuthError from PingfyrClient constructor exits with code 3", async () => {
    const { AuthError } = await import("../src/lib/client.js");
    mockCancelReminder = vi.fn().mockRejectedValue(new AuthError("Invalid API key"));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "cancel", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("Invalid API key");
  });
});
