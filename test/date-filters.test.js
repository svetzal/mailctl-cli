import { describe, expect, it } from "bun:test";
import { resolveDateFilters } from "../src/date-filters.js";

describe("resolveDateFilters", () => {
  it("returns undefined for both dates when no options are provided", () => {
    const result = resolveDateFilters({});

    expect(result.since).toBeUndefined();
    expect(result.before).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("computes a date N months ago at midnight when only --months is provided", () => {
    const result = resolveDateFilters({ months: "3" });

    expect(result.since).toBeInstanceOf(Date);
    expect(result.before).toBeUndefined();

    // Should be approximately 3 months ago
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 3);
    const expectedMidnight = new Date(expected.getFullYear(), expected.getMonth(), expected.getDate());
    expect(result.since?.getTime()).toBe(expectedMidnight.getTime());
  });

  it("parses --since date string correctly", () => {
    const result = resolveDateFilters({ since: "2026-01-15" });

    expect(result.since).toBeInstanceOf(Date);
    expect(result.since?.getFullYear()).toBe(2026);
    expect(result.since?.getMonth()).toBe(0); // January
    expect(result.since?.getDate()).toBe(15);
    expect(result.before).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("lets --since take precedence over --months and includes a warning", () => {
    const result = resolveDateFilters({ months: "3", since: "2026-01-15" });

    expect(result.since).toBeInstanceOf(Date);
    expect(result.since?.getFullYear()).toBe(2026);
    expect(result.since?.getDate()).toBe(15);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("--since takes precedence over --months");
  });

  it("parses --before date string correctly", () => {
    const result = resolveDateFilters({ before: "2026-03-01" });

    expect(result.before).toBeInstanceOf(Date);
    expect(result.before?.getFullYear()).toBe(2026);
    expect(result.before?.getMonth()).toBe(2); // March
    expect(result.before?.getDate()).toBe(1);
    expect(result.since).toBeUndefined();
  });

  it("throws when --since is on or after --before", () => {
    expect(() => resolveDateFilters({ since: "2026-03-01", before: "2026-01-01" })).toThrow(
      "--since date must be before --before date",
    );
  });

  it("throws when --since equals --before", () => {
    expect(() => resolveDateFilters({ since: "2026-01-15", before: "2026-01-15" })).toThrow(
      "--since date must be before --before date",
    );
  });

  it("combines --months and --before without conflict or warnings", () => {
    const result = resolveDateFilters({ months: "1", before: "2026-12-31" });

    expect(result.since).toBeInstanceOf(Date);
    expect(result.before).toBeInstanceOf(Date);
    expect(result.warnings).toEqual([]);
  });
});
