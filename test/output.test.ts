import { describe, test, expect } from "vitest";
import { OutputFormatter } from "../src/lib/output.js";

const sampleRows = [
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

const columns = [
  { key: "id", header: "ID" },
  { key: "title", header: "Title" },
  { key: "channel_type", header: "Channel" },
  { key: "status", header: "Status", isStatus: true },
  { key: "fire_at", header: "Fire At" },
];

describe("OutputFormatter — JSON mode (isJson=true)", () => {
  const formatter = new OutputFormatter(true);

  test("format() returns valid JSON string", () => {
    const output = formatter.format(sampleRows, columns);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test("format() JSON has success: true", () => {
    const output = formatter.format(sampleRows, columns);
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
  });

  test("format() JSON data defaults to rows", () => {
    const output = formatter.format(sampleRows, columns);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(2);
  });

  test("format() JSON uses jsonData override when provided", () => {
    const override = { reminders: sampleRows, total: 2 };
    const output = formatter.format(sampleRows, columns, override);
    const parsed = JSON.parse(output);
    expect(parsed.data.total).toBe(2);
  });

  test("error() returns valid JSON with success: false", () => {
    const output = formatter.error("Something went wrong", { errorCode: "api_error" });
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("api_error");
    expect(parsed.message).toBe("Something went wrong");
  });

  test("success() returns valid JSON with success: true", () => {
    const output = formatter.success("Reminder cancelled");
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
  });
});

describe("OutputFormatter — table mode (isJson=false)", () => {
  const formatter = new OutputFormatter(false);

  test("format() returns a non-empty string for non-empty rows", () => {
    const output = formatter.format(sampleRows, columns);
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("ID");
    expect(output).toContain("Title");
  });

  test("format() contains data values from rows", () => {
    const output = formatter.format(sampleRows, columns);
    expect(output).toContain("abc123");
    expect(output).toContain("Daily standup");
  });

  test("format() shows 'No results found.' for empty array", () => {
    const output = formatter.format([], columns);
    expect(output).toContain("No results found.");
  });

  test("format() truncates long cell values at 40 chars", () => {
    const longTitle = "A".repeat(100);
    const rows = [
      {
        id: "x",
        title: longTitle,
        channel_type: "email",
        status: "pending",
        fire_at: "2026-01-01T00:00:00Z",
      },
    ];
    const output = formatter.format(rows, columns);
    // The truncated value should appear, not the full 100-char string
    expect(output).toContain("...");
    expect(output).not.toContain("A".repeat(50));
  });

  test("error() returns string containing 'Error:'", () => {
    const output = formatter.error("Not found");
    expect(output).toContain("Error:");
    expect(output).toContain("Not found");
  });

  test("error() includes hint when provided", () => {
    const output = formatter.error("API key not configured", {
      hint: "Run: pingfyr config set --api-key <key>",
    });
    expect(output).toContain("pingfyr config set");
  });

  test("success() returns string with the message", () => {
    const output = formatter.success("Reminder cancelled");
    expect(output).toContain("Reminder cancelled");
  });
});

describe("OutputFormatter.detail()", () => {
  const formatter = new OutputFormatter(false);
  const obj = {
    id: "abc",
    title: "Test reminder",
    status: "pending",
    fire_at: "2026-03-01T09:00:00Z",
  };
  const fields = [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status", isStatus: true },
    { key: "fire_at", label: "Fire At" },
  ];

  test("detail() returns key-value formatted string", () => {
    const output = formatter.detail(obj, fields);
    expect(output).toContain("ID:");
    expect(output).toContain("Title:");
    expect(output).toContain("abc");
    expect(output).toContain("Test reminder");
  });

  test("detail() with isJson=true returns JSON envelope", () => {
    const jsonFormatter = new OutputFormatter(true);
    const output = jsonFormatter.detail(obj, fields);
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.id).toBe("abc");
  });
});
