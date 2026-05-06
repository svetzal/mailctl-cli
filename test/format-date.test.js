import { describe, expect, it } from "bun:test";
import {
  formatDatetime,
  formatMessageDate,
  formatShortDate,
  formatShortDateWithYear,
  isValidDate,
} from "../src/format-date.js";

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

describe("formatDatetime", () => {
  it("formats a valid date as Mon DD at HH:MM", () => {
    const result = formatDatetime(new Date(2026, 0, 5, 14, 30));
    expect(result).toBe("Jan 05 at 14:30");
  });

  it("returns empty string for an invalid Date", () => {
    expect(formatDatetime(new Date("not-a-date"))).toBe("");
  });

  it("returns empty string for a non-Date value", () => {
    expect(formatDatetime("2026-01-15")).toBe("");
  });
});

describe("formatMessageDate", () => {
  it("returns time-only string for today's date", () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 45);
    expect(formatMessageDate(today)).toBe("09:45");
  });

  it("returns short date for a past date", () => {
    const past = new Date(2025, 0, 5);
    expect(formatMessageDate(past)).toBe("Jan 05");
  });

  it("returns empty string for an invalid Date", () => {
    expect(formatMessageDate(new Date("not-a-date"))).toBe("");
  });
});

describe("formatShortDateWithYear", () => {
  it("formats a valid date as Mon DD, YYYY", () => {
    const result = formatShortDateWithYear(new Date(2026, 0, 5));
    expect(result).toBe("Jan 05, 2026");
  });

  it("returns empty string for an invalid Date", () => {
    expect(formatShortDateWithYear(new Date("not-a-date"))).toBe("");
  });

  it("returns empty string for a non-Date value", () => {
    expect(formatShortDateWithYear("2026-01-15")).toBe("");
  });
});
