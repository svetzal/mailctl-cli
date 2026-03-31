import { afterEach, describe, expect, it, mock } from "bun:test";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Register module mocks and load scan-command.js with those mocks applied.
 * Returns the scanCommand function plus all mock references for assertions.
 */
function makeScanCommand(overrides = {}) {
  const scanAllAccounts = overrides.scanAllAccounts ?? mock(() => Promise.resolve([{ uid: 1 }, { uid: 2 }]));
  const aggregateBySender = overrides.aggregateBySender ?? mock(() => [{ address: "vendor@example.com", count: 2 }]);
  const ensureDataDir = overrides.ensureDataDir ?? mock(() => {});
  const saveScanResults =
    overrides.saveScanResults ??
    mock(() => ({ rawPath: "/data/scan-results.json", summaryPath: "/data/senders.json" }));

  mock.module("../src/scanner.js", () => ({ scanAllAccounts, aggregateBySender }));
  mock.module("../src/scan-data.js", () => ({ ensureDataDir, saveScanResults }));

  const { scanCommand } = require("../src/scan-command.js");

  return { scanCommand, scanAllAccounts, aggregateBySender, ensureDataDir, saveScanResults };
}

function makeDeps(overrides = {}) {
  return {
    account: null,
    dataDir: "/data",
    fsGateway: {},
    ...overrides,
  };
}

afterEach(() => {
  mock.restore();
});

// ── scanCommand ────────────────────────────────────────────────────────────────

describe("scanCommand", () => {
  describe("scanAllAccounts invocation", () => {
    it("passes months parsed to int to scanAllAccounts", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      await scanCommand({ months: "6" }, makeDeps());

      expect(scanAllAccounts).toHaveBeenCalledWith(expect.objectContaining({ months: 6 }), {}, expect.any(Function));
    });

    it("defaults months to 12 when opts.months is not provided", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      await scanCommand({}, makeDeps());

      expect(scanAllAccounts).toHaveBeenCalledWith(expect.objectContaining({ months: 12 }), {}, expect.any(Function));
    });

    it("passes allMailboxes option to scanAllAccounts", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      await scanCommand({ allMailboxes: true }, makeDeps());

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ allMailboxes: true }),
        {},
        expect.any(Function),
      );
    });

    it("defaults allMailboxes to false when not provided", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      await scanCommand({}, makeDeps());

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ allMailboxes: false }),
        {},
        expect.any(Function),
      );
    });

    it("passes account from deps to scanAllAccounts", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      await scanCommand({}, makeDeps({ account: "iCloud" }));

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ account: "iCloud" }),
        {},
        expect.any(Function),
      );
    });

    it("normalises empty account string to null in scanAllAccounts call", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      await scanCommand({}, makeDeps({ account: "" }));

      expect(scanAllAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ account: null }),
        {},
        expect.any(Function),
      );
    });

    it("forwards the onProgress callback to scanAllAccounts", async () => {
      const { scanCommand, scanAllAccounts } = makeScanCommand();
      const onProgress = mock(() => {});
      await scanCommand({}, makeDeps(), onProgress);

      expect(scanAllAccounts).toHaveBeenCalledWith(expect.anything(), {}, onProgress);
    });
  });

  describe("aggregateBySender invocation", () => {
    it("calls aggregateBySender with the raw scan results", async () => {
      const fakeResults = [{ uid: 10 }, { uid: 20 }];
      const { scanCommand, aggregateBySender } = makeScanCommand({
        scanAllAccounts: mock(() => Promise.resolve(fakeResults)),
      });
      await scanCommand({}, makeDeps());

      expect(aggregateBySender).toHaveBeenCalledWith(fakeResults);
    });
  });

  describe("ensureDataDir invocation", () => {
    it("calls ensureDataDir with dataDir from deps", async () => {
      const { scanCommand, ensureDataDir } = makeScanCommand();
      await scanCommand({}, makeDeps({ dataDir: "/custom/data" }));

      expect(ensureDataDir).toHaveBeenCalledWith("/custom/data", expect.anything());
    });

    it("calls ensureDataDir with the injected fsGateway", async () => {
      const fsGateway = { mkdir: mock(() => {}) };
      const { scanCommand, ensureDataDir } = makeScanCommand();
      await scanCommand({}, makeDeps({ fsGateway }));

      expect(ensureDataDir).toHaveBeenCalledWith(expect.anything(), fsGateway);
    });
  });

  describe("saveScanResults invocation", () => {
    it("calls saveScanResults with the dataDir from deps", async () => {
      const { scanCommand, saveScanResults } = makeScanCommand();
      await scanCommand({}, makeDeps({ dataDir: "/my/data" }));

      expect(saveScanResults).toHaveBeenCalledWith("/my/data", expect.anything(), expect.anything());
    });

    it("calls saveScanResults with scan results in the data payload", async () => {
      const fakeResults = [{ uid: 99 }];
      const { scanCommand, saveScanResults } = makeScanCommand({
        scanAllAccounts: mock(() => Promise.resolve(fakeResults)),
      });
      await scanCommand({}, makeDeps());

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scanResults: fakeResults }),
        expect.anything(),
      );
    });

    it("calls saveScanResults with aggregated senders in the data payload", async () => {
      const fakeSenders = [{ address: "a@b.com", count: 3 }];
      const { scanCommand, saveScanResults } = makeScanCommand({
        aggregateBySender: mock(() => fakeSenders),
      });
      await scanCommand({}, makeDeps());

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ senders: fakeSenders }),
        expect.anything(),
      );
    });

    it("passes opts.output as rawPath to saveScanResults", async () => {
      const { scanCommand, saveScanResults } = makeScanCommand();
      await scanCommand({ output: "/custom/raw.json" }, makeDeps());

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rawPath: "/custom/raw.json" }),
        expect.anything(),
      );
    });

    it("passes undefined rawPath when opts.output is not provided", async () => {
      const { scanCommand, saveScanResults } = makeScanCommand();
      await scanCommand({}, makeDeps());

      expect(saveScanResults).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rawPath: undefined }),
        expect.anything(),
      );
    });

    it("calls saveScanResults with the injected fsGateway", async () => {
      const fsGateway = { writeJson: mock(() => {}) };
      const { scanCommand, saveScanResults } = makeScanCommand();
      await scanCommand({}, makeDeps({ fsGateway }));

      expect(saveScanResults).toHaveBeenCalledWith(expect.anything(), expect.anything(), fsGateway);
    });
  });

  describe("return value", () => {
    it("returns total equal to the number of scan results", async () => {
      const { scanCommand } = makeScanCommand({
        scanAllAccounts: mock(() => Promise.resolve([{}, {}, {}])),
      });
      const result = await scanCommand({}, makeDeps());

      expect(result.total).toBe(3);
    });

    it("returns senders from aggregateBySender", async () => {
      const fakeSenders = [{ address: "x@y.com", count: 7 }];
      const { scanCommand } = makeScanCommand({
        aggregateBySender: mock(() => fakeSenders),
      });
      const result = await scanCommand({}, makeDeps());

      expect(result.senders).toBe(fakeSenders);
    });

    it("returns rawPath from saveScanResults", async () => {
      const { scanCommand } = makeScanCommand({
        saveScanResults: mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" })),
      });
      const result = await scanCommand({}, makeDeps());

      expect(result.rawPath).toBe("/out/raw.json");
    });

    it("returns summaryPath from saveScanResults", async () => {
      const { scanCommand } = makeScanCommand({
        saveScanResults: mock(() => ({ rawPath: "/out/raw.json", summaryPath: "/out/senders.json" })),
      });
      const result = await scanCommand({}, makeDeps());

      expect(result.summaryPath).toBe("/out/senders.json");
    });
  });
});
