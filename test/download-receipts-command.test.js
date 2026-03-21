import { describe, it, expect, mock } from "bun:test";
import { downloadReceiptsCommand } from "../src/download-receipts-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDeps(overrides = {}) {
  const importDownloadReceipts = mock(async () => ({
    listReceiptVendors: mock(async () => [
      { vendor: "Amazon", count: 5 },
      { vendor: "Stripe", count: 2 },
    ]),
    reprocessReceipts: mock(async () => ({ reprocessed: 3, skipped: 1, errors: 0 })),
    downloadReceiptEmails: mock(async () => ({
      stats: { found: 5, downloaded: 3, noPdf: 1, alreadyHave: 1, errors: 0 },
      records: [],
    })),
  }));

  const importVendorMap = mock(async () => ({
    getVendorDisplayNames: mock(() => ({ "vendor@amazon.com": "Amazon" })),
    getVendorDomainMap: mock(() => ({ "stripe.com": "Stripe" })),
  }));

  return {
    account: null,
    importDownloadReceipts,
    importVendorMap,
    ...overrides,
  };
}

// ── downloadReceiptsCommand ────────────────────────────────────────────────────

describe("downloadReceiptsCommand", () => {
  describe("list vendors mode", () => {
    it("returns mode: listVendors with vendor lists", async () => {
      const deps = makeDeps();
      const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);

      expect(result.mode).toBe("listVendors");
      expect(result.recentVendors).toBeDefined();
      expect(result.configVendors).toBeDefined();
    });

    it("calls listReceiptVendors with months option", async () => {
      const listReceiptVendors = mock(async () => []);
      const deps = makeDeps({
        importDownloadReceipts: mock(async () => ({
          listReceiptVendors,
          reprocessReceipts: mock(async () => ({})),
          downloadReceiptEmails: mock(async () => ({ stats: {}, records: [] })),
        })),
      });
      await downloadReceiptsCommand({ listVendors: true, months: "6" }, deps);

      expect(listReceiptVendors).toHaveBeenCalledWith(
        expect.objectContaining({ months: 6 })
      );
    });

    it("merges vendor names and domains into configVendors", async () => {
      const deps = makeDeps();
      const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);

      expect(result.configVendors).toContain("Amazon");
      expect(result.configVendors).toContain("Stripe");
    });
  });

  describe("reprocess mode", () => {
    it("returns mode: reprocess with stats", async () => {
      const deps = makeDeps();
      const result = await downloadReceiptsCommand({ reprocess: true, output: "." }, deps);

      expect(result.mode).toBe("reprocess");
      expect(result.reprocessed).toBe(3);
      expect(result.skipped).toBe(1);
    });

    it("does not call downloadReceiptEmails in reprocess mode", async () => {
      const deps = makeDeps();
      await downloadReceiptsCommand({ reprocess: true, output: "." }, deps);

      const { downloadReceiptEmails } = await deps.importDownloadReceipts();
      expect(downloadReceiptEmails).not.toHaveBeenCalled();
    });
  });

  describe("normal download mode", () => {
    it("returns mode: download with stats and records", async () => {
      const deps = makeDeps();
      const result = await downloadReceiptsCommand({ output: ".", months: "12" }, deps);

      expect(result.mode).toBe("download");
      expect(result.stats.found).toBe(5);
      expect(result.records).toBeDefined();
    });

    it("passes account filter to downloadReceiptEmails", async () => {
      const downloadReceiptEmails = mock(async () => ({ stats: { found: 0, downloaded: 0, noPdf: 0, alreadyHave: 0, errors: 0 }, records: [] }));
      const deps = makeDeps({
        account: "icloud",
        importDownloadReceipts: mock(async () => ({
          listReceiptVendors: mock(async () => []),
          reprocessReceipts: mock(async () => ({})),
          downloadReceiptEmails,
        })),
      });

      await downloadReceiptsCommand({ output: ".", months: "12" }, deps);

      expect(downloadReceiptEmails).toHaveBeenCalledWith(
        expect.objectContaining({ account: "icloud" })
      );
    });

    it("passes vendor filter when --vendor is set", async () => {
      const downloadReceiptEmails = mock(async () => ({ stats: { found: 0, downloaded: 0, noPdf: 0, alreadyHave: 0, errors: 0 }, records: [] }));
      const deps = makeDeps({
        importDownloadReceipts: mock(async () => ({
          listReceiptVendors: mock(async () => []),
          reprocessReceipts: mock(async () => ({})),
          downloadReceiptEmails,
        })),
      });

      await downloadReceiptsCommand({ output: ".", months: "12", vendor: "Amazon" }, deps);

      expect(downloadReceiptEmails).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: "Amazon" })
      );
    });
  });
});
