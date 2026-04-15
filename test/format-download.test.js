import { describe, expect, it } from "bun:test";
import { buildDownloadJson, formatDownloadResultText } from "../src/format-download.js";

describe("formatDownloadResultText", () => {
  it("includes the Download Complete header", () => {
    const text = formatDownloadResultText({ downloaded: 0, alreadyHave: 0, noPdf: 0, skipped: 0 });
    expect(text).toContain("=== Download Complete ===");
  });

  it("shows downloaded count", () => {
    const text = formatDownloadResultText({ downloaded: 7, alreadyHave: 0, noPdf: 0, skipped: 0 });
    expect(text).toContain("Downloaded:    7");
  });

  it("shows already had count", () => {
    const text = formatDownloadResultText({ downloaded: 0, alreadyHave: 3, noPdf: 0, skipped: 0 });
    expect(text).toContain("Already had:   3");
  });

  it("shows no PDF count", () => {
    const text = formatDownloadResultText({ downloaded: 0, alreadyHave: 0, noPdf: 4, skipped: 0 });
    expect(text).toContain("No PDF:        4");
  });

  it("shows skipped/error count", () => {
    const text = formatDownloadResultText({ downloaded: 0, alreadyHave: 0, noPdf: 0, skipped: 2 });
    expect(text).toContain("Skipped/Error: 2");
  });

  describe("formats all stats together correctly", () => {
    const text = formatDownloadResultText({ downloaded: 5, alreadyHave: 2, noPdf: 1, skipped: 1 });

    it("shows downloaded count", () => {
      expect(text).toContain("Downloaded:    5");
    });

    it("shows already had count", () => {
      expect(text).toContain("Already had:   2");
    });

    it("shows no PDF count", () => {
      expect(text).toContain("No PDF:        1");
    });

    it("shows skipped/error count", () => {
      expect(text).toContain("Skipped/Error: 1");
    });
  });
});

// ── buildDownloadJson ─────────────────────────────────────────────────────────

describe("buildDownloadJson", () => {
  it("returns the stats object unchanged", () => {
    const stats = { downloaded: 5, alreadyHave: 2, noPdf: 1, skipped: 0 };
    const result = buildDownloadJson(stats);

    expect(result).toBe(stats);
  });
});
