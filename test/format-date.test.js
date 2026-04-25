import { describe, expect, it } from "bun:test";
import { formatShortDate, isValidDate } from "../src/format-date.js";

describe("isValidDate", () => {
  it("returns true for a valid Date", () => {
    expect(isValidDate(new Date("2026-01-15"))).toBe(true);
  });

  it("returns false for an invalid Date", () => {
    expect(isValidDate(new Date("not-a-date"))).toBe(false);
  });

  it("returns false for a non-Date value", () => {
    expect(isValidDate("2026-01-15")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidDate(null)).toBe(false);
  });
});

describe("formatShortDate", () => {
  it("formats a valid date as Mon DD", () => {
    const result = formatShortDate(new Date(2026, 0, 5));
    expect(result).toBe("Jan 05");
  });

  it("returns empty string for an invalid Date", () => {
    expect(formatShortDate(new Date("not-a-date"))).toBe("");
  });

  it("returns empty string for a non-Date value", () => {
    expect(formatShortDate("2026-01-15")).toBe("");
  });
});
