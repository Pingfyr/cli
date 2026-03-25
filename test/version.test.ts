import { describe, test, expect } from "vitest";
import { getVersion } from "../src/lib/version.js";

describe("getVersion()", () => {
  test("returns a non-empty string", () => {
    const version = getVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });

  test("returns a valid semver string or 0.0.0 fallback", () => {
    const version = getVersion();
    // Either real semver or fallback — both are valid
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
