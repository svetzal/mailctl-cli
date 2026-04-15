import { describe, expect, it } from "bun:test";
import { buildSortJson, formatSortResultText } from "../src/format-sort.js";

describe("formatSortResultText", () => {
  it("includes the Sort Complete header", () => {
    const text = formatSortResultText({ moved: 0, skipped: 0, unclassified: 0 });
    expect(text).toContain("=== Sort Complete ===");
  });

  it("shows moved count", () => {
    const text = formatSortResultText({ moved: 5, skipped: 0, unclassified: 0 });
    expect(text).toContain("Moved:        5");
  });

  it("shows skipped count", () => {
    const text = formatSortResultText({ moved: 0, skipped: 3, unclassified: 0 });
    expect(text).toContain("Skipped:      3");
  });

  it("shows unclassified count with default note", () => {
    const text = formatSortResultText({ moved: 0, skipped: 0, unclassified: 2 });
    expect(text).toContain("Unclassified: 2 (defaulted to personal)");
  });

  describe("formats all stats together correctly", () => {
    const text = formatSortResultText({ moved: 10, skipped: 5, unclassified: 1 });

    it("shows moved count", () => {
      expect(text).toContain("Moved:        10");
    });

    it("shows skipped count", () => {
      expect(text).toContain("Skipped:      5");
    });

    it("shows unclassified count", () => {
      expect(text).toContain("Unclassified: 1 (defaulted to personal)");
    });
  });
});

// ── buildSortJson ─────────────────────────────────────────────────────────────

describe("buildSortJson", () => {
  it("returns the stats object unchanged", () => {
    const stats = { moved: 5, skipped: 2, unclassified: 1 };
    const result = buildSortJson(stats);

    expect(result).toBe(stats);
  });
});
