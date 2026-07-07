import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { buildProgram } from "../src/cli.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Minimal stub for requireAccounts — returns a fake account list. */
const FAKE_ACCOUNTS = [{ name: "Test Account", host: "imap.example.com" }];

function makeStubDeps(overrides = {}) {
  return {
    // command orchestrators — all return safe canned shapes by default
    scanCommand: mock(async () => ({ total: 0, senders: [], rawPath: "/tmp/raw.json", summaryPath: "/tmp/sum.json" })),
    classifyCommand: mock(() => ({ unclassifiedList: [] })),
    importClassificationsCommand: mock(() => ({ imported: 0, path: "/tmp/cls.json" })),
    sortCommand: mock(async () => ({})),
    downloadCommand: mock(async () => ({})),
    downloadReceiptsCommand: mock(async () => ({})),
    searchCommand: mock(async () => ({ allResults: [], warnings: [] })),
    readCommand: mock(async () => ({ account: { name: "Test" }, mailbox: "INBOX", parsed: {} })),
    listFoldersCommand: mock(async () => ({ allAccountFolders: [] })),
    extractAttachmentCommand: mock(async () => ({ listing: [] })),
    moveCommand: mock(async () => ({ stats: {}, results: [] })),
    inboxCommand: mock(async () => ({ resultsByAccount: {}, allResults: [] })),
    flagCommand: mock(async () => ({ stats: {}, results: [] })),
    replyCommand: mock(async () => ({ sent: true })),
    threadCommand: mock(async () => []),
    contactsCommand: mock(async () => ({ contacts: [], sinceLabel: "6m" })),
    initCommand: mock(async () => ({ installed: true })),
    // formatters — return identifiable strings so assertions can distinguish them
    formatScanOutput: mock(() => "scan-output"),
    formatClassifyOutput: mock(() => "classify-output"),
    formatImportClassificationsOutput: mock(() => "import-output"),
    formatSortOutput: mock(() => "sort-output"),
    formatDownloadOutput: mock(() => "download-output"),
    formatDownloadReceiptsOutput: mock(() => "download-receipts-output"),
    formatSearchOutput: mock(() => "search-output"),
    formatReadOutput: mock(() => "read-output"),
    formatFoldersOutput: mock(() => "folders-output"),
    formatAttachmentOutput: mock(() => "attachment-output"),
    formatMoveOutput: mock(() => "move-output"),
    formatInboxOutput: mock(() => "inbox-output"),
    formatFlagOutput: mock(() => "flag-output"),
    formatReplyOutput: mock(() => "reply-output"),
    formatThreadOutput: mock(() => []),
    formatContactsOutput: mock(() => "contacts-output"),
    formatInitOutput: mock(() => "init-output"),
    // progress renderers
    renderAuthEvent: mock(() => null),
    renderScanEvent: mock(() => null),
    renderSortEvent: mock(() => null),
    renderDownloadEvent: mock(() => null),
    renderDownloadReceiptsEvent: mock(() => null),
    // data dir
    DATA_DIR: "/tmp/data",
    // gateways
    _fs: {},
    _keychain: {},
    // helpers
    requireAccounts: mock(() => FAKE_ACCOUNTS),
    getOpenAiKey: mock(() => "test-key"),
    forEachAccount: mock(async () => {}),
    listMailboxes: mock(async () => []),
    simpleParser: mock(async () => ({})),
    importDownloadReceipts: mock(() => Promise.resolve({})),
    importVendorMap: mock(() => Promise.resolve({})),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("buildProgram", () => {
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

  // ── scan ────────────────────────────────────────────────────────────────────

  describe("scan command", () => {
    it("passes default months '12' to scanCommand", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "scan"]);

      expect(deps.scanCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "12" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("passes -m 6 as months '6' to scanCommand", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "scan", "-m", "6"]);

      expect(deps.scanCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "6" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("calls formatScanOutput with json=false by default", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "scan"]);

      expect(deps.formatScanOutput).toHaveBeenCalledWith(false, expect.anything(), expect.anything());
    });

    it("calls formatScanOutput with json=true when --json is passed", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "--json", "scan"]);

      expect(deps.formatScanOutput).toHaveBeenCalledWith(true, expect.anything(), expect.anything());
    });
  });

  // ── download ────────────────────────────────────────────────────────────────

  describe("download command", () => {
    it("passes default months '24' to downloadCommand", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "download"]);

      expect(deps.downloadCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "24" }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── sort ────────────────────────────────────────────────────────────────────

  describe("sort command", () => {
    it("passes default months '24' to sortCommand", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "sort"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ months: "24" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("previews by default (dryRun true when --apply omitted)", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "sort"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("executes with --apply (dryRun false)", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "sort", "--apply"]);

      expect(deps.sortCommand).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── plan/apply safety model ─────────────────────────────────────────────────

  describe("plan/apply model on mutating commands", () => {
    it("move previews by default (dryRun true)", async () => {
      const deps = makeStubDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "move", "42", "--to", "Archive"]);
      expect(deps.moveCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
      );
    });

    it("move executes with --apply (dryRun false)", async () => {
      const deps = makeStubDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "move", "42", "--to", "Archive", "--apply"]);
      expect(deps.moveCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: false }),
        expect.anything(),
      );
    });

    it("legacy --dry-run still forces preview even with --apply", async () => {
      const deps = makeStubDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "flag", "42", "--read", "--apply", "--dry-run"]);
      expect(deps.flagCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
      );
    });
  });

  // ── extract-attachment ──────────────────────────────────────────────────────

  describe("extract-attachment command", () => {
    it("parses index argument to integer 2 when '2' is given", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "extract-attachment", "100", "2"]);

      expect(deps.extractAttachmentCommand).toHaveBeenCalledWith("100", 2, expect.anything(), expect.anything());
    });

    it("passes undefined for index when omitted", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "extract-attachment", "100"]);

      expect(deps.extractAttachmentCommand).toHaveBeenCalledWith(
        "100",
        undefined,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── --account flag ──────────────────────────────────────────────────────────

  describe("--account flag", () => {
    it("passes account name filter to scanCommand deps when --account is specified", async () => {
      const deps = makeStubDeps({
        requireAccounts: mock(() => [
          { name: "Personal", host: "imap.example.com" },
          { name: "Work", host: "imap.work.com" },
        ]),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "--account", "Personal", "scan"]);

      expect(deps.scanCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ account: "Personal" }),
        expect.anything(),
      );
    });
  });

  // ── download-receipts ───────────────────────────────────────────────────────

  describe("download-receipts command", () => {
    it("passes importDownloadReceipts thunk from deps to downloadReceiptsCommand", async () => {
      const importDownloadReceipts = mock(() => Promise.resolve({}));
      const deps = makeStubDeps({ importDownloadReceipts });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "download-receipts"]);

      expect(deps.downloadReceiptsCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ importDownloadReceipts }),
        expect.anything(),
      );
    });

    it("forwards getOpenAiKey() result as openAiKey to downloadReceiptsCommand", async () => {
      const getOpenAiKey = mock(() => "sk-test-key");
      const deps = makeStubDeps({ getOpenAiKey });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "download-receipts"]);

      expect(deps.downloadReceiptsCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ openAiKey: "sk-test-key" }),
        expect.anything(),
      );
    });
  });

  // ── search warnings loop ────────────────────────────────────────────────────

  describe("search command", () => {
    it("writes each warning to console.error", async () => {
      const deps = makeStubDeps({
        searchCommand: mock(async () => ({ allResults: [], warnings: ["w1", "w2"] })),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "search", "foo"]);

      const stderrCalls = consoleError.mock.calls.map((c) => c[0]);
      expect(stderrCalls).toContain("w1");
      expect(stderrCalls).toContain("w2");
    });

    it("does not call console.log when results are empty and --json is not set", async () => {
      const deps = makeStubDeps({
        searchCommand: mock(async () => ({ allResults: [], warnings: [] })),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "search", "foo"]);

      expect(consoleLog).not.toHaveBeenCalled();
    });

    it("calls console.log when --json is set even with empty results", async () => {
      const deps = makeStubDeps({
        searchCommand: mock(async () => ({ allResults: [], warnings: [] })),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "--json", "search", "foo"]);

      expect(consoleLog).toHaveBeenCalledWith("search-output");
    });
  });

  // ── reply aborted ───────────────────────────────────────────────────────────

  describe("reply command", () => {
    it("writes 'Aborted.' to console.error when replyCommand returns aborted result", async () => {
      const deps = makeStubDeps({
        replyCommand: mock(async () => ({ aborted: true })),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "reply", "42"]);

      expect(consoleError).toHaveBeenCalledWith("Aborted.");
      expect(deps.formatReplyOutput).not.toHaveBeenCalled();
    });

    it("calls formatReplyOutput when reply is not aborted", async () => {
      const deps = makeStubDeps({
        replyCommand: mock(async () => ({ sent: true })),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "reply", "42"]);

      expect(deps.formatReplyOutput).toHaveBeenCalled();
    });
  });

  // ── thread account headers ──────────────────────────────────────────────────

  describe("thread command", () => {
    it("emits === <account> === header per formatThreadOutput entry", async () => {
      const deps = makeStubDeps({
        threadCommand: mock(async () => []),
        formatThreadOutput: mock(() => [
          { account: "Account A", output: "messages-A" },
          { account: "Account B", output: "messages-B" },
        ]),
      });
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "thread", "99"]);

      const stderrCalls = consoleError.mock.calls.map((c) => c[0]);
      expect(stderrCalls).toContain("\n=== Account A ===");
      expect(stderrCalls).toContain("\n=== Account B ===");
    });
  });

  // ── init version ────────────────────────────────────────────────────────────

  describe("init command", () => {
    it("passes the program version as the first argument to initCommand", async () => {
      const deps = makeStubDeps();
      const program = buildProgram(deps);
      await program.parseAsync(["node", "mailctl", "init"]);

      expect(deps.initCommand).toHaveBeenCalledWith("1.2.0", expect.anything());
    });

    it("installs globally by default", async () => {
      const deps = makeStubDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "init"]);

      expect(deps.initCommand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ global: true }));
    });

    it("installs locally with --local", async () => {
      const deps = makeStubDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "init", "--local"]);

      expect(deps.initCommand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ global: false }));
    });
  });
});
