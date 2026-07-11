import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Command } from "commander";
import { registerMailCommands } from "../../src/cli/mail-cli.js";
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
    ...overrides,
  };
}

describe("registerMailCommands", () => {
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

  // ── search ───────────────────────────────────────────────────────────────────

  describe("search command", () => {
    it("routes to searchCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "search", "foo"]);
      expect(deps.searchCommand).toHaveBeenCalled();
    });

    it("writes each warning to console.error", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps({
        searchCommand: mock(async () => ({ allResults: [], warnings: ["w1", "w2"] })),
      });
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "search", "foo"]);

      const stderrCalls = consoleError.mock.calls.map((c) => c[0]);
      expect(stderrCalls).toContain("w1");
      expect(stderrCalls).toContain("w2");
    });

    it("does not call console.log when results are empty and --json is not set", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "search", "foo"]);
      expect(consoleLog).not.toHaveBeenCalled();
    });

    it("calls console.log when --json is set even with empty results", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "--json", "search", "foo"]);
      expect(consoleLog).toHaveBeenCalledWith("search");
    });
  });

  // ── extract-attachment ───────────────────────────────────────────────────────

  describe("extract-attachment command", () => {
    it("parses index argument to integer 2 when '2' is given", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "extract-attachment", "100", "2"]);
      expect(deps.extractAttachmentCommand).toHaveBeenCalledWith("100", 2, expect.anything(), expect.anything());
    });

    it("passes undefined for index when omitted", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "extract-attachment", "100"]);
      expect(deps.extractAttachmentCommand).toHaveBeenCalledWith(
        "100",
        undefined,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── thread ───────────────────────────────────────────────────────────────────

  describe("thread command", () => {
    it("emits === <account> === header per formatThreadOutput entry", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps({
        threadCommand: mock(async () => []),
        formatThreadOutput: mock(() => [
          { account: "Account A", output: "messages-A" },
          { account: "Account B", output: "messages-B" },
        ]),
      });
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "thread", "99"]);

      const stderrCalls = consoleError.mock.calls.map((c) => c[0]);
      expect(stderrCalls).toContain("\n=== Account A ===");
      expect(stderrCalls).toContain("\n=== Account B ===");
    });
  });

  // ── folders alias ────────────────────────────────────────────────────────────

  describe("folders command", () => {
    it("routes to listFoldersCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "folders"]);
      expect(deps.listFoldersCommand).toHaveBeenCalled();
    });

    it("list-folders alias routes to listFoldersCommand", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMailCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "list-folders"]);
      expect(deps.listFoldersCommand).toHaveBeenCalled();
    });
  });
});
