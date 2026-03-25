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
  const PingfyrClient = vi.fn(function (this: unknown) {
    return { listReminders: mockListReminders };
  });
  return { PingfyrClient, AuthError, ApiError };
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
const { listCommand } = await import("../src/commands/list.js");

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  listCommand(program);
  return program;
}

const mockReminders = [
  {
    id: "abc123",
    title: "Daily standup",
    channel_type: "email",
    status: "pending",
    fire_at: "2026-03-01T09:00:00Z",
  },
  {
    id: "def456",
    title: "Weekly report",
    channel_type: "slack",
    status: "delivered",
    fire_at: "2026-02-28T10:00:00Z",
  },
];

const mockListResponse = { data: mockReminders, count: 2 };

beforeEach(() => {
  mockListReminders = vi.fn().mockResolvedValue(mockListResponse);
  mockLoadConfig = vi.fn().mockReturnValue({ apiKey: "rm_test", apiUrl: "http://localhost:3000" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("list command — success cases", () => {
  test("fetches reminders and renders table to stdout", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "list"])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    // Table should contain column headers
    expect(written).toContain("ID");
    expect(written).toContain("Title");
    expect(written).toContain("Channel");
    expect(written).toContain("Status");
    expect(written).toContain("Scheduled");
  });

  test("--status pending passes status=pending to listReminders", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync(["node", "pingfyr", "list", "--status", "pending"])
    ).rejects.toThrow("process.exit");

    expect(mockListReminders).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  });

  test("--json flag outputs JSON envelope with data array and count", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "list", "--json"])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(written.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.data.count).toBe(2);
    expect(Array.isArray(parsed.data.data)).toBe(true);
    expect(parsed.data.data).toHaveLength(2);
  });

  test("empty result renders 'No results found.' message", async () => {
    mockListReminders = vi.fn().mockResolvedValue({ data: [], count: 0 });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "list"])).rejects.toThrow("process.exit");

    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("No results found.");
  });
});

describe("list command — config errors", () => {
  test("missing apiKey in config exits with code 3", async () => {
    mockLoadConfig = vi
      .fn()
      .mockReturnValue({ apiKey: undefined, apiUrl: "http://localhost:3000" });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "list"])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("API key");
  });
});

describe("list command — API errors", () => {
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
    await expect(program.parseAsync(["node", "pingfyr", "list"])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test("AuthError from listReminders exits with code 3", async () => {
    const AuthErr = class extends Error {
      readonly exitCode = 3;
    };
    mockListReminders = vi.fn().mockRejectedValue(new AuthErr("Invalid key"));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync(["node", "pingfyr", "list"])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("Invalid key");
  });
});
