import { describe, expect, it } from "bun:test";
import { formatDownloadReceiptsResultText } from "../src/format-download-receipts.js";

/** @typedef {import("../src/format-download-receipts.js").DownloadReceiptsResult} DownloadReceiptsResult */

describe("formatDownloadReceiptsResultText", () => {
  describe("listVendors mode", () => {
    describe("lists known vendors when present", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: ["Acme Corp", "Widget Inc"],
        recentVendors: [],
      };
      const text = formatDownloadReceiptsResultText(result, { months: "12" });

      it("shows known vendors header", () => {
        expect(text).toContain("Known vendors (from config):");
      });

      it("shows vendor names", () => {
        expect(text).toContain("Acme Corp, Widget Inc");
      });
    });

    it("skips known vendors section when empty", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: [],
        recentVendors: [],
      };
      const text = formatDownloadReceiptsResultText(result, { months: "12" });
      expect(text).not.toContain("Known vendors");
    });

    it("shows no-vendors message when recent vendors list is empty", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: [],
        recentVendors: [],
      };
      const text = formatDownloadReceiptsResultText(result, { months: "12" });
      expect(text).toContain("No receipt vendors found in the search period.");
    });

    it("lists recent vendors with count and receipt label", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: [],
        recentVendors: [{ vendor: "Acme", count: 3 }],
      };
      const text = formatDownloadReceiptsResultText(result, { months: "12" });
      expect(text).toContain("Acme (3 receipts)");
    });

    it("uses singular receipt when count is 1", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: [],
        recentVendors: [{ vendor: "Acme", count: 1 }],
      };
      const text = formatDownloadReceiptsResultText(result, { months: "12" });
      expect(text).toContain("Acme (1 receipt)");
    });

    it("uses last N months label when since is not set", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: [],
        recentVendors: [{ vendor: "Acme", count: 2 }],
      };
      const text = formatDownloadReceiptsResultText(result, { months: "6" });
      expect(text).toContain("last 6 months");
    });

    it("uses since label when opts.since is set", () => {
      /** @type {DownloadReceiptsResult} */
      const result = {
        mode: "listVendors",
        configVendors: [],
        recentVendors: [{ vendor: "Acme", count: 2 }],
      };
      const text = formatDownloadReceiptsResultText(result, { since: "2025-01-01", months: "12" });
      expect(text).toContain("since 2025-01-01");
    });
  });

  describe("reprocess mode", () => {
    it("includes Reprocess Complete header", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "reprocess", reprocessed: 5, skipped: 2, errors: 0 };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("=== Reprocess Complete ===");
    });

    it("shows reprocessed count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "reprocess", reprocessed: 5, skipped: 2, errors: 0 };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Reprocessed:   5");
    });

    it("shows skipped count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "reprocess", reprocessed: 5, skipped: 2, errors: 0 };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Skipped:       2");
    });

    it("shows errors count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "reprocess", reprocessed: 5, skipped: 2, errors: 1 };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Errors:        1");
    });
  });

  describe("download mode", () => {
    const stats = { found: 10, downloaded: 5, noPdf: 2, alreadyHave: 2, errors: 1 };

    it("includes Download Receipts Complete header", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "download", stats };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("=== Download Receipts Complete ===");
    });

    it("shows found count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "download", stats };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Found:         10");
    });

    it("shows downloaded count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "download", stats };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Downloaded:    5");
    });

    it("shows no PDF count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "download", stats };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("No PDF:        2");
    });

    it("shows already have count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "download", stats };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Already have:  2");
    });

    it("shows errors count", () => {
      /** @type {DownloadReceiptsResult} */
      const result = { mode: "download", stats };
      const text = formatDownloadReceiptsResultText(result, {});
      expect(text).toContain("Errors:        1");
    });
  });
});
