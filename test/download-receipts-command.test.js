import { describe, expect, it, mock } from "bun:test";
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
    describe("returns mode: listVendors with vendor lists", () => {
      it("mode is listVendors", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);
        expect(result.mode).toBe("listVendors");
      });

      it("recentVendors is defined", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);
        expect(result.recentVendors).toBeDefined();
      });

      it("configVendors is defined", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);
        expect(result.configVendors).toBeDefined();
      });
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
        expect.objectContaining({ months: 6 }),
        expect.anything(),
        expect.any(Function),
      );
    });

    describe("merges vendor names and domains into configVendors", () => {
      it("configVendors contains Amazon", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);
        expect(result.configVendors).toContain("Amazon");
      });

      it("configVendors contains Stripe", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ listVendors: true, months: "12" }, deps);
        expect(result.configVendors).toContain("Stripe");
      });
    });
  });

  describe("reprocess mode", () => {
    describe("returns mode: reprocess with stats", () => {
      it("mode is reprocess", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ reprocess: true, output: "." }, deps);
        expect(result.mode).toBe("reprocess");
      });

      it("reprocessed count is 3", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ reprocess: true, output: "." }, deps);
        expect(result.reprocessed).toBe(3);
      });

      it("skipped count is 1", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ reprocess: true, output: "." }, deps);
        expect(result.skipped).toBe(1);
      });
    });

    it("does not call downloadReceiptEmails in reprocess mode", async () => {
      const deps = makeDeps();
      await downloadReceiptsCommand({ reprocess: true, output: "." }, deps);

      const { downloadReceiptEmails } = await deps.importDownloadReceipts();
      expect(downloadReceiptEmails).not.toHaveBeenCalled();
    });
  });

  describe("normal download mode", () => {
    describe("returns mode: download with stats and records", () => {
      it("mode is download", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ output: ".", months: "12" }, deps);
        expect(result.mode).toBe("download");
      });

      it("stats.found is 5", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ output: ".", months: "12" }, deps);
        expect(result.stats.found).toBe(5);
      });

      it("records is defined", async () => {
        const deps = makeDeps();
        const result = await downloadReceiptsCommand({ output: ".", months: "12" }, deps);
        expect(result.records).toBeDefined();
      });
    });

    it("passes account filter to downloadReceiptEmails", async () => {
      const downloadReceiptEmails = mock(async () => ({
        stats: { found: 0, downloaded: 0, noPdf: 0, alreadyHave: 0, errors: 0 },
        records: [],
      }));
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
        expect.objectContaining({ account: "icloud" }),
        expect.anything(),
        expect.any(Function),
      );
    });

    it("passes vendor filter when --vendor is set", async () => {
      const downloadReceiptEmails = mock(async () => ({
        stats: { found: 0, downloaded: 0, noPdf: 0, alreadyHave: 0, errors: 0 },
        records: [],
      }));
      const deps = makeDeps({
        importDownloadReceipts: mock(async () => ({
          listReceiptVendors: mock(async () => []),
          reprocessReceipts: mock(async () => ({})),
          downloadReceiptEmails,
        })),
      });

      await downloadReceiptsCommand({ output: ".", months: "12", vendor: "Amazon" }, deps);

      expect(downloadReceiptEmails).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: "Amazon" }),
        expect.anything(),
        expect.any(Function),
      );
    });
  });
});
