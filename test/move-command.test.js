import { describe, expect, it, mock } from "bun:test";
import { moveCommand } from "../src/move-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

function makeClient({ messageMoveShouldFail = false } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    messageMove: mock(() => (messageMoveShouldFail ? Promise.reject(new Error("Move failed")) : Promise.resolve())),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const client = makeClient();

  const listMailboxes = makeListMailboxes([
    { path: "INBOX", specialUse: "\\Inbox" },
    { path: "Archive", specialUse: null },
  ]);

  const forEachAccount = makeForEachAccount(client, account);

  return {
    accounts: [account],
    account: null,
    forEachAccount,
    listMailboxes,
    _client: client,
    ...overrides,
  };
}

// ── moveCommand ────────────────────────────────────────────────────────────────

describe("moveCommand", () => {
  describe("input validation", () => {
    it("throws when no UIDs are provided (empty array)", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await expect(moveCommand([], { to: "Archive" }, deps)).rejects.toThrow("No UIDs provided.");
    });

    it("throws when UID has no prefix and no --account is set", async () => {
      const deps = makeDeps({ account: null });
      await expect(moveCommand(["12345"], { to: "Archive" }, deps)).rejects.toThrow(
        'UID "12345" has no account prefix',
      );
    });
  });

  describe("happy path", () => {
    it("moves UIDs and returns moved stats", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345"], { to: "Archive" }, deps);

      expect(result.stats).toMatchObject({ moved: 1, failed: 0, skipped: 0 });
    });

    it("returns moved result entries for each UID", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345", "67890"], { to: "Archive" }, deps);

      expect(result.results).toMatchObject([{ status: "moved" }, { status: "moved" }]);
    });

    it("calls messageMove with comma-joined UIDs", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345", "67890"], { to: "Archive" }, deps);

      expect(deps._client.messageMove).toHaveBeenCalledWith("12345,67890", "Archive", { uid: true });
    });

    it("uses INBOX as default source mailbox", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345"], { to: "Archive" }, deps);

      expect(deps._client.getMailboxLock).toHaveBeenCalledWith("INBOX");
    });

    it("uses --mailbox option as source when provided", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345"], { to: "Archive", mailbox: "Sent" }, deps);

      expect(deps._client.getMailboxLock).toHaveBeenCalledWith("Sent");
    });
  });

  describe("dry-run", () => {
    it("skips all UIDs and returns skipped stats", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345", "67890"], { to: "Archive", dryRun: true }, deps);

      expect(result.stats).toMatchObject({ skipped: 2, moved: 0 });
    });

    it("does not call messageMove in dry-run mode", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);

      expect(deps._client.messageMove).not.toHaveBeenCalled();
    });

    it("marks results with reason: dry-run and status: skipped", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);

      expect(result.results[0]).toMatchObject({ reason: "dry-run", status: "skipped" });
    });
  });

  describe("error handling", () => {
    it("records failed status when destination folder does not exist", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345"], { to: "NonExistent" }, deps);

      expect(result).toMatchObject({
        stats: { failed: 1 },
        results: [{ status: "failed", error: expect.stringMatching(/does not exist/) }],
      });
    });

    it("continues to next account when one account is missing the destination folder", async () => {
      const account1 = makeAccount({ name: "iCloud" });
      const account2 = makeAccount({ name: "Gmail" });
      const client1 = makeClient();
      const client2 = makeClient();

      let callIndex = 0;
      const deps = makeDeps({
        accounts: [account1, account2],
        account: null,
        forEachAccount: mock(async (_targetAccts, fn) => {
          callIndex++;
          if (callIndex === 1) await fn(client1, account1);
          else await fn(client2, account2);
        }),
        listMailboxes: mock((client) => {
          if (client === client1) return Promise.resolve([{ path: "INBOX" }, { path: "Archive" }]);
          return Promise.resolve([{ path: "INBOX" }]);
        }),
        _client: client1,
      });

      const result = await moveCommand(["icloud:111", "gmail:222"], { to: "Archive" }, deps);

      expect(result.stats.moved).toBeGreaterThanOrEqual(1);
      expect(result.stats.failed).toBeGreaterThanOrEqual(1);
    });

    it("records failed status when account is not found", async () => {
      const deps = makeDeps({ accounts: [makeAccount({ name: "Other Account" })], account: null });
      const result = await moveCommand(["test:12345"], { to: "Archive" }, deps);

      expect(result).toMatchObject({
        stats: { failed: 1 },
        results: [{ status: "failed", error: expect.stringMatching(/not found/) }],
      });
    });

    it("records failed status when messageMove throws", async () => {
      const failingClient = makeClient({ messageMoveShouldFail: true });
      const deps = makeDeps({
        account: "Test Account",
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(failingClient, makeAccount());
        }),
        listMailboxes: mock(() => Promise.resolve([{ path: "INBOX" }, { path: "Archive" }])),
        _client: failingClient,
      });
      const result = await moveCommand(["12345"], { to: "Archive" }, deps);

      expect(result).toMatchObject({ stats: { failed: 1 }, results: [{ status: "failed" }] });
    });

    describe("records failed status when source mailbox lock fails", () => {
      function makeLockFailDeps() {
        const lockFailClient = {
          getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
          messageMove: mock(() => Promise.resolve()),
        };
        const deps = makeDeps({
          account: "Test Account",
          forEachAccount: mock(async (_accounts, fn) => {
            await fn(lockFailClient, makeAccount());
          }),
          _client: lockFailClient,
        });
        return { lockFailClient, deps };
      }

      it("increments failed count and sets result to failed", async () => {
        const { deps } = makeLockFailDeps();
        const result = await moveCommand(["12345"], { to: "Archive" }, deps);

        expect(result).toMatchObject({ stats: { failed: 1 }, results: [{ status: "failed" }] });
      });

      it("does not call messageMove", async () => {
        const { lockFailClient, deps } = makeLockFailDeps();
        await moveCommand(["12345"], { to: "Archive" }, deps);
        expect(lockFailClient.messageMove).not.toHaveBeenCalled();
      });
    });
  });

  describe("multi-account UIDs", () => {
    it("groups prefixed UIDs by account correctly", async () => {
      const account1 = makeAccount({ name: "iCloud" });
      const account2 = makeAccount({ name: "Gmail" });
      const client1 = makeClient();
      const client2 = makeClient();

      let callIndex = 0;
      const deps = makeDeps({
        accounts: [account1, account2],
        account: null,
        forEachAccount: mock(async (_targetAccts, fn) => {
          callIndex++;
          if (callIndex === 1) await fn(client1, account1);
          else await fn(client2, account2);
        }),
        listMailboxes: mock(() => Promise.resolve([{ path: "INBOX" }, { path: "Archive" }])),
        _client: client1,
      });

      await moveCommand(["icloud:111", "gmail:222"], { to: "Archive" }, deps);

      expect(deps.forEachAccount).toHaveBeenCalledTimes(2);
    });

    it("moves UIDs from both accounts when using prefixed UIDs", async () => {
      const account1 = makeAccount({ name: "iCloud" });
      const account2 = makeAccount({ name: "Gmail" });
      const client1 = makeClient();
      const client2 = makeClient();

      let callIndex = 0;
      const deps = makeDeps({
        accounts: [account1, account2],
        account: null,
        forEachAccount: mock(async (_targetAccts, fn) => {
          callIndex++;
          if (callIndex === 1) await fn(client1, account1);
          else await fn(client2, account2);
        }),
        listMailboxes: mock(() => Promise.resolve([{ path: "INBOX" }, { path: "Archive" }])),
        _client: client1,
      });

      const result = await moveCommand(["icloud:111", "gmail:222"], { to: "Archive" }, deps);

      expect(result.stats.moved).toBe(2);
    });
  });
});
