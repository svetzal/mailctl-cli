import { describe, expect, it } from "bun:test";
import { resolveDateFilters } from "../src/date-filters.js";

describe("resolveDateFilters", () => {
  describe("returns undefined for both dates when no options are provided", () => {
    const result = resolveDateFilters({});

    it("since is undefined", () => {
      expect(result.since).toBeUndefined();
    });

    it("before is undefined", () => {
      expect(result.before).toBeUndefined();
    });

    it("warnings is empty", () => {
      expect(result.warnings).toEqual([]);
    });
  });

  describe("computes a date N months ago at midnight when only --months is provided", () => {
    const result = resolveDateFilters({ months: "3" });
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 3);
    const expectedMidnight = new Date(expected.getFullYear(), expected.getMonth(), expected.getDate());

    it("since is a Date instance", () => {
      expect(result.since).toBeInstanceOf(Date);
    });

    it("before is undefined", () => {
      expect(result.before).toBeUndefined();
    });

    it("since is approximately 3 months ago at midnight", () => {
      expect(result.since?.getTime()).toBe(expectedMidnight.getTime());
    });
  });

  describe("parses --since date string correctly", () => {
    const result = resolveDateFilters({ since: "2026-01-15" });

    it("since is a Date instance", () => {
      expect(result.since).toBeInstanceOf(Date);
    });

    it("since has the correct year", () => {
      expect(result.since?.getFullYear()).toBe(2026);
    });

    it("since has the correct month (January)", () => {
      expect(result.since?.getMonth()).toBe(0);
    });

    it("since has the correct day", () => {
      expect(result.since?.getDate()).toBe(15);
    });

    it("before is undefined", () => {
      expect(result.before).toBeUndefined();
    });

    it("warnings is empty", () => {
      expect(result.warnings).toEqual([]);
    });
  });

  describe("lets --since take precedence over --months and includes a warning", () => {
    const result = resolveDateFilters({ months: "3", since: "2026-01-15" });

    it("since is a Date instance", () => {
      expect(result.since).toBeInstanceOf(Date);
    });

    it("since has the correct year", () => {
      expect(result.since?.getFullYear()).toBe(2026);
    });

    it("since has the correct day", () => {
      expect(result.since?.getDate()).toBe(15);
    });

    it("includes exactly one warning", () => {
      expect(result.warnings).toHaveLength(1);
    });

    it("warning mentions --since takes precedence over --months", () => {
      expect(result.warnings[0]).toContain("--since takes precedence over --months");
    });
  });

  describe("parses --before date string correctly", () => {
    const result = resolveDateFilters({ before: "2026-03-01" });

    it("before is a Date instance", () => {
      expect(result.before).toBeInstanceOf(Date);
    });

    it("before has the correct year", () => {
      expect(result.before?.getFullYear()).toBe(2026);
    });

    it("before has the correct month (March)", () => {
      expect(result.before?.getMonth()).toBe(2);
    });

    it("before has the correct day", () => {
      expect(result.before?.getDate()).toBe(1);
    });

    it("since is undefined", () => {
      expect(result.since).toBeUndefined();
    });
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

  describe("combines --months and --before without conflict or warnings", () => {
    const result = resolveDateFilters({ months: "1", before: "2026-12-31" });

    it("since is a Date instance", () => {
      expect(result.since).toBeInstanceOf(Date);
    });

    it("before is a Date instance", () => {
      expect(result.before).toBeInstanceOf(Date);
    });

    it("warnings is empty", () => {
      expect(result.warnings).toEqual([]);
    });
  });
});
