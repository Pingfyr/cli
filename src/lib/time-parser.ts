import * as chrono from "chrono-node";

// getTimezoneOffsetMinutes: returns how many minutes ahead of UTC the given timezone is at the given date
// Uses Intl.DateTimeFormat to handle DST correctly — no external dependencies needed.
function getTimezoneOffsetMinutes(date: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const wallYear = get("year"),
    wallMonth = get("month") - 1,
    wallDay = get("day");
  const wallHour = get("hour"),
    wallMinute = get("minute"),
    wallSecond = get("second");
  // Interpret the wall-clock parts as UTC to find what UTC time this wall-clock represents
  const wallAsUtc = Date.UTC(wallYear, wallMonth, wallDay, wallHour, wallMinute, wallSecond);
  // offset = how many minutes ahead of UTC the timezone is at this moment
  return Math.round((date.getTime() - wallAsUtc) / 60_000);
}

// parseIn: parse a relative duration string into an absolute ISO 8601 datetime (UTC)
// Supported: m/min/mins/minutes, h/hr/hrs/hours, d/day/days, w/wk/wks/week/weeks
export function parseIn(duration: string): string {
  const match = duration
    .trim()
    .match(/^(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days|w|wk|wks|week|weeks)$/i);

  if (!match) {
    throw new Error(`Invalid duration: "${duration}"`);
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = new Date();
  let ms = 0;

  if (/^(m|min|mins|minutes)$/.test(unit)) {
    ms = amount * 60 * 1000;
  } else if (/^(h|hr|hrs|hours)$/.test(unit)) {
    ms = amount * 60 * 60 * 1000;
  } else if (/^(d|day|days)$/.test(unit)) {
    ms = amount * 24 * 60 * 60 * 1000;
  } else if (/^(w|wk|wks|week|weeks)$/.test(unit)) {
    ms = amount * 7 * 24 * 60 * 60 * 1000;
  }

  return new Date(now.getTime() + ms).toISOString();
}

// parseAt: parse a natural language time expression relative to now
// Returns { iso: string; isPast: boolean }
// timezone: IANA timezone string (e.g. "UTC", "Europe/Istanbul") — the user's intended timezone.
// chrono-node always parses in local machine time, so we correct the offset after parsing.
export function parseAt(expr: string, timezone: string): { iso: string; isPast: boolean } {
  // Validate the target timezone before doing anything else
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error(`Invalid timezone: "${timezone}"`);
  }

  const now = new Date();
  const parsed = chrono.parseDate(expr, now, { forwardDate: false });

  if (!parsed) {
    throw new Error(`Cannot parse time expression: "${expr}"`);
  }

  // Apply timezone offset correction:
  // chrono baked in "10am local", we want "10am target".
  // parsedUTC = wallclock - localOffset
  // desiredUTC = wallclock - targetOffset
  // desiredUTC = parsedUTC - targetOffset + localOffset
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localOffsetMs = getTimezoneOffsetMinutes(parsed, localTz) * 60_000;
  const targetOffsetMs = getTimezoneOffsetMinutes(parsed, timezone) * 60_000;
  const corrected = new Date(parsed.getTime() - targetOffsetMs + localOffsetMs);

  const isPast = corrected.getTime() < now.getTime();
  return {
    iso: corrected.toISOString(),
    isPast,
  };
}

// formatScheduled: converts an ISO 8601 UTC string to a human-readable label in the given timezone
// Format: "today at HH:MM (TZ)" | "tomorrow at HH:MM (TZ)" | "Weekday Mon DD at HH:MM (TZ)"
export function formatScheduled(iso: string, timezone: string): string {
  // Validate and fall back to UTC if timezone is invalid
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    tz = "UTC";
  }

  const targetDate = new Date(iso);
  const now = new Date();

  // Get local date string parts for the target datetime in the given timezone
  const getDateParts = (date: Date, timeZone: string) => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date); // returns "YYYY-MM-DD"
  };

  const targetLocalDate = getDateParts(targetDate, tz);
  const todayLocalDate = getDateParts(now, tz);

  // Compute tomorrow's date string
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowLocalDate = getDateParts(tomorrowDate, tz);

  // Get HH:MM in the target timezone (zero-padded 24h)
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = timeFmt.format(targetDate); // "HH:MM"

  if (targetLocalDate === todayLocalDate) {
    return `today at ${timeStr} (${tz})`;
  } else if (targetLocalDate === tomorrowLocalDate) {
    return `tomorrow at ${timeStr} (${tz})`;
  } else {
    // "Fri Mar 20 at HH:MM (TZ)" — abbreviated weekday + month + day
    const weekdayFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const dateParts = weekdayFmt.formatToParts(targetDate);
    const weekday = dateParts.find((p) => p.type === "weekday")?.value ?? "";
    const month = dateParts.find((p) => p.type === "month")?.value ?? "";
    const day = dateParts.find((p) => p.type === "day")?.value ?? "";
    return `${weekday} ${month} ${day} at ${timeStr} (${tz})`;
  }
}
