import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  PingfyrClient,
  AuthError,
  RateLimitError,
  NotFoundError,
  ApiError,
} from "../src/lib/client.js";

// Helper to create a mock Response object
function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Error class exit codes", () => {
  test("AuthError has exitCode 3", () => {
    const err = new AuthError("test");
    expect(err.exitCode).toBe(3);
  });
  test("RateLimitError has exitCode 1 and retryAfter", () => {
    const err = new RateLimitError(60, "test");
    expect(err.exitCode).toBe(1);
    expect(err.retryAfter).toBe(60);
  });
  test("NotFoundError has exitCode 2", () => {
    const err = new NotFoundError("test");
    expect(err.exitCode).toBe(2);
  });
  test("ApiError has exitCode 1", () => {
    const err = new ApiError("test");
    expect(err.exitCode).toBe(1);
  });
});

describe("PingfyrClient constructor", () => {
  test("throws AuthError when apiKey is empty string", () => {
    expect(() => new PingfyrClient("", "https://pingfyr.com")).toThrow(AuthError);
  });
  test("throws AuthError when apiKey does not start with rm_", () => {
    expect(() => new PingfyrClient("bad_key", "https://pingfyr.com")).toThrow(AuthError);
  });
  test("constructs successfully with valid rm_ prefixed key", () => {
    expect(() => new PingfyrClient("rm_validkey", "https://pingfyr.com")).not.toThrow();
  });
});

describe("PingfyrClient.request() — HTTP behavior", () => {
  let client: PingfyrClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new PingfyrClient("rm_testkey123", "https://pingfyr.com");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  test("sends Authorization Bearer header", async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { data: [], count: 0 }));
    await client.listReminders();
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer rm_testkey123",
    });
  });

  test("throws AuthError on 401", async () => {
    fetchSpy.mockResolvedValue(mockResponse(401, { error: "Unauthorized" }));
    await expect(client.listReminders()).rejects.toThrow(AuthError);
  });

  test("throws NotFoundError on 404", async () => {
    fetchSpy.mockResolvedValue(mockResponse(404, { error: "Not found" }));
    await expect(client.cancelReminder("nonexistent")).rejects.toThrow(NotFoundError);
  });

  test("throws RateLimitError on 429 with Retry-After header", async () => {
    fetchSpy.mockResolvedValue(mockResponse(429, { error: "Rate limit" }, { "retry-after": "30" }));
    const err = await client.listReminders().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(30);
  });

  test("throws RateLimitError with default retryAfter 60 when header missing", async () => {
    fetchSpy.mockResolvedValue(mockResponse(429, { error: "Rate limit" }));
    const err = await client.listReminders().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(60);
  });

  test("throws ApiError on 500", async () => {
    fetchSpy.mockResolvedValue(mockResponse(500, { error: "Server error" }));
    await expect(client.listReminders()).rejects.toThrow(ApiError);
  });

  test("throws ApiError with timeout message on abort", async () => {
    fetchSpy.mockRejectedValue(Object.assign(new DOMException("Aborted", "AbortError")));
    const err = await client.listReminders().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/timeout/i);
  });

  test("throws ApiError on network error (TypeError)", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await client.listReminders().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe("PingfyrClient.listReminders()", () => {
  let client: PingfyrClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new PingfyrClient("rm_testkey123", "https://pingfyr.com");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  test("calls GET /api/reminders with no params", async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { data: [], count: 0 }));
    await client.listReminders();
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/reminders");
  });

  test("appends status query param when provided", async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { data: [], count: 0 }));
    await client.listReminders({ status: "pending" });
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("status=pending");
  });

  test("appends limit and offset params when provided", async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { data: [], count: 0 }));
    await client.listReminders({ limit: 10, offset: 20 });
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("limit=10");
    expect(String(url)).toContain("offset=20");
  });

  test("returns typed ListRemindersResponse", async () => {
    const mockData = { data: [{ id: "abc", title: "Test" }], count: 1 };
    fetchSpy.mockResolvedValue(mockResponse(200, mockData));
    const result = await client.listReminders();
    expect(result.count).toBe(1);
    expect(result.data[0].id).toBe("abc");
  });
});

describe("PingfyrClient.cancelReminder()", () => {
  let client: PingfyrClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new PingfyrClient("rm_testkey123", "https://pingfyr.com");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  test("calls DELETE /api/remind/:id", async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { message: "Reminder cancelled" }));
    await client.cancelReminder("reminder-uuid-123");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/remind/reminder-uuid-123");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

describe("PingfyrClient.createReminder()", () => {
  let client: PingfyrClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new PingfyrClient("rm_testkey123", "https://pingfyr.com");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  test("calls POST /api/remind with JSON body", async () => {
    const mockReminder = { id: "new-uuid", title: "Test", status: "pending" };
    fetchSpy.mockResolvedValue(mockResponse(201, mockReminder));
    const payload = {
      title: "Test",
      channel: "email" as const,
      recipients: ["test@example.com"],
      fire_at: "2026-03-01T09:00:00Z",
    };
    await client.createReminder(payload);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/remind");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string).title).toBe("Test");
  });
});
