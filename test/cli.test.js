import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { buildProgram, defaultDeps } from "../src/cli.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const FAKE_ACCOUNTS = [{ name: "Test Account", host: "imap.example.com" }];

/**
 * Builds a minimal nested deps object that satisfies `buildProgram`.
 * Per-command wiring assertions live in the per-noun test files under test/cli/.
 *
 * @param {{ receipts?: object, mail?: object, mutation?: object, init?: object }} [overrides]
 */
function makeIntegrationDeps(overrides = {}) {
  return {
    requireAccounts: mock(() => FAKE_ACCOUNTS),
    receipts: {
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
      getOpenAiKey: mock(() => null),
      importDownloadReceipts: mock(() => Promise.resolve({})),
      importVendorMap: mock(() => Promise.resolve({})),
      ...overrides.receipts,
    },
    mail: {
      searchCommand: mock(async () => ({ allResults: [], warnings: [] })),
      readCommand: mock(async () => ({ account: { name: "Test" }, mailbox: "INBOX", parsed: {} })),
      listFoldersCommand: mock(async () => ({ allAccountFolders: [] })),
      extractAttachmentCommand: mock(async () => ({ listing: [] })),
      inboxCommand: mock(async () => ({ resultsByAccount: {}, allResults: [] })),
      threadCommand: mock(async () => []),
      contactsCommand: mock(async () => ({ contacts: [], sinceLabel: "6m" })),
      formatSearchOutput: mock(() => "search"),
      formatReadOutput: mock(() => "read"),
      formatFoldersOutput: mock(() => "folders"),
      formatAttachmentOutput: mock(() => "attachment"),
      formatInboxOutput: mock(() => "inbox"),
      formatThreadOutput: mock(() => []),
      formatContactsOutput: mock(() => "contacts"),
      renderAuthEvent: mock(() => null),
      forEachAccount: mock(async () => {}),
      listMailboxes: mock(async () => []),
      simpleParser: mock(async () => ({})),
      _fs: {},
      ...overrides.mail,
    },
    mutation: {
      moveCommand: mock(async () => ({ stats: {}, results: [] })),
      flagCommand: mock(async () => ({ stats: {}, results: [] })),
      replyCommand: mock(async () => ({ sent: true })),
      formatMoveOutput: mock(() => "move"),
      formatFlagOutput: mock(() => "flag"),
      formatReplyOutput: mock(() => "reply"),
      forEachAccount: mock(async () => {}),
      listMailboxes: mock(async () => []),
      simpleParser: mock(async () => ({})),
      _fs: {},
      smtpGateway: {},
      editorGateway: {},
      confirmGateway: {},
      ...overrides.mutation,
    },
    init: {
      initCommand: mock(async () => ({ installed: true })),
      formatInitOutput: mock(() => "init"),
      ...overrides.init,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("buildProgram (integration)", () => {
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

  // ── command registration ─────────────────────────────────────────────────────

  describe("command registration", () => {
    it("registers all expected top-level command names", () => {
      const program = buildProgram(makeIntegrationDeps());
      const names = program.commands.map((c) => c.name());

      for (const expected of [
        "receipts",
        "search",
        "read",
        "folders",
        "extract-attachment",
        "inbox",
        "thread",
        "contacts",
        "move",
        "flag",
        "reply",
        "init",
      ]) {
        expect(names).toContain(expected);
      }
    });

    it("registers all receipts sub-commands", () => {
      const program = buildProgram(makeIntegrationDeps());
      const receiptsCmd = program.commands.find((c) => c.name() === "receipts");
      const subNames = receiptsCmd?.commands.map((c) => c.name()) ?? [];

      for (const expected of ["scan", "classify", "import-classifications", "sort", "download", "extract"]) {
        expect(subNames).toContain(expected);
      }
    });
  });

  // ── cross-cutting flags ──────────────────────────────────────────────────────

  describe("global --json flag", () => {
    it("passes json=true to formatScanOutput when --json is set", async () => {
      const deps = makeIntegrationDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "--json", "scan"]);

      expect(deps.receipts.formatScanOutput).toHaveBeenCalledWith(true, expect.anything(), expect.anything());
    });

    it("passes json=false to formatScanOutput by default", async () => {
      const deps = makeIntegrationDeps();
      await buildProgram(deps).parseAsync(["node", "mailctl", "scan"]);

      expect(deps.receipts.formatScanOutput).toHaveBeenCalledWith(false, expect.anything(), expect.anything());
    });
  });

  describe("global --account flag", () => {
    it("forwards --account name to scanCommand", async () => {
      const deps = makeIntegrationDeps({
        receipts: {
          scanCommand: mock(async () => ({
            total: 0,
            senders: [],
            rawPath: "/tmp/r.json",
            summaryPath: "/tmp/s.json",
          })),
        },
      });
      const requireAccounts = mock(() => [
        { name: "Personal", host: "imap.example.com" },
        { name: "Work", host: "imap.work.com" },
      ]);
      deps.requireAccounts = requireAccounts;
      await buildProgram(deps).parseAsync(["node", "mailctl", "--account", "Personal", "scan"]);

      expect(deps.receipts.scanCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ account: "Personal" }),
        expect.anything(),
      );
    });
  });

  // ── error handling ───────────────────────────────────────────────────────────

  describe("withErrorHandling", () => {
    it("exits process with code 1 when a command orchestrator throws", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      const deps = makeIntegrationDeps({
        receipts: {
          scanCommand: mock(async () => {
            throw new Error("IMAP failure");
          }),
        },
      });

      await buildProgram(deps)
        .parseAsync(["node", "mailctl", "scan"])
        .catch(() => {});

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  // ── defaultDeps shape ────────────────────────────────────────────────────────

  it("defaultDeps has the expected top-level slice keys", () => {
    expect(Object.keys(defaultDeps).sort()).toEqual(["init", "mail", "mutation", "receipts", "requireAccounts"].sort());
  });
});
