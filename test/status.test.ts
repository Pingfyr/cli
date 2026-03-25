import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// Shared mutable mock fns — reconfigured per test in beforeEach
let mockListReminders = vi.fn();
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
    return { listReminders: mockListReminders };
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
const { statusCommand } = await import("../src/commands/status.js");

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  statusCommand(program);
  return program;
}

const TEST_ID = "reminder-uuid-123";

const mockReminder = {
  id: TEST_ID,
  title: "Daily standup",
  body: "Let's sync up",
  channel_type: "email",
  recipients: ["alice@example.com", "bob@example.com"],
  fire_at: "2026-03-01T09:00:00Z",
  status: "pending" as const,
  timezone: "UTC",
  created_at: "2026-02-26T10:00:00Z",
};

beforeEach(() => {
  mockListReminders = vi.fn().mockResolvedValue({ data: [mockReminder], count: 1 });
  mockLoadConfig = vi.fn().mockReturnValue({ apiKey: "rm_test", apiUrl: "http://localhost:3000" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("status command — success cases", () => {
  test("listReminders returns matching id, detail output to stdout, exits 0", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "status", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("ID");
    expect(written).toContain(TEST_ID);
    expect(written).toContain("Channel");
    expect(written).toContain("Status");
  });

  test("--json flag outputs JSON envelope with full reminder object, exits 0", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync(["node", "pingfyr", "status", TEST_ID, "--json"])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(written.trim());
    expect(parsed.success).toBe(true);
  });
});

describe("status command — not found cases", () => {
  test("listReminders returns array without matching id, exits 2", async () => {
    mockListReminders = vi.fn().mockResolvedValue({
      data: [{ ...mockReminder, id: "different-id" }],
      count: 1,
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "status", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(2);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("not found");
  });

  test("empty list (count=0, data=[]) exits 2 (not found)", async () => {
    mockListReminders = vi.fn().mockResolvedValue({ data: [], count: 0 });

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "status", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe("status command — config errors", () => {
  test("missing apiKey in config exits with code 3", async () => {
    mockLoadConfig = vi
      .fn()
      .mockReturnValue({ apiKey: undefined, apiUrl: "http://localhost:3000" });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "status", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("API key");
  });
});

describe("status command — API errors", () => {
  test("ApiError from listReminders exits with code 1", async () => {
    const ApiErr = class extends Error {
      readonly exitCode = 1;
    };
    mockListReminders = vi.fn().mockRejectedValue(new ApiErr("Server error"));

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "status", TEST_ID])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
