#!/usr/bin/env node

// src/index.ts
import { Command as Command6 } from "commander";

// src/lib/version.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
function getVersion() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// src/commands/config.ts
import { Command } from "commander";

// src/lib/config.ts
import Conf from "conf";
var ConfigManager = class {
  constructor(testDir) {
    this.store = new Conf({
      projectName: "pingfyr",
      // testDir allows tests to use an isolated temp directory
      ...testDir ? { cwd: testDir } : {}
    });
  }
  getApiKey() {
    return process.env.PINGFYR_API_KEY || this.store.get("apiKey");
  }
  getApiUrl() {
    return process.env.PINGFYR_API_URL || this.store.get("apiUrl");
  }
  setApiKey(value) {
    this.store.set("apiKey", value);
  }
  setApiUrl(value) {
    this.store.set("apiUrl", value);
  }
  getAll() {
    return {
      apiKey: this.getApiKey(),
      apiUrl: this.getApiUrl()
    };
  }
  /**
   * Returns config for display — API key is masked (first 3 + last 4 chars visible).
   * Example: "rm_longkeyvalue1234" → "rm_****1234"
   */
  show() {
    const apiKey = this.getApiKey();
    return {
      apiKey: apiKey ? `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}` : void 0,
      apiUrl: this.getApiUrl()
    };
  }
  /**
   * Returns the underlying conf store path (for display/debugging).
   */
  get configPath() {
    return this.store.path;
  }
};

// src/commands/config.ts
function configCommand(parent) {
  const configManager = new ConfigManager();
  const config = new Command("config").description("Manage Pingfyr API configuration");
  config.command("set").description("Set configuration values").option("--api-key <key>", "API key (starts with rm_)").option("--api-url <url>", "API base URL (default: https://pingfyr.com)").action((options) => {
    if (!options.apiKey && !options.apiUrl) {
      process.stderr.write("Error: Provide at least --api-key or --api-url\n");
      process.exit(1);
    }
    if (options.apiKey) {
      configManager.setApiKey(options.apiKey);
      process.stdout.write("API key saved\n");
    }
    if (options.apiUrl) {
      configManager.setApiUrl(options.apiUrl);
      process.stdout.write("API URL saved\n");
    }
  });
  config.command("show").description("Display current configuration (key masked)").action(() => {
    const cfg = configManager.show();
    if (!cfg.apiKey && !cfg.apiUrl) {
      process.stdout.write("No configuration set. Run: pingfyr config set --api-key <key>\n");
      return;
    }
    process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
  });
  parent.addCommand(config);
}

// src/commands/remind.ts
import { Command as Command2 } from "commander";
import * as readline from "readline/promises";

// src/lib/client.ts
var AuthError = class extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 3;
    this.name = "AuthError";
  }
};
var RateLimitError = class extends Error {
  constructor(retryAfter, message = "Rate limit exceeded") {
    super(message);
    this.retryAfter = retryAfter;
    this.exitCode = 1;
    this.name = "RateLimitError";
  }
};
var NotFoundError = class extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.exitCode = 2;
    this.name = "NotFoundError";
  }
};
var ApiError = class extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 1;
    this.name = "ApiError";
  }
};
var DEFAULT_TIMEOUT_MS = 1e4;
var PingfyrClient = class {
  constructor(apiKey, apiUrl) {
    if (!apiKey) {
      throw new AuthError("API key is required. Run: pingfyr config set --api-key <key>");
    }
    if (!apiKey.startsWith("rm_")) {
      throw new AuthError(
        "Invalid API key format (must start with rm_). Run: pingfyr config set --api-key <key>"
      );
    }
    this.apiKey = apiKey;
    this.apiUrl = apiUrl.replace(/\/$/, "");
  }
  async request(method, path, body) {
    const url = new URL(path, this.apiUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const headers = {
      Authorization: `Bearer ${this.apiKey}`
    };
    if (body !== void 0) {
      headers["Content-Type"] = "application/json";
    }
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== void 0 ? JSON.stringify(body) : void 0,
        signal: controller.signal
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
      return response.json();
    } catch (err) {
      if (err instanceof AuthError || err instanceof RateLimitError || err instanceof NotFoundError || err instanceof ApiError) {
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
  async listReminders(params) {
    const url = new URL("/api/reminders", this.apiUrl);
    if (params?.status) url.searchParams.set("status", params.status);
    if (params?.limit !== void 0) url.searchParams.set("limit", String(params.limit));
    if (params?.offset !== void 0) url.searchParams.set("offset", String(params.offset));
    return this.request("GET", url.pathname + url.search);
  }
  async createReminder(body) {
    return this.request("POST", "/api/remind", body);
  }
  async cancelReminder(id) {
    return this.request("DELETE", `/api/remind/${id}`);
  }
  async updateReminder(id, body) {
    return this.request("PATCH", `/api/remind/${id}`, body);
  }
};

// src/lib/output.ts
import chalk from "chalk";
import Table from "cli-table3";
var MAX_CELL_WIDTH = 40;
function truncate(value, maxLen = MAX_CELL_WIDTH) {
  const str = value === null || value === void 0 ? "\u2014" : String(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
function colorStatus(status) {
  switch (status) {
    case "pending":
      return chalk.yellow(status);
    case "processing":
      return chalk.blue(status);
    case "delivered":
      return chalk.green(status);
    case "failed":
      return chalk.red(status);
    case "cancelled":
    case "channel_restricted":
      return chalk.gray(status);
    default:
      return status;
  }
}
var OutputFormatter = class {
  constructor(isJson) {
    this.isJson = isJson;
  }
  /**
   * Format an array of rows as a table (human) or JSON success envelope (machine).
   * @param rows - Data rows to display
   * @param columns - Column config: key = field name in row, header = display name
   * @param jsonData - Optional: alternate data shape for JSON envelope (defaults to rows)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format(rows, columns, jsonData) {
    if (this.isJson) {
      const envelope = {
        success: true,
        data: jsonData ?? rows
      };
      return JSON.stringify(envelope, null, 2);
    }
    if (rows.length === 0) {
      return chalk.dim("No results found.");
    }
    const table = new Table({
      head: columns.map((c) => chalk.bold(c.header)),
      style: { head: [], border: ["grey"] }
    });
    for (const row of rows) {
      table.push(
        columns.map((c) => {
          const raw = row[c.key];
          const truncated = truncate(raw, c.maxWidth ?? MAX_CELL_WIDTH);
          return c.isStatus ? colorStatus(truncated) : truncated;
        })
      );
    }
    return table.toString();
  }
  /**
   * Format a single object for display (e.g., status command detail view).
   * Human: key-value pairs with labels. JSON: success envelope wrapping the object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail(obj, fields) {
    if (this.isJson) {
      const envelope = { success: true, data: obj };
      return JSON.stringify(envelope, null, 2);
    }
    return fields.map((f) => {
      const value = obj[f.key];
      const display = value === null || value === void 0 ? chalk.dim("\u2014") : String(value);
      const colored = f.isStatus ? colorStatus(display) : display;
      return `${chalk.bold(f.label + ":")} ${colored}`;
    }).join("\n");
  }
  /**
   * Format a success message (e.g., "Reminder cancelled").
   * Human: chalk.green message. JSON: success envelope with message field.
   */
  success(message, data) {
    if (this.isJson) {
      return JSON.stringify({ success: true, data: data ?? { message } }, null, 2);
    }
    return chalk.green(message);
  }
  /**
   * Format an error message for stderr output.
   * Human: chalk.red "Error: <message>" with optional hint. JSON: error envelope.
   */
  error(message, options) {
    if (this.isJson) {
      const envelope = {
        success: false,
        error: options?.errorCode ?? "error",
        message
      };
      return JSON.stringify(envelope, null, 2);
    }
    let output = chalk.red(`Error: ${message}`);
    if (options?.hint) {
      output += `

${options.hint}`;
    }
    return output;
  }
};

// src/lib/spinner.ts
import ora from "ora";
async function withSpinner(text, isJson, fn) {
  if (isJson) {
    return fn(null);
  }
  const spinner = ora(text).start();
  try {
    const result = await fn(spinner);
    spinner.stop();
    return result;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

// src/lib/time-parser.ts
import * as chrono from "chrono-node";
function getTimezoneOffsetMinutes(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const wallYear = get("year"), wallMonth = get("month") - 1, wallDay = get("day");
  const wallHour = get("hour"), wallMinute = get("minute"), wallSecond = get("second");
  const wallAsUtc = Date.UTC(wallYear, wallMonth, wallDay, wallHour, wallMinute, wallSecond);
  return Math.round((date.getTime() - wallAsUtc) / 6e4);
}
function parseIn(duration) {
  const match = duration.trim().match(/^(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days|w|wk|wks|week|weeks)$/i);
  if (!match) {
    throw new Error(`Invalid duration: "${duration}"`);
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = /* @__PURE__ */ new Date();
  let ms = 0;
  if (/^(m|min|mins|minutes)$/.test(unit)) {
    ms = amount * 60 * 1e3;
  } else if (/^(h|hr|hrs|hours)$/.test(unit)) {
    ms = amount * 60 * 60 * 1e3;
  } else if (/^(d|day|days)$/.test(unit)) {
    ms = amount * 24 * 60 * 60 * 1e3;
  } else if (/^(w|wk|wks|week|weeks)$/.test(unit)) {
    ms = amount * 7 * 24 * 60 * 60 * 1e3;
  }
  return new Date(now.getTime() + ms).toISOString();
}
function parseAt(expr, timezone) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error(`Invalid timezone: "${timezone}"`);
  }
  const now = /* @__PURE__ */ new Date();
  const parsed = chrono.parseDate(expr, now, { forwardDate: false });
  if (!parsed) {
    throw new Error(`Cannot parse time expression: "${expr}"`);
  }
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localOffsetMs = getTimezoneOffsetMinutes(parsed, localTz) * 6e4;
  const targetOffsetMs = getTimezoneOffsetMinutes(parsed, timezone) * 6e4;
  const corrected = new Date(parsed.getTime() - targetOffsetMs + localOffsetMs);
  const isPast = corrected.getTime() < now.getTime();
  return {
    iso: corrected.toISOString(),
    isPast
  };
}
function formatScheduled(iso, timezone) {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    tz = "UTC";
  }
  const targetDate = new Date(iso);
  const now = /* @__PURE__ */ new Date();
  const getDateParts = (date, timeZone) => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return fmt.format(date);
  };
  const targetLocalDate = getDateParts(targetDate, tz);
  const todayLocalDate = getDateParts(now, tz);
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1e3);
  const tomorrowLocalDate = getDateParts(tomorrowDate, tz);
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const timeStr = timeFmt.format(targetDate);
  if (targetLocalDate === todayLocalDate) {
    return `today at ${timeStr} (${tz})`;
  } else if (targetLocalDate === tomorrowLocalDate) {
    return `tomorrow at ${timeStr} (${tz})`;
  } else {
    const weekdayFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    const dateParts = weekdayFmt.formatToParts(targetDate);
    const weekday = dateParts.find((p) => p.type === "weekday")?.value ?? "";
    const month = dateParts.find((p) => p.type === "month")?.value ?? "";
    const day = dateParts.find((p) => p.type === "day")?.value ?? "";
    return `${weekday} ${month} ${day} at ${timeStr} (${tz})`;
  }
}

// src/commands/remind.ts
function remindCommand(parent) {
  const remind = new Command2("remind").description("Create a new reminder").requiredOption(
    "--channel <type>",
    "Delivery channel: email|webhook|slack|discord|telegram|openclaw|google_calendar"
  ).requiredOption("--recipients <list>", "Comma-separated list of recipients").option("--fire-at <iso>", "ISO 8601 datetime when the reminder fires").option("--in <duration>", "Schedule relative to now: 30m, 2h, 3d, 1w").option("--at <time>", 'Schedule at a time: "Monday 9am", "tomorrow 15:17", "15:17"').option("--repeat <interval>", "Recurrence: daily|weekly|monthly|custom").option("--cron <expression>", "Cron expression when --repeat custom (e.g. '0 9 * * 1')").option("--message <text>", "Reminder body text").option("--title <text>", "Reminder title", "").option(
    "--timezone <tz>",
    "Timezone (default: system timezone)",
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ).option("--json", "Output as machine-readable JSON").action(async (options) => {
    const isJson = !!options.json;
    const formatter = new OutputFormatter(isJson);
    const configManager = new ConfigManager();
    const cfg = configManager.getAll();
    if (!cfg.apiKey || !cfg.apiUrl) {
      process.stderr.write(
        formatter.error(
          "API key or URL not configured. Run: pingfyr config set --api-key <key>",
          {
            errorCode: "auth"
          }
        ) + "\n"
      );
      process.exit(3);
      return;
    }
    const timeFlags = [options.fireAt, options.in, options.at].filter(Boolean);
    if (timeFlags.length > 1) {
      process.stderr.write(
        formatter.error("--fire-at, --in, and --at are mutually exclusive \u2014 use exactly one") + "\n"
      );
      process.exit(1);
      return;
    }
    if (timeFlags.length === 0) {
      process.stderr.write(formatter.error("One of --fire-at, --in, or --at is required") + "\n");
      process.exit(1);
      return;
    }
    try {
      const client = new PingfyrClient(cfg.apiKey, cfg.apiUrl);
      const recipients = options.recipients.split(",").map((r) => r.trim());
      let resolvedFireAt;
      if (options.fireAt) {
        resolvedFireAt = options.fireAt;
      } else if (options.in) {
        resolvedFireAt = parseIn(options.in);
      } else {
        const { iso, isPast } = parseAt(options.at, options.timezone);
        if (isPast) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
          const answer = await rl.question(
            `"${options.at}" resolves to a time in the past. Schedule for the next occurrence? (y/N) `
          );
          rl.close();
          if (answer.trim().toLowerCase() !== "y") {
            process.stderr.write(
              formatter.error("Aborted \u2014 time expression resolved to past") + "\n"
            );
            process.exit(1);
            return;
          }
        }
        resolvedFireAt = iso;
      }
      if (options.cron && options.repeat !== "custom") {
        process.stderr.write(
          "Warning: --cron is set but --repeat is not 'custom'. Consider adding --repeat custom.\n"
        );
      }
      const result = await withSpinner(
        "Creating reminder...",
        isJson,
        async () => client.createReminder({
          title: options.title,
          body: options.message,
          channel: options.channel,
          recipients,
          fire_at: resolvedFireAt,
          timezone: options.timezone,
          repeat: options.repeat,
          cron_expression: options.cron
        })
      );
      const label = formatScheduled(result.fire_at, options.timezone);
      process.stdout.write(
        formatter.success(`Scheduled for ${label}`, {
          id: result.id,
          channel: result.channel_type,
          fire_at: result.fire_at,
          scheduled_label: label
        }) + "\n"
      );
      process.exit(0);
    } catch (err) {
      const error = err;
      const exitCode = error.exitCode ?? 1;
      process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
      process.exit(exitCode);
    }
  });
  parent.addCommand(remind);
}

// src/commands/list.ts
import { Command as Command3 } from "commander";
function listCommand(parent) {
  const list = new Command3("list").description("List reminders").option("--status <status>", "Filter by status: pending|processing|delivered|failed|cancelled").option("--limit <n>", "Number of reminders to return", "50").option("--offset <n>", "Offset for pagination", "0").option("--json", "Output as machine-readable JSON").action(async (options) => {
    const isJson = !!options.json;
    const formatter = new OutputFormatter(isJson);
    const configManager = new ConfigManager();
    const cfg = configManager.getAll();
    if (!cfg.apiKey || !cfg.apiUrl) {
      process.stderr.write(
        formatter.error(
          "API key or URL not configured. Run: pingfyr config set --api-key <key>",
          {
            errorCode: "auth"
          }
        ) + "\n"
      );
      process.exit(3);
      return;
    }
    try {
      const client = new PingfyrClient(cfg.apiKey, cfg.apiUrl);
      const result = await withSpinner(
        "Fetching reminders...",
        isJson,
        async () => client.listReminders({
          status: options.status,
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10)
        })
      );
      const columns = [
        { key: "id", header: "ID", maxWidth: 8 },
        { key: "title", header: "Title" },
        { key: "channel_type", header: "Channel", maxWidth: 12 },
        { key: "status", header: "Status", isStatus: true, maxWidth: 15 },
        { key: "fire_at", header: "Scheduled", maxWidth: 25 }
      ];
      process.stdout.write(
        formatter.format(result.data, columns, { data: result.data, count: result.count }) + "\n"
      );
      process.exit(0);
    } catch (err) {
      const error = err;
      const exitCode = error.exitCode ?? 1;
      process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
      process.exit(exitCode);
    }
  });
  parent.addCommand(list);
}

// src/commands/cancel.ts
import { Command as Command4 } from "commander";
function cancelCommand(parent) {
  const cancel = new Command4("cancel").description("Cancel a pending reminder").argument("<id>", "Reminder ID to cancel").option("--json", "Output as machine-readable JSON").action(async (id, options) => {
    const isJson = !!options.json;
    const formatter = new OutputFormatter(isJson);
    const configManager = new ConfigManager();
    const cfg = configManager.getAll();
    if (!cfg.apiKey || !cfg.apiUrl) {
      process.stderr.write(
        formatter.error(
          "API key or URL not configured. Run: pingfyr config set --api-key <key>",
          {
            errorCode: "auth"
          }
        ) + "\n"
      );
      process.exit(3);
      return;
    }
    try {
      const client = new PingfyrClient(cfg.apiKey, cfg.apiUrl);
      await withSpinner("Cancelling reminder...", isJson, async () => client.cancelReminder(id));
      process.stdout.write(formatter.success("Reminder cancelled: " + id, { id }) + "\n");
      process.exit(0);
    } catch (err) {
      if (err instanceof NotFoundError) {
        process.stderr.write(
          formatter.error("Reminder not found: " + id, { errorCode: "not_found" }) + "\n"
        );
        process.exit(2);
        return;
      }
      const error = err;
      const exitCode = error.exitCode ?? 1;
      process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
      process.exit(exitCode);
    }
  });
  parent.addCommand(cancel);
}

// src/commands/status.ts
import { Command as Command5 } from "commander";
function statusCommand(parent) {
  const status = new Command5("status").description("Show details for a reminder").argument("<id>", "Reminder ID to inspect").option("--json", "Output as machine-readable JSON").action(async (id, options) => {
    const isJson = !!options.json;
    const formatter = new OutputFormatter(isJson);
    const configManager = new ConfigManager();
    const cfg = configManager.getAll();
    if (!cfg.apiKey || !cfg.apiUrl) {
      process.stderr.write(
        formatter.error(
          "API key or URL not configured. Run: pingfyr config set --api-key <key>",
          {
            errorCode: "auth"
          }
        ) + "\n"
      );
      process.exit(3);
      return;
    }
    try {
      const client = new PingfyrClient(cfg.apiKey, cfg.apiUrl);
      const reminder = await withSpinner("Fetching reminder...", isJson, async () => {
        const result = await client.listReminders({ limit: 100 });
        const found = result.data.find((r) => r.id === id);
        if (!found) throw new NotFoundError("Reminder not found: " + id);
        return found;
      });
      let deliverySummaryStr;
      const ds = reminder.delivery_summary;
      if (ds && (ds.success || ds.failure || ds.suppressed || ds.rate_limited)) {
        const parts = [];
        if (ds.success) parts.push(`${ds.success} delivered`);
        if (ds.failure) parts.push(`${ds.failure} failed`);
        if (ds.suppressed) parts.push(`${ds.suppressed} suppressed`);
        if (ds.rate_limited) parts.push(`${ds.rate_limited} rate-limited`);
        deliverySummaryStr = parts.join(", ");
      }
      const display = {
        ...reminder,
        recipients: Array.isArray(reminder.recipients) ? reminder.recipients.join(", ") : String(reminder.recipients),
        ...deliverySummaryStr ? { delivery: deliverySummaryStr } : {}
      };
      const fields = [
        { key: "id", label: "ID" },
        { key: "title", label: "Title" },
        { key: "channel_type", label: "Channel" },
        { key: "status", label: "Status", isStatus: true },
        { key: "fire_at", label: "Scheduled" },
        { key: "timezone", label: "Timezone" },
        { key: "recipients", label: "Recipients" },
        { key: "body", label: "Message" },
        ...deliverySummaryStr ? [{ key: "delivery", label: "Delivery" }] : []
      ];
      process.stdout.write(formatter.detail(display, fields) + "\n");
      process.exit(0);
    } catch (err) {
      if (err instanceof NotFoundError) {
        process.stderr.write(
          formatter.error("Reminder not found: " + id, { errorCode: "not_found" }) + "\n"
        );
        process.exit(2);
        return;
      }
      const error = err;
      const exitCode = error.exitCode ?? 1;
      process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
      process.exit(exitCode);
    }
  });
  parent.addCommand(status);
}

// src/index.ts
var program = new Command6();
program.name("pingfyr").description("AI agent reminder service \u2014 manage reminders from the CLI").version(getVersion(), "-v, --version", "Display version number");
configCommand(program);
remindCommand(program);
listCommand(program);
cancelCommand(program);
statusCommand(program);
program.parse(process.argv);
