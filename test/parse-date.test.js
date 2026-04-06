import { describe, expect, it } from "bun:test";
import { parseDate } from "../src/parse-date.js";

describe("parseDate", () => {
  describe("parses ISO date 2026-01-15", () => {
    const d = parseDate("2026-01-15");

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(2026);
    });

    it("has the correct month (January)", () => {
      expect(d.getMonth()).toBe(0);
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(15);
    });
  });

  describe("parses ISO datetime and returns date only", () => {
    const d = parseDate("2026-01-15T14:00");

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(2026);
    });

    it("has the correct month (January)", () => {
      expect(d.getMonth()).toBe(0);
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(15);
    });

    it("has hours set to 0", () => {
      expect(d.getHours()).toBe(0);
    });

    it("has minutes set to 0", () => {
      expect(d.getMinutes()).toBe(0);
    });
  });

  describe("parses relative days (3d)", () => {
    const d = parseDate("3d");
    const expected = new Date();
    expected.setDate(expected.getDate() - 3);

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(expected.getFullYear());
    });

    it("has the correct month", () => {
      expect(d.getMonth()).toBe(expected.getMonth());
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(expected.getDate());
    });
  });

  describe("parses relative weeks (2w)", () => {
    const d = parseDate("2w");
    const expected = new Date();
    expected.setDate(expected.getDate() - 14);

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(expected.getFullYear());
    });

    it("has the correct month", () => {
      expect(d.getMonth()).toBe(expected.getMonth());
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(expected.getDate());
    });
  });

  describe("parses relative months (1m)", () => {
    const d = parseDate("1m");
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 1);

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(expected.getFullYear());
    });

    it("has the correct month", () => {
      expect(d.getMonth()).toBe(expected.getMonth());
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(expected.getDate());
    });
  });

  describe("parses 'today' as today at midnight", () => {
    const d = parseDate("today");
    const now = new Date();

    it("has the current year", () => {
      expect(d.getFullYear()).toBe(now.getFullYear());
    });

    it("has the current month", () => {
      expect(d.getMonth()).toBe(now.getMonth());
    });

    it("has the current date", () => {
      expect(d.getDate()).toBe(now.getDate());
    });

    it("has hours set to 0", () => {
      expect(d.getHours()).toBe(0);
    });

    it("has minutes set to 0", () => {
      expect(d.getMinutes()).toBe(0);
    });
  });

  describe("parses 'yesterday' as yesterday at midnight", () => {
    const d = parseDate("yesterday");
    const expected = new Date();
    expected.setDate(expected.getDate() - 1);

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(expected.getFullYear());
    });

    it("has the correct month", () => {
      expect(d.getMonth()).toBe(expected.getMonth());
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(expected.getDate());
    });
  });

  describe("parses full month name 'january' as Jan 1", () => {
    const d = parseDate("january");
    const now = new Date();

    it("has month 0 (January)", () => {
      expect(d.getMonth()).toBe(0);
    });

    it("has day 1", () => {
      expect(d.getDate()).toBe(1);
    });

    it("has the correct year based on current date", () => {
      const expectedYear = now.getMonth() >= 0 ? now.getFullYear() : now.getFullYear() - 1;
      expect(d.getFullYear()).toBe(expectedYear);
    });
  });

  describe("parses month name with year 'jan 2026' as Jan 1, 2026", () => {
    const d = parseDate("jan 2026");

    it("has year 2026", () => {
      expect(d.getFullYear()).toBe(2026);
    });

    it("has month 0 (January)", () => {
      expect(d.getMonth()).toBe(0);
    });

    it("has day 1", () => {
      expect(d.getDate()).toBe(1);
    });
  });

  describe("is case insensitive for month names", () => {
    it("parses JANUARY as month 0", () => {
      expect(parseDate("JANUARY").getMonth()).toBe(0);
    });

    it("parses Jan as month 0", () => {
      expect(parseDate("Jan").getMonth()).toBe(0);
    });

    it("parses jan as month 0", () => {
      expect(parseDate("jan").getMonth()).toBe(0);
    });
  });

  describe("parses 'last week' as 7 days ago", () => {
    const d = parseDate("last week");
    const expected = new Date();
    expected.setDate(expected.getDate() - 7);

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(expected.getFullYear());
    });

    it("has the correct month", () => {
      expect(d.getMonth()).toBe(expected.getMonth());
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(expected.getDate());
    });
  });

  describe("parses 'last month' as 1 month ago", () => {
    const d = parseDate("last month");
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 1);

    it("has the correct year", () => {
      expect(d.getFullYear()).toBe(expected.getFullYear());
    });

    it("has the correct month", () => {
      expect(d.getMonth()).toBe(expected.getMonth());
    });

    it("has the correct day", () => {
      expect(d.getDate()).toBe(expected.getDate());
    });
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
