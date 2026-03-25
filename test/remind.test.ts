import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// Shared mutable mock fns — can be reconfigured per test
let mockCreateReminder = vi.fn();
let mockLoadConfig = vi.fn().mockReturnValue({
  apiKey: "rm_test",
  apiUrl: "http://localhost:3000",
});

// Mutable mock implementations for time-parser — reconfigured per test
let mockParseIn = vi.fn();
let mockParseAt = vi.fn();
let mockFormatScheduled = vi.fn();

// Mutable readline question mock — reconfigured per test
let mockReadlineQuestion = vi.fn().mockResolvedValue("y");

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
  // PingfyrClient is a factory fn so it doesn't close over the outer vi.fn()
  const PingfyrClient = vi.fn(function (this: unknown) {
    return { createReminder: mockCreateReminder };
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

vi.mock("../src/lib/time-parser.js", () => ({
  get parseIn() {
    return mockParseIn;
  },
  get parseAt() {
    return mockParseAt;
  },
  get formatScheduled() {
    return mockFormatScheduled;
  },
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    get question() {
      return mockReadlineQuestion;
    },
    close: vi.fn(),
  })),
}));

// Import after mocks
const { remindCommand } = await import("../src/commands/remind.js");

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  remindCommand(program);
  return program;
}

const defaultArgs = [
  "node",
  "pingfyr",
  "remind",
  "--channel",
  "email",
  "--recipients",
  "alice@example.com",
  "--fire-at",
  "2026-03-01T09:00:00Z",
];

const mockReminderResult = {
  id: "abc-123",
  title: "Test reminder",
  channel_type: "email",
  fire_at: "2026-03-01T09:00:00Z",
  status: "pending",
};

beforeEach(() => {
  // Reset mock fns without clearing the factory implementations
  mockCreateReminder = vi.fn().mockResolvedValue(mockReminderResult);
  mockLoadConfig = vi.fn().mockReturnValue({ apiKey: "rm_test", apiUrl: "http://localhost:3000" });
  mockParseIn = vi.fn().mockReturnValue("2026-03-11T10:30:00.000Z");
  mockParseAt = vi.fn().mockReturnValue({ iso: "2026-03-12T09:00:00.000Z", isPast: false });
  mockFormatScheduled = vi.fn().mockReturnValue("today at 10:30 (UTC)");
  mockReadlineQuestion = vi.fn().mockResolvedValue("y");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("remind command — success cases", () => {
  test("creates reminder with valid options and writes 'Scheduled for' to stdout", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync([...defaultArgs, "--message", "Hello"])).rejects.toThrow(
      "process.exit"
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("Scheduled for");
  });

  test("with --json flag, stdout is valid JSON with success: true envelope", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync([...defaultArgs, "--json"])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(written.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.data.id).toBe("abc-123");
  });

  test("recipients with spaces are trimmed and split correctly", async () => {
    vi.spyOn(process.exit, "bind");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "alice@example.com, bob@example.com",
        "--fire-at",
        "2026-03-01T09:00:00Z",
      ])
    ).rejects.toThrow("process.exit");

    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ["alice@example.com", "bob@example.com"],
      })
    );
  });
});

describe("remind command — validation errors", () => {
  test("missing --channel causes Commander to throw (exitOverride)", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const program = makeProgram();
    // Commander's exitOverride causes it to throw CommanderError instead of calling process.exit
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--recipients",
        "alice@example.com",
        "--fire-at",
        "2026-03-01T09:00:00Z",
      ])
    ).rejects.toThrow();
  });

  test("missing apiKey in config exits with code 3", async () => {
    mockLoadConfig = vi
      .fn()
      .mockReturnValue({ apiKey: undefined, apiUrl: "http://localhost:3000" });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync([...defaultArgs])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("API key");
  });
});

describe("remind command — API errors", () => {
  test("PingfyrClient throws AuthError — stderr contains message, exits 3", async () => {
    const AuthErr = class extends Error {
      readonly exitCode = 3;
    };
    mockCreateReminder = vi.fn().mockRejectedValue(new AuthErr("Invalid API key"));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync([...defaultArgs])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(3);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("Invalid API key");
  });

  test("PingfyrClient throws ApiError — exits 1", async () => {
    const ApiErr = class extends Error {
      readonly exitCode = 1;
    };
    mockCreateReminder = vi.fn().mockRejectedValue(new ApiErr("Server error"));

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(program.parseAsync([...defaultArgs])).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("remind command — --in flag", () => {
  test("--in 30m schedules reminder using parseIn and exits 0", async () => {
    mockParseIn = vi.fn().mockReturnValue("2026-03-11T10:30:00.000Z");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--in",
        "30m",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockParseIn).toHaveBeenCalledWith("30m");
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ fire_at: "2026-03-11T10:30:00.000Z" })
    );
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("Scheduled for");
  });
});

describe("remind command — --at flag", () => {
  test("--at '9am' with isPast=false: creates reminder, exits 0", async () => {
    mockParseAt = vi.fn().mockReturnValue({ iso: "2026-03-12T09:00:00.000Z", isPast: false });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--at",
        "9am",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockParseAt).toHaveBeenCalledWith(
      "9am",
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ fire_at: "2026-03-12T09:00:00.000Z" })
    );
  });

  test("--at resolves to past time: user enters 'y' — schedules, exits 0", async () => {
    mockParseAt = vi.fn().mockReturnValue({ iso: "2026-03-10T09:00:00.000Z", isPast: true });
    mockReadlineQuestion = vi.fn().mockResolvedValue("y");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--at",
        "yesterday 9am",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockCreateReminder).toHaveBeenCalled();
  });

  test("--at resolves to past time: user enters 'n' — aborts, exits 1", async () => {
    mockParseAt = vi.fn().mockReturnValue({ iso: "2026-03-10T09:00:00.000Z", isPast: true });
    mockReadlineQuestion = vi.fn().mockResolvedValue("n");

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--at",
        "yesterday 9am",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCreateReminder).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("Aborted");
  });
});

describe("remind command — mutual exclusion", () => {
  test("--fire-at and --in together: exits 1 with 'mutually exclusive', no API call", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--fire-at",
        "2026-03-12T09:00:00Z",
        "--in",
        "30m",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCreateReminder).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("mutually exclusive");
  });

  test("--in and --at together: exits 1 with 'mutually exclusive', no API call", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--in",
        "30m",
        "--at",
        "9am",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCreateReminder).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("mutually exclusive");
  });

  test("omitting all three time flags: exits 1 with 'required', no API call", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCreateReminder).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("required");
  });
});

describe("remind command — repeat and cron flags", () => {
  test("--repeat daily with --in 1h: createReminder called with repeat='daily'", async () => {
    mockParseIn = vi.fn().mockReturnValue("2026-03-11T11:00:00.000Z");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--in",
        "1h",
        "--repeat",
        "daily",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockCreateReminder).toHaveBeenCalledWith(expect.objectContaining({ repeat: "daily" }));
  });

  test("--cron '0 9 * * 1' with --repeat custom and --in 1h: passes cron_expression to API", async () => {
    mockParseIn = vi.fn().mockReturnValue("2026-03-11T11:00:00.000Z");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--in",
        "1h",
        "--repeat",
        "custom",
        "--cron",
        "0 9 * * 1",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ repeat: "custom", cron_expression: "0 9 * * 1" })
    );
  });
});

describe("remind command — --at with --timezone flag", () => {
  test("--at 'tomorrow 10am' --timezone Europe/Istanbul passes timezone to parseAt", async () => {
    mockParseAt = vi.fn().mockReturnValue({ iso: "2026-03-12T07:00:00.000Z", isPast: false });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--at",
        "tomorrow 10am",
        "--timezone",
        "Europe/Istanbul",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockParseAt).toHaveBeenCalledWith("tomorrow 10am", "Europe/Istanbul");
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ fire_at: "2026-03-12T07:00:00.000Z" })
    );
  });

  test("--at with no --timezone: parseAt called with system timezone default", async () => {
    mockParseAt = vi.fn().mockReturnValue({ iso: "2026-03-12T09:00:00.000Z", isPast: false });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--at",
        "tomorrow 9am",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockParseAt).toHaveBeenCalledWith(
      "tomorrow 9am",
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  });
});

describe("remind command — success output format", () => {
  test("success output contains 'Scheduled for' and the formatted label from formatScheduled", async () => {
    mockParseIn = vi.fn().mockReturnValue("2026-03-11T10:30:00.000Z");
    mockFormatScheduled = vi.fn().mockReturnValue("today at 10:30 (Europe/Berlin)");

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "email",
        "--recipients",
        "x@y.com",
        "--in",
        "30m",
        "--timezone",
        "Europe/Berlin",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("Scheduled for");
    expect(written).toContain("today at 10:30 (Europe/Berlin)");
  });
});

describe("remind command — telegram channel", () => {
  test("--channel telegram --recipients 'bot:uuid:chatid' passes correct channel and recipients to createReminder", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "telegram",
        "--recipients",
        "bot:550e8400-e29b-41d4-a716-446655440000:123456789",
        "--fire-at",
        "2026-03-01T09:00:00Z",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        recipients: ["bot:550e8400-e29b-41d4-a716-446655440000:123456789"],
      })
    );
  });

  test("--channel telegram with multiple bot recipients splits and trims correctly", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        "node",
        "pingfyr",
        "remind",
        "--channel",
        "telegram",
        "--recipients",
        "bot:aaaa-bbbb:111, bot:cccc-dddd:222",
        "--fire-at",
        "2026-03-01T09:00:00Z",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        recipients: ["bot:aaaa-bbbb:111", "bot:cccc-dddd:222"],
      })
    );
  });
});
