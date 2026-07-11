import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Command } from "commander";
import { registerReceiptsCommands } from "../../src/cli/receipts-cli.js";
import { createCliContext } from "../../src/cli-context.js";

const FAKE_ACCOUNTS = [{ name: "Test", host: "imap.example.com" }];

function makeCtx() {
  const program = new Command();
  program.option("--account <name>").option("--json");
  const ctx = createCliContext({
    getGlobalOpts: () => program.opts(),
    requireAccounts: mock(() => FAKE_ACCOUNTS),
  });
  return { program, ctx };
}

function makeDeps(overrides = {}) {
  return {
    scanCommand: mock(async () => ({ total: 0, senders: [], rawPath: "/tmp/r.json", summaryPath: "/tmp/s.json" })),
    classifyCommand: mock(() => ({ unclassifiedList: [] })),
    importClassificationsCommand: mock(() => ({ imported: 0, path: "/tmp/c.json" })),
    sortCommand: mock(async () => ({})),
    downloadCommand: mock(async () => ({})),
    downloadReceiptsCommand: mock(async () => ({})),
    formatScanOutput: mock(() => "scan"),
    formatClassifyOutput: mock(() => "classify"),
    formatImportClassificationsOutput: mock(() => "import"),
    formatSortOutput: mock(() => "sort"),
    formatDownloadOutput: mock(() => "download"),
    formatDownloadReceiptsOutput: mock(() => "receipts"),
    renderScanEvent: mock(() => null),
    renderSortEvent: mock(() => null),
    renderDownloadEvent: mock(() => null),
    renderDownloadReceiptsEvent: mock(() => null),
    DATA_DIR: "/tmp",
    _fs: { mkdir: mock(() => {}) },
    getOpenAiKey: mock(() => "test-key"),
    importDownloadReceipts: mock(() => Promise.resolve({})),
    importVendorMap: mock(() => Promise.resolve({})),
    ...overrides,
  };
}

describe("registerReceiptsCommands", () => {
  let consoleLog;
  let consoleError;

  beforeEach(() => {
    consoleLog = spyOn(console, "log").mockImplementation(() => {});
    consoleError = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  // ── routing ──────────────────────────────────────────────────────────────────

  describe("receipts noun-group routing", () => {
    it("`receipts scan` routes to scanCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "receipts", "scan"]);
      expect(deps.scanCommand).toHaveBeenCalled();
    });

    it("`receipts extract` routes to downloadReceiptsCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "receipts", "extract"]);
      expect(deps.downloadReceiptsCommand).toHaveBeenCalled();
    });

    it("`receipts extract --list-vendors` routes to downloadReceiptsCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "receipts", "extract", "--list-vendors"]);
      expect(deps.downloadReceiptsCommand).toHaveBeenCalled();
    });

    it("legacy top-level `download-receipts` routes to downloadReceiptsCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "download-receipts"]);
      expect(deps.downloadReceiptsCommand).toHaveBeenCalled();
    });

    it("legacy top-level `scan` routes to scanCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "scan"]);
      expect(deps.scanCommand).toHaveBeenCalled();
    });
  });

  // ── scan defaults ────────────────────────────────────────────────────────────

  describe("scan command", () => {
    it("passes default months '12' to scanCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "scan"]);

      expect(deps.scanCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "12" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("passes -m 6 as months '6' to scanCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "scan", "-m", "6"]);

      expect(deps.scanCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "6" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("calls formatScanOutput with json=false by default", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "scan"]);

      expect(deps.formatScanOutput).toHaveBeenCalledWith(false, expect.anything(), expect.anything());
    });
  });

  // ── sort defaults ────────────────────────────────────────────────────────────

  describe("sort command", () => {
    it("passes default months '24' to sortCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "sort"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "24" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("previews by default (dryRun true when --apply omitted)", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "sort"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("executes with --apply (dryRun false)", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "sort", "--apply"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("`receipts sort` previews by default", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "receipts", "sort"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── download defaults ────────────────────────────────────────────────────────

  describe("download command", () => {
    it("passes default months '24' to downloadCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "download"]);

      expect(deps.downloadCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "24" }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── download-receipts dep forwarding ─────────────────────────────────────────

  describe("download-receipts command", () => {
    it("passes importDownloadReceipts thunk from deps to downloadReceiptsCommand", async () => {
      const { program, ctx } = makeCtx();
      const importDownloadReceipts = mock(() => Promise.resolve({}));
      const deps = makeDeps({ importDownloadReceipts });
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "download-receipts"]);

      expect(deps.downloadReceiptsCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ importDownloadReceipts }),
        expect.anything(),
      );
    });

    it("forwards getOpenAiKey() result as openAiKey to downloadReceiptsCommand", async () => {
      const { program, ctx } = makeCtx();
      const getOpenAiKey = mock(() => "sk-test-key");
      const deps = makeDeps({ getOpenAiKey });
      registerReceiptsCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "download-receipts"]);

      expect(deps.downloadReceiptsCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ openAiKey: "sk-test-key" }),
        expect.anything(),
      );
    });
  });
});
