import { describe, expect, it, mock } from "bun:test";
import { flagCommand } from "../src/flag-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeClient({ searchResult = [42] } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(searchResult)),
    messageFlagsAdd: mock(() => Promise.resolve()),
    messageFlagsRemove: mock(() => Promise.resolve()),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const client = makeClient();

  const forEachAccount = makeForEachAccount(client, account);
  const listMailboxes = makeListMailboxes();

  return {
    accounts: [account],
    account: "Test Account",
    forEachAccount,
    listMailboxes,
    _client: client,
    ...overrides,
  };
}

// ── flagCommand ────────────────────────────────────────────────────────────────

describe("flagCommand", () => {
  describe("input validation", () => {
    it("throws when no UIDs provided", async () => {
      const deps = makeDeps();
      await expect(flagCommand([], { read: true }, deps)).rejects.toThrow("No UIDs provided.");
    });

    it("throws when no flag option is specified", async () => {
      const deps = makeDeps();
      await expect(flagCommand(["42"], {}, deps)).rejects.toThrow("No flag options specified");
    });

    it("throws when --read and --unread are both set", async () => {
      const deps = makeDeps();
      await expect(flagCommand(["42"], { read: true, unread: true }, deps)).rejects.toThrow(
        "--read and --unread are mutually exclusive",
      );
    });

    it("accumulates failure when account prefix is not found", async () => {
      const deps = makeDeps({ accounts: [makeAccount({ name: "Other" })] });
      const { stats, results } = await flagCommand(["test:42"], { read: true }, deps);

      expect({ stats, result: results[0] }).toMatchObject({
        stats: { failed: 1 },
        result: { status: "failed", error: expect.stringContaining('Account "test" not found.') },
      });
    });
  });

  describe("happy path", () => {
    it("applies flags and returns result with account and mailbox", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);

      expect(results).toMatchObject([{ account: "Test Account", mailbox: "INBOX" }]);
    });

    it("marks \\Seen as added and removed as empty for --read", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);

      expect(results[0]).toMatchObject({ added: expect.arrayContaining(["\\Seen"]), removed: [] });
    });

    it("marks \\Seen as removed and added as empty for --unread", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { unread: true, mailbox: "INBOX" }, deps);

      expect(results[0]).toMatchObject({ removed: expect.arrayContaining(["\\Seen"]), added: [] });
    });

    it("marks \\Flagged as added for --star", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { star: true, mailbox: "INBOX" }, deps);

      expect(results[0].added).toContain("\\Flagged");
    });

    it("includes UIDs as numbers in result", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42", "99"], { read: true, mailbox: "INBOX" }, deps);

      expect(results[0].uids).toEqual(expect.arrayContaining([42, 99]));
    });

    it("calls messageFlagsAdd on the client", async () => {
      const deps = makeDeps();
      await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);

      expect(deps._client.messageFlagsAdd).toHaveBeenCalledTimes(1);
    });

    it("increments stats.flagged on success", async () => {
      const deps = makeDeps();
      const { stats } = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);
      expect(stats.flagged).toBe(1);
    });
  });

  describe("dry-run", () => {
    it("returns dryRun:true in result", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { read: true, mailbox: "INBOX", dryRun: true }, deps);

      expect(results[0].dryRun).toBe(true);
    });

    it("does not call messageFlagsAdd in dry-run mode", async () => {
      const deps = makeDeps();
      await flagCommand(["42"], { read: true, mailbox: "INBOX", dryRun: true }, deps);

      expect(deps._client.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it("returns what would be added in dry-run result", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { star: true, mailbox: "INBOX", dryRun: true }, deps);

      expect(results[0]).toMatchObject({ added: expect.arrayContaining(["\\Flagged"]), removed: [] });
    });

    it("increments stats.skipped on dry-run", async () => {
      const deps = makeDeps();
      const { stats } = await flagCommand(["42"], { read: true, mailbox: "INBOX", dryRun: true }, deps);
      expect(stats.skipped).toBe(1);
    });
  });

  describe("mailbox detection", () => {
    it("auto-detects mailbox when --mailbox is not provided", async () => {
      const deps = makeDeps();
      const { results } = await flagCommand(["42"], { read: true }, deps);

      // detectMailbox tries INBOX first and finds the UID there
      expect(results[0].mailbox).toBe("INBOX");
    });

    it("accumulates failure when UID not found in any mailbox during auto-detection", async () => {
      const notFoundClient = {
        getMailboxLock: mock(() => Promise.resolve(makeLock())),
        search: mock(() => Promise.resolve([])), // no UIDs found
        messageFlagsAdd: mock(() => Promise.resolve()),
        messageFlagsRemove: mock(() => Promise.resolve()),
      };
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(notFoundClient, makeAccount());
        }),
        _client: notFoundClient,
      });
      const { stats, results } = await flagCommand(["42"], { read: true }, deps);

      expect({ stats, result: results[0] }).toMatchObject({ stats: { failed: 1 }, result: { status: "failed" } });
    });

    it("accumulates failure when mailbox lock fails", async () => {
      const lockFailClient = {
        getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
        search: mock(() => Promise.resolve([42])),
        messageFlagsAdd: mock(() => Promise.resolve()),
        messageFlagsRemove: mock(() => Promise.resolve()),
      };
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(lockFailClient, makeAccount());
        }),
        _client: lockFailClient,
      });
      const { stats, results } = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);

      expect({ stats, result: results[0] }).toMatchObject({ stats: { failed: 1 }, result: { status: "failed" } });
    });
  });
});
