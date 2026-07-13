import { describe, expect, it, mock } from "bun:test";
import { scanCommand } from "../src/commands/scan-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a deps object with all scanner/scan-data functions injectable via DI.
 * No mock.module needed — scanCommand accepts overrides directly in its deps.
 */
function makeDeps(overrides = {}) {
  const {
    account = null,
    dataDir = "/data",
    fsGateway = {},
    scanAllAccounts = mock(() => Promise.resolve([{ uid: 1 }, { uid: 2 }])),
    aggregateBySender = mock(() => [{ address: "vendor@example.com", count: 2 }]),
    ensureDataDir = mock(() => {}),
    saveScanResults = mock(() => ({ rawPath: "/data/scan-results.json", summaryPath: "/data/senders.json" })),
    ...rest
  } = overrides;

  return {
    account,
    dataDir,
    fsGateway,
    scanAllAccounts,
    aggregateBySender,
    ensureDataDir,
    saveScanResults,
    ...rest,
  };
}

// ── scanCommand ────────────────────────────────────────────────────────────────

describe("scanCommand", () => {
  describe("scanAllAccounts invocation", () => {
    it("passes months parsed to int to scanAllAccounts", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts });
      await scanCommand({ months: "6" }, deps);

      expect(scanAllAccounts).toHaveBeenCalledWith(expect.objectContaining({ months: 6 }), {}, expect.any(Function));
    });

    it("defaults months to 12 when opts.months is not provided", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts });
      await scanCommand({}, deps);

      expect(scanAllAccounts).toHaveBeenCalledWith(expect.objectContaining({ months: 12 }), {}, expect.any(Function));
    });

    it("passes allMailboxes option to scanAllAccounts", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts });
      await scanCommand({ allMailboxes: true }, deps);

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ allMailboxes: true }),
        {},
        expect.any(Function),
      );
    });

    it("defaults allMailboxes to false when not provided", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts });
      await scanCommand({}, deps);

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ allMailboxes: false }),
        {},
        expect.any(Function),
      );
    });

    it("passes account from deps to scanAllAccounts", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts, account: "iCloud" });
      await scanCommand({}, deps);

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ account: "iCloud" }),
        {},
        expect.any(Function),
      );
    });

    it("normalises empty account string to undefined in scanAllAccounts call", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts, account: "" });
      await scanCommand({}, deps);

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ account: undefined }),
        {},
        expect.any(Function),
      );
    });

    it("forwards the onProgress callback to scanAllAccounts", async () => {
      const scanAllAccounts = mock(() => Promise.resolve([]));
      const deps = makeDeps({ scanAllAccounts });
      const onProgress = mock(() => {});
      await scanCommand({}, deps, onProgress);

      expect(scanAllAccounts).toHaveBeenCalledWith(expect.anything(), {}, onProgress);
    });
  });

  describe("aggregateBySender invocation", () => {
    it("calls aggregateBySender with the raw scan results", async () => {
      const fakeResults = [{ uid: 10 }, { uid: 20 }];
      const aggregateBySender = mock(() => []);
      const deps = makeDeps({
        scanAllAccounts: mock(() => Promise.resolve(fakeResults)),
        aggregateBySender,
      });
      await scanCommand({}, deps);

      expect(aggregateBySender).toHaveBeenCalledWith(fakeResults);
    });
  });

  describe("ensureDataDir invocation", () => {
    it("calls ensureDataDir with dataDir from deps", async () => {
      const ensureDataDir = mock(() => {});
      const deps = makeDeps({ ensureDataDir, dataDir: "/custom/data" });
      await scanCommand({}, deps);

      expect(ensureDataDir).toHaveBeenCalledWith("/custom/data", expect.anything());
    });

    it("calls ensureDataDir with the injected fsGateway", async () => {
      const fsGateway = { mkdir: mock(() => {}) };
      const ensureDataDir = mock(() => {});
      const deps = makeDeps({ ensureDataDir, fsGateway });
      await scanCommand({}, deps);

      expect(ensureDataDir).toHaveBeenCalledWith(expect.anything(), fsGateway);
    });
  });

  describe("saveScanResults invocation", () => {
    it("calls saveScanResults with the dataDir from deps", async () => {
      const saveScanResults = mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" }));
      const deps = makeDeps({ saveScanResults, dataDir: "/my/data" });
      await scanCommand({}, deps);

      expect(saveScanResults).toHaveBeenCalledWith("/my/data", expect.anything(), expect.anything());
    });

    it("calls saveScanResults with scan results in the data payload", async () => {
      const fakeResults = [{ uid: 99 }];
      const saveScanResults = mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" }));
      const deps = makeDeps({
        scanAllAccounts: mock(() => Promise.resolve(fakeResults)),
        saveScanResults,
      });
      await scanCommand({}, deps);

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scanResults: fakeResults }),
        expect.anything(),
      );
    });

    it("calls saveScanResults with aggregated senders in the data payload", async () => {
      const fakeSenders = [{ address: "a@b.com", count: 3 }];
      const saveScanResults = mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" }));
      const deps = makeDeps({
        aggregateBySender: mock(() => fakeSenders),
        saveScanResults,
      });
      await scanCommand({}, deps);

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ senders: fakeSenders }),
        expect.anything(),
      );
    });

    it("passes opts.output as rawPath to saveScanResults", async () => {
      const saveScanResults = mock(() => ({ rawPath: "/custom/raw.json", summaryPath: "/out/senders.json" }));
      const deps = makeDeps({ saveScanResults });
      await scanCommand({ output: "/custom/raw.json" }, deps);

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rawPath: "/custom/raw.json" }),
        expect.anything(),
      );
    });

    it("passes undefined rawPath when opts.output is not provided", async () => {
      const saveScanResults = mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" }));
      const deps = makeDeps({ saveScanResults });
      await scanCommand({}, deps);

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rawPath: undefined }),
        expect.anything(),
      );
    });

    it("calls saveScanResults with the injected fsGateway", async () => {
      const fsGateway = { writeJson: mock(() => {}) };
      const saveScanResults = mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" }));
      const deps = makeDeps({ saveScanResults, fsGateway });
      await scanCommand({}, deps);

      expect(saveScanResults).toHaveBeenCalledWith(expect.anything(), expect.anything(), fsGateway);
    });
  });

  describe("error propagation", () => {
    it("re-throws with prefixed message when scanAllAccounts rejects", async () => {
      const deps = makeDeps({
        scanAllAccounts: mock(() => Promise.reject(new Error("connection refused"))),
      });

      await expect(scanCommand({}, deps)).rejects.toThrow("Scan failed: connection refused");
    });

    it("forwards error code on the re-thrown error when original has code", async () => {
      const original = new Error("timed out");
      /** @type {any} */ (original).code = "ETIMEDOUT";
      const deps = makeDeps({
        scanAllAccounts: mock(() => Promise.reject(original)),
      });

      let caught;
      try {
        await scanCommand({}, deps);
      } catch (e) {
        caught = e;
      }
      expect(/** @type {any} */ (caught).code).toBe("ETIMEDOUT");
    });

    it("sets cause to the original error when scanAllAccounts rejects", async () => {
      const original = new Error("connection refused");
      const deps = makeDeps({
        scanAllAccounts: mock(() => Promise.reject(original)),
      });

      let caught;
      try {
        await scanCommand({}, deps);
      } catch (e) {
        caught = e;
      }
      expect(/** @type {any} */ (caught).cause).toBe(original);
    });
  });

  describe("return value", () => {
    it("returns total equal to the number of scan results", async () => {
      const deps = makeDeps({
        scanAllAccounts: mock(() => Promise.resolve([{}, {}, {}])),
      });
      const result = await scanCommand({}, deps);

      expect(result.total).toBe(3);
    });

    it("returns senders from aggregateBySender", async () => {
      const fakeSenders = [{ address: "x@y.com", count: 7 }];
      const deps = makeDeps({
        aggregateBySender: mock(() => fakeSenders),
      });
      const result = await scanCommand({}, deps);

      expect(result.senders).toBe(fakeSenders);
    });

    it("returns rawPath from saveScanResults", async () => {
      const deps = makeDeps({
        saveScanResults: mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" })),
      });
      const result = await scanCommand({}, deps);

      expect(result.rawPath).toBe("/out/raw.json");
    });

    it("returns summaryPath from saveScanResults", async () => {
      const deps = makeDeps({
        saveScanResults: mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" })),
      });
      const result = await scanCommand({}, deps);

      expect(result.summaryPath).toBe("/out/senders.json");
    });
  });
});
