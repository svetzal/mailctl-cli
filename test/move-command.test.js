import { describe, it, expect, mock } from "bun:test";
import { moveCommand } from "../src/move-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLock() {
  return { release: mock(() => {}) };
}

function makeAccount(overrides = {}) {
  return { name: "Test Account", user: "user@test.com", ...overrides };
}

function makeClient({ folders = ["INBOX", "Archive"], messageMoveShouldFail = false } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    messageMove: mock(() =>
      messageMoveShouldFail
        ? Promise.reject(new Error("Move failed"))
        : Promise.resolve()
    ),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const client = makeClient({ folders: ["INBOX", "Archive"] });

  const listMailboxes = mock(() =>
    Promise.resolve([
      { path: "INBOX", specialUse: "\\Inbox" },
      { path: "Archive", specialUse: null },
    ])
  );

  const forEachAccount = mock(async (accounts, fn) => {
    await fn(client, account);
  });

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
      await expect(moveCommand([], { to: "Archive" }, deps)).rejects.toThrow(
        "No UIDs provided."
      );
    });

    it("throws when UID has no prefix and no --account is set", async () => {
      const deps = makeDeps({ account: null });
      await expect(moveCommand(["12345"], { to: "Archive" }, deps)).rejects.toThrow(
        "UID \"12345\" has no account prefix"
      );
    });

    it("throws when destination folder does not exist", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await expect(
        moveCommand(["12345"], { to: "NonExistent" }, deps)
      ).rejects.toThrow('Destination folder "NonExistent" does not exist');
    });
  });

  describe("happy path", () => {
    it("moves UIDs and returns moved status", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345"], { to: "Archive" }, deps);

      expect(result.stats.moved).toBe(1);
      expect(result.stats.failed).toBe(0);
      expect(result.stats.skipped).toBe(0);
    });

    it("returns moved result entries for each UID", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345", "67890"], { to: "Archive" }, deps);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe("moved");
      expect(result.results[1].status).toBe("moved");
    });

    it("calls messageMove with comma-joined UIDs", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345", "67890"], { to: "Archive" }, deps);

      expect(deps._client.messageMove).toHaveBeenCalledWith(
        "12345,67890",
        "Archive",
        { uid: true }
      );
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
    it("skips all UIDs and returns skipped status", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345", "67890"], { to: "Archive", dryRun: true }, deps);

      expect(result.stats.skipped).toBe(2);
      expect(result.stats.moved).toBe(0);
    });

    it("does not call messageMove in dry-run mode", async () => {
      const deps = makeDeps({ account: "Test Account" });
      await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);

      expect(deps._client.messageMove).not.toHaveBeenCalled();
    });

    it("marks results with reason: dry-run", async () => {
      const deps = makeDeps({ account: "Test Account" });
      const result = await moveCommand(["12345"], { to: "Archive", dryRun: true }, deps);

      expect(result.results[0].reason).toBe("dry-run");
      expect(result.results[0].status).toBe("skipped");
    });
  });

  describe("error handling", () => {
    it("records failed status when account is not found", async () => {
      const deps = makeDeps({
        accounts: [makeAccount({ name: "Other Account" })],
        account: null,
      });
      const result = await moveCommand(["test:12345"], { to: "Archive" }, deps);

      expect(result.stats.failed).toBe(1);
      expect(result.results[0].status).toBe("failed");
      expect(result.results[0].error).toMatch(/not found/);
    });

    it("records failed status when messageMove throws", async () => {
      const failingClient = makeClient({ messageMoveShouldFail: true });
      const deps = makeDeps({
        account: "Test Account",
        forEachAccount: mock(async (accounts, fn) => {
          await fn(failingClient, makeAccount());
        }),
        listMailboxes: mock(() =>
          Promise.resolve([
            { path: "INBOX" },
            { path: "Archive" },
          ])
        ),
        _client: failingClient,
      });
      const result = await moveCommand(["12345"], { to: "Archive" }, deps);

      expect(result.stats.failed).toBe(1);
      expect(result.results[0].status).toBe("failed");
    });

    it("records failed status when source mailbox lock fails", async () => {
      const lockFailClient = {
        getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
        messageMove: mock(() => Promise.resolve()),
      };
      const deps = makeDeps({
        account: "Test Account",
        forEachAccount: mock(async (accounts, fn) => {
          await fn(lockFailClient, makeAccount());
        }),
        _client: lockFailClient,
      });
      const result = await moveCommand(["12345"], { to: "Archive" }, deps);

      expect(result.stats.failed).toBe(1);
      expect(result.results[0].status).toBe("failed");
      expect(lockFailClient.messageMove).not.toHaveBeenCalled();
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
        forEachAccount: mock(async (targetAccts, fn) => {
          callIndex++;
          if (callIndex === 1) await fn(client1, account1);
          else await fn(client2, account2);
        }),
        listMailboxes: mock(() =>
          Promise.resolve([{ path: "INBOX" }, { path: "Archive" }])
        ),
        _client: client1,
      });

      const result = await moveCommand(
        ["icloud:111", "gmail:222"],
        { to: "Archive" },
        deps
      );

      // Two forEachAccount calls — one per account
      expect(deps.forEachAccount).toHaveBeenCalledTimes(2);
      expect(result.stats.moved).toBe(2);
    });
  });
});
