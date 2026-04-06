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

    it("throws when destination folder does not exist", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await expect(moveCommand(["12345"], { to: "NonExistent" }, deps)).rejects.toThrow(
        'Destination folder "NonExistent" does not exist',
      );
    });
  });

  describe("happy path", () => {
    describe("moves UIDs and returns moved status", () => {
      it("increments moved count", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345"], { to: "Archive" }, deps);
        expect(result.stats.moved).toBe(1);
      });

      it("reports zero failed", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345"], { to: "Archive" }, deps);
        expect(result.stats.failed).toBe(0);
      });

      it("reports zero skipped", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345"], { to: "Archive" }, deps);
        expect(result.stats.skipped).toBe(0);
      });
    });

    describe("returns moved result entries for each UID", () => {
      it("returns two result entries", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345", "67890"], { to: "Archive" }, deps);
        expect(result.results).toHaveLength(2);
      });

      it("first result has moved status", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345", "67890"], { to: "Archive" }, deps);
        expect(result.results[0].status).toBe("moved");
      });

      it("second result has moved status", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345", "67890"], { to: "Archive" }, deps);
        expect(result.results[1].status).toBe("moved");
      });
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
    describe("skips all UIDs and returns skipped status", () => {
      it("reports two skipped", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345", "67890"], { to: "Archive", dryRun: true }, deps);
        expect(result.stats.skipped).toBe(2);
      });

      it("reports zero moved", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345", "67890"], { to: "Archive", dryRun: true }, deps);
        expect(result.stats.moved).toBe(0);
      });
    });

    it("does not call messageMove in dry-run mode", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);

      expect(deps._client.messageMove).not.toHaveBeenCalled();
    });

    describe("marks results with reason: dry-run", () => {
      it("sets reason to dry-run", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);
        expect(result.results[0].reason).toBe("dry-run");
      });

      it("sets status to skipped", async () => {
        const deps = makeDeps({ account: "Test Account" });
        const result = await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);
        expect(result.results[0].status).toBe("skipped");
      });
    });
  });

  describe("error handling", () => {
    describe("records failed status when account is not found", () => {
      it("increments failed count", async () => {
        const deps = makeDeps({ accounts: [makeAccount({ name: "Other Account" })], account: null });
        const result = await moveCommand(["test:12345"], { to: "Archive" }, deps);
        expect(result.stats.failed).toBe(1);
      });

      it("sets result status to failed", async () => {
        const deps = makeDeps({ accounts: [makeAccount({ name: "Other Account" })], account: null });
        const result = await moveCommand(["test:12345"], { to: "Archive" }, deps);
        expect(result.results[0].status).toBe("failed");
      });

      it("includes not found in error message", async () => {
        const deps = makeDeps({ accounts: [makeAccount({ name: "Other Account" })], account: null });
        const result = await moveCommand(["test:12345"], { to: "Archive" }, deps);
        expect(result.results[0].error).toMatch(/not found/);
      });
    });

    describe("records failed status when messageMove throws", () => {
      it("increments failed count", async () => {
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
        expect(result.stats.failed).toBe(1);
      });

      it("sets result status to failed", async () => {
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
        expect(result.results[0].status).toBe("failed");
      });
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

      it("increments failed count", async () => {
        const { deps } = makeLockFailDeps();
        const result = await moveCommand(["12345"], { to: "Archive" }, deps);
        expect(result.stats.failed).toBe(1);
      });

      it("sets result status to failed", async () => {
        const { deps } = makeLockFailDeps();
        const result = await moveCommand(["12345"], { to: "Archive" }, deps);
        expect(result.results[0].status).toBe("failed");
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

      const _result = await moveCommand(["icloud:111", "gmail:222"], { to: "Archive" }, deps);

      // Two forEachAccount calls — one per account
      expect(deps.forEachAccount).toHaveBeenCalledTimes(2);
    });

    it("reports moved count of 2", async () => {
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
