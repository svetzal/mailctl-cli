import { describe, expect, it } from "bun:test";
import { parseDate } from "../src/parse-date.js";

describe("parseDate", () => {
  it("parses ISO date 2026-01-15", () => {
    const d = parseDate("2026-01-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it("parses ISO datetime and returns date only", () => {
    const d = parseDate("2026-01-15T14:00");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("parses relative days (3d)", () => {
    const d = parseDate("3d");
    const expected = new Date();
    expected.setDate(expected.getDate() - 3);
    expect(d.getFullYear()).toBe(expected.getFullYear());
    expect(d.getMonth()).toBe(expected.getMonth());
    expect(d.getDate()).toBe(expected.getDate());
  });

  it("parses relative weeks (2w)", () => {
    const d = parseDate("2w");
    const expected = new Date();
    expected.setDate(expected.getDate() - 14);
    expect(d.getFullYear()).toBe(expected.getFullYear());
    expect(d.getMonth()).toBe(expected.getMonth());
    expect(d.getDate()).toBe(expected.getDate());
  });

  it("parses relative months (1m)", () => {
    const d = parseDate("1m");
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 1);
    expect(d.getFullYear()).toBe(expected.getFullYear());
    expect(d.getMonth()).toBe(expected.getMonth());
    expect(d.getDate()).toBe(expected.getDate());
  });

  it("parses 'today' as today at midnight", () => {
    const d = parseDate("today");
    const now = new Date();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("parses 'yesterday' as yesterday at midnight", () => {
    const d = parseDate("yesterday");
    const expected = new Date();
    expected.setDate(expected.getDate() - 1);
    expect(d.getFullYear()).toBe(expected.getFullYear());
    expect(d.getMonth()).toBe(expected.getMonth());
    expect(d.getDate()).toBe(expected.getDate());
  });

  it("parses full month name 'january' as Jan 1", () => {
    const d = parseDate("january");
    const now = new Date();
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    // Year depends on whether January has passed this year
    if (now.getMonth() >= 0) {
      expect(d.getFullYear()).toBe(now.getFullYear());
    } else {
      expect(d.getFullYear()).toBe(now.getFullYear() - 1);
    }
  });

  it("parses month name with year 'jan 2026' as Jan 1, 2026", () => {
    const d = parseDate("jan 2026");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("is case insensitive for month names", () => {
    const d1 = parseDate("JANUARY");
    const d2 = parseDate("Jan");
    const d3 = parseDate("jan");
    expect(d1.getMonth()).toBe(0);
    expect(d2.getMonth()).toBe(0);
    expect(d3.getMonth()).toBe(0);
  });

  it("parses 'last week' as 7 days ago", () => {
    const d = parseDate("last week");
    const expected = new Date();
    expected.setDate(expected.getDate() - 7);
    expect(d.getFullYear()).toBe(expected.getFullYear());
    expect(d.getMonth()).toBe(expected.getMonth());
    expect(d.getDate()).toBe(expected.getDate());
  });

  it("parses 'last month' as 1 month ago", () => {
    const d = parseDate("last month");
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 1);
    expect(d.getFullYear()).toBe(expected.getFullYear());
    expect(d.getMonth()).toBe(expected.getMonth());
    expect(d.getDate()).toBe(expected.getDate());
  });

  it("throws a clear error on invalid input", () => {
    expect(() => parseDate("not-a-date")).toThrow(/Cannot parse date/);
  });

  it("throws on empty string", () => {
    expect(() => parseDate("")).toThrow(/Cannot parse/);
  });

  it("uses previous year for future months without explicit year", () => {
    // Pick a month guaranteed to be in the future relative to today
    const now = new Date();
    const futureMonthIndex = (now.getMonth() + 2) % 12;
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const futureMonth = monthNames[futureMonthIndex];

    // Only test if the future month is actually after the current month
    // (wrapping means December+2 = February, which is before December → current year)
    if (futureMonthIndex > now.getMonth()) {
      const d = parseDate(futureMonth);
      expect(d.getFullYear()).toBe(now.getFullYear() - 1);
    }
  });
});
