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

    it("throws when account prefix is not found", async () => {
      const deps = makeDeps({ accounts: [makeAccount({ name: "Other" })] });
      await expect(flagCommand(["test:42"], { read: true }, deps)).rejects.toThrow('Account "test" not found.');
    });
  });

  describe("happy path", () => {
    describe("applies flags and returns result with account and mailbox", () => {
      it("returns one result", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);
        expect(results).toHaveLength(1);
      });

      it("result has correct account", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);
        expect(results[0].account).toBe("Test Account");
      });

      it("result has correct mailbox", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);
        expect(results[0].mailbox).toBe("INBOX");
      });
    });

    describe("marks \\Seen as added for --read", () => {
      it("added contains \\Seen", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);
        expect(results[0].added).toContain("\\Seen");
      });

      it("removed is empty", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);
        expect(results[0].removed).toHaveLength(0);
      });
    });

    describe("marks \\Seen as removed for --unread", () => {
      it("removed contains \\Seen", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { unread: true, mailbox: "INBOX" }, deps);
        expect(results[0].removed).toContain("\\Seen");
      });

      it("added is empty", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { unread: true, mailbox: "INBOX" }, deps);
        expect(results[0].added).toHaveLength(0);
      });
    });

    it("marks \\Flagged as added for --star", async () => {
      const deps = makeDeps();
      const results = await flagCommand(["42"], { star: true, mailbox: "INBOX" }, deps);

      expect(results[0].added).toContain("\\Flagged");
    });

    describe("includes UIDs as numbers in result", () => {
      it("result uids contains 42", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42", "99"], { read: true, mailbox: "INBOX" }, deps);
        expect(results[0].uids).toContain(42);
      });

      it("result uids contains 99", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42", "99"], { read: true, mailbox: "INBOX" }, deps);
        expect(results[0].uids).toContain(99);
      });
    });

    it("calls messageFlagsAdd on the client", async () => {
      const deps = makeDeps();
      await flagCommand(["42"], { read: true, mailbox: "INBOX" }, deps);

      expect(deps._client.messageFlagsAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe("dry-run", () => {
    describe("returns dryRun: true without calling messageFlagsAdd", () => {
      it("result has dryRun: true", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { read: true, mailbox: "INBOX", dryRun: true }, deps);
        expect(results[0].dryRun).toBe(true);
      });

      it("does not call messageFlagsAdd", async () => {
        const deps = makeDeps();
        await flagCommand(["42"], { read: true, mailbox: "INBOX", dryRun: true }, deps);
        expect(deps._client.messageFlagsAdd).not.toHaveBeenCalled();
      });
    });

    describe("returns what would be added in dry-run result", () => {
      it("added contains \\Flagged", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { star: true, mailbox: "INBOX", dryRun: true }, deps);
        expect(results[0].added).toContain("\\Flagged");
      });

      it("removed is empty", async () => {
        const deps = makeDeps();
        const results = await flagCommand(["42"], { star: true, mailbox: "INBOX", dryRun: true }, deps);
        expect(results[0].removed).toHaveLength(0);
      });
    });
  });

  describe("mailbox detection", () => {
    it("auto-detects mailbox when --mailbox is not provided", async () => {
      const deps = makeDeps();
      const results = await flagCommand(["42"], { read: true }, deps);

      // detectMailbox tries INBOX first and finds the UID there
      expect(results[0].mailbox).toBe("INBOX");
    });

    it("throws when UID not found in any mailbox during auto-detection", async () => {
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

      await expect(flagCommand(["42"], { read: true }, deps)).rejects.toThrow("UID 42 not found in any mailbox");
    });
  });
});
