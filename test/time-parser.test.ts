import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { parseIn, parseAt, formatScheduled } from "../src/lib/time-parser.js";

// Reference point: 2026-03-11T10:00:00Z
const REFERENCE_ISO = "2026-03-11T10:00:00.000Z";
const REFERENCE_DATE = new Date(REFERENCE_ISO);

describe("parseIn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("parseIn('30m') returns ISO string 30 minutes after reference", () => {
    const result = parseIn("30m");
    const expected = new Date(REFERENCE_DATE.getTime() + 30 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('2h') returns ISO string 2 hours after reference", () => {
    const result = parseIn("2h");
    const expected = new Date(REFERENCE_DATE.getTime() + 2 * 60 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('1d') returns ISO string 1 day after reference", () => {
    const result = parseIn("1d");
    const expected = new Date(REFERENCE_DATE.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('1w') returns ISO string 7 days after reference", () => {
    const result = parseIn("1w");
    const expected = new Date(REFERENCE_DATE.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('invalid') throws Error containing 'Invalid duration'", () => {
    expect(() => parseIn("invalid")).toThrow("Invalid duration");
  });

  test("parseIn('') throws Error containing 'Invalid duration'", () => {
    expect(() => parseIn("")).toThrow("Invalid duration");
  });

  test("parseIn('30min') works for min alias", () => {
    const result = parseIn("30min");
    const expected = new Date(REFERENCE_DATE.getTime() + 30 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('2hr') works for hr alias", () => {
    const result = parseIn("2hr");
    const expected = new Date(REFERENCE_DATE.getTime() + 2 * 60 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('3days') works for days alias", () => {
    const result = parseIn("3days");
    const expected = new Date(REFERENCE_DATE.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  test("parseIn('2weeks') works for weeks alias", () => {
    const result = parseIn("2weeks");
    const expected = new Date(REFERENCE_DATE.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(result).toBe(expected);
  });
});

describe("parseAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("parseAt future time returns ISO string with isPast=false", () => {
    // Use a time expression that is definitely in the future relative to 10:00 UTC reference
    // "tomorrow" is unambiguous — always in the future
    const result = parseAt("tomorrow at noon", "UTC");
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.isPast).toBe(false);
    // Parsed date should be after reference
    expect(new Date(result.iso).getTime()).toBeGreaterThan(REFERENCE_DATE.getTime());
  });

  test("parseAt past time returns ISO string with isPast=true", () => {
    // Use "last hour" which is unambiguously in the past
    const result = parseAt("last year", "UTC");
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.isPast).toBe(true);
    // Parsed date should be before reference
    expect(new Date(result.iso).getTime()).toBeLessThan(REFERENCE_DATE.getTime());
  });

  test("parseAt('garbage xyz 999', 'UTC') throws Error containing 'Cannot parse'", () => {
    expect(() => parseAt("garbage xyz 999", "UTC")).toThrow("Cannot parse");
  });

  test("parseAt with invalid timezone throws an error", () => {
    expect(() => parseAt("tomorrow at 10:00", "Invalid/Timezone999")).toThrow();
  });

  test("parseAt('tomorrow at 10:00', localTz) preserves 10:00 wall clock (no shift when target == local)", () => {
    // When target timezone == local machine timezone, offsets cancel: no correction applied.
    // We verify by checking the UTC representation corresponds to 10:00 in the local timezone.
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = parseAt("tomorrow at 10:00", localTz);
    // Convert the resulting ISO back to the local timezone's wall-clock time
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: localTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(result.iso));
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    expect(hour).toBe(10);
    expect(minute).toBe(0);
    expect(result.isPast).toBe(false);
  });

  test("parseAt with target timezone = local timezone produces same ISO as chrono raw output", () => {
    // Regression: when target == local, no correction is applied, result equals the
    // chrono-parsed date directly (offset math cancels: -targetOffset + localOffset == 0).
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = parseAt("tomorrow at 10:00", localTz);
    // The ISO should be tomorrow at 10:00 in the local timezone
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: localTz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(result.iso));
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
    expect(get("hour")).toBe(10);
    expect(get("minute")).toBe(0);
    expect(get("second")).toBe(0);
  });
});

describe("formatScheduled", () => {
  test("formatScheduled with same-day ISO returns 'today at HH:MM (TZ)'", () => {
    // Reference today: 2026-03-11, timezone UTC
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
    const result = formatScheduled("2026-03-11T15:17:00Z", "UTC");
    expect(result).toBe("today at 15:17 (UTC)");
    vi.useRealTimers();
  });

  test("formatScheduled with next-day ISO returns 'tomorrow at HH:MM (TZ)'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
    const result = formatScheduled("2026-03-12T09:00:00Z", "UTC");
    expect(result).toBe("tomorrow at 09:00 (UTC)");
    vi.useRealTimers();
  });

  test("formatScheduled with future date returns 'Weekday Mon DD at HH:MM (TZ)'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
    const result = formatScheduled("2026-03-20T09:00:00Z", "UTC");
    expect(result).toBe("Fri Mar 20 at 09:00 (UTC)");
    vi.useRealTimers();
  });

  test("formatScheduled converts timezone offset correctly (UTC+1)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
    // 2026-03-11T09:00:00Z = 10:00 in Europe/Berlin (UTC+1 in March, before DST)
    const result = formatScheduled("2026-03-11T09:00:00Z", "Europe/Berlin");
    expect(result).toBe("today at 10:00 (Europe/Berlin)");
    vi.useRealTimers();
  });

  test("formatScheduled with invalid timezone falls back to UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REFERENCE_DATE);
    const result = formatScheduled("2026-03-11T15:17:00Z", "Invalid/Timezone");
    expect(result).toBe("today at 15:17 (UTC)");
    vi.useRealTimers();
  });
});
