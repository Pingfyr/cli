import type {
  ReminderRecord,
  ListRemindersResponse,
  CreateReminderRequest,
  UpdateReminderRequest,
  ListRemindersParams,
} from "../types.js";

// --- Error classes ---

export class AuthError extends Error {
  readonly exitCode = 3;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class RateLimitError extends Error {
  readonly exitCode = 1;
  constructor(
    readonly retryAfter: number,
    message = "Rate limit exceeded"
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class NotFoundError extends Error {
  readonly exitCode = 2;
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ApiError extends Error {
  readonly exitCode = 1;
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// --- HTTP Client ---

const DEFAULT_TIMEOUT_MS = 10_000;

export class PingfyrClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(apiKey: string, apiUrl: string) {
    if (!apiKey) {
      throw new AuthError("API key is required. Run: pingfyr config set --api-key <key>");
    }
    if (!apiKey.startsWith("rm_")) {
      throw new AuthError(
        "Invalid API key format (must start with rm_). Run: pingfyr config set --api-key <key>"
      );
    }
    if (!apiUrl.startsWith("https://") && !process.env.PINGFYR_ALLOW_HTTP) {
      throw new ApiError(
        "API URL must use HTTPS. Set PINGFYR_ALLOW_HTTP=1 for development."
      );
    }
    this.apiKey = apiKey;
    this.apiUrl = apiUrl.replace(/\/$/, "");
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.apiUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new AuthError(
          "API key is invalid or revoked. Run: pingfyr config set --api-key <key>"
        );
      }

      if (response.status === 404) {
        throw new NotFoundError("Resource not found");
      }

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
        throw new RateLimitError(
          isNaN(retryAfter) ? 60 : retryAfter,
          `Rate limit exceeded. Retry after ${isNaN(retryAfter) ? 60 : retryAfter} seconds.`
        );
      }

      if (!response.ok) {
        throw new ApiError(`API error: ${response.status}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      if (
        err instanceof AuthError ||
        err instanceof RateLimitError ||
        err instanceof NotFoundError ||
        err instanceof ApiError
      ) {
        throw err;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError("Request timeout (10s). Check your network connection.");
      }
      if (err instanceof TypeError) {
        throw new ApiError(`Network error: ${err.message}`);
      }
      throw new ApiError(`Unexpected error: ${String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listReminders(params?: ListRemindersParams): Promise<ListRemindersResponse> {
    const url = new URL("/api/reminders", this.apiUrl);
    if (params?.status) url.searchParams.set("status", params.status);
    if (params?.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    if (params?.offset !== undefined) url.searchParams.set("offset", String(params.offset));
    return this.request<ListRemindersResponse>("GET", url.pathname + url.search);
  }

  async createReminder(body: CreateReminderRequest): Promise<ReminderRecord> {
    return this.request<ReminderRecord>("POST", "/api/remind", body);
  }

  async cancelReminder(id: string): Promise<{ message: string }> {
    this.validateId(id);
    return this.request<{ message: string }>("DELETE", `/api/remind/${id}`);
  }

  async updateReminder(id: string, body: UpdateReminderRequest): Promise<ReminderRecord> {
    this.validateId(id);
    return this.request<ReminderRecord>("PATCH", `/api/remind/${id}`, body);
  }

  private validateId(id: string): void {
    if (!id || /[/?#\s]|\.\./.test(id)) {
      throw new ApiError("Invalid reminder ID format");
    }
  }
}
