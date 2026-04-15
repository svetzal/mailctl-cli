import { describe, expect, it } from "bun:test";
import { buildMoveJson, formatMoveResultText } from "../src/format-move.js";

describe("formatMoveResultText", () => {
  describe("formats a single account move summary", () => {
    const text = formatMoveResultText({ moved: 3, failed: 0, skipped: 0 });

    it("shows moved count", () => {
      expect(text).toContain("3 moved");
    });

    it("shows failed count", () => {
      expect(text).toContain("0 failed");
    });

    it("shows skipped count", () => {
      expect(text).toContain("0 skipped");
    });
  });

  describe("formats a multi-account move summary with failures", () => {
    const text = formatMoveResultText({ moved: 5, failed: 2, skipped: 0 });

    it("shows moved count", () => {
      expect(text).toContain("5 moved");
    });

    it("shows failed count", () => {
      expect(text).toContain("2 failed");
    });
  });

  describe("formats a dry-run result with all messages skipped", () => {
    const text = formatMoveResultText({ moved: 0, failed: 0, skipped: 4 });

    it("shows moved count", () => {
      expect(text).toContain("0 moved");
    });

    it("shows skipped count", () => {
      expect(text).toContain("4 skipped");
    });

    it("shows dry-run indicator", () => {
      expect(text).toContain("(dry-run)");
    });
  });
});

// ── buildMoveJson ─────────────────────────────────────────────────────────────

describe("buildMoveJson", () => {
  const stats = { moved: 3, failed: 0, skipped: 0 };
  const results = [{ uid: 42, account: "iCloud", status: "moved" }];

  it("spreads stats fields into the result", () => {
    const json = buildMoveJson(stats, results);

    expect(json.moved).toBe(3);
  });

  it("includes results array", () => {
    const json = buildMoveJson(stats, results);

    expect(json.results).toBe(results);
  });
});
