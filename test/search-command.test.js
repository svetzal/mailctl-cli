import { describe, expect, it, mock } from "bun:test";
import { searchCommand } from "../src/commands/search-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function _makeSearchResult(uid = 42, account = "Test Account") {
  return {
    uid,
    account,
    subject: "Test email",
    from: "alice@example.com",
    date: new Date("2025-01-15"),
    messageId: `<msg-${uid}@test.com>`,
  };
}

function makeClient({ searchUids = [42] } = {}) {
  let currentMailbox = null;
  return {
    getMailboxLock: mock((mailbox) => {
      currentMailbox = mailbox;
      return Promise.resolve(makeLock());
    }),
    search: mock(() => Promise.resolve(searchUids)),
    fetch: mock(async function* () {
      const uid = searchUids[0];
      yield {
        uid,
        envelope: {
          subject: "Test email",
          from: [{ name: "Alice", address: "alice@example.com" }],
          date: new Date("2025-01-15"),
          messageId: `<msg-${uid}-${currentMailbox}@test.com>`,
        },
      };
    }),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const client = makeClient();

  const forEachAccount = makeForEachAccount(client, account);
  const listMailboxes = makeListMailboxes();

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    _client: client,
    ...overrides,
  };
}

// ── searchCommand ──────────────────────────────────────────────────────────────

describe("searchCommand", () => {
  describe("input validation", () => {
    it("throws when no query or field criteria provided", async () => {
      const deps = makeDeps();
      await expect(searchCommand(undefined, {}, deps)).rejects.toThrow(
        "Provide a search query or use --from, --to, --subject, or --body to filter.",
      );
    });

    it("does not throw when --from is provided without a query", async () => {
      const deps = makeDeps();
      await expect(searchCommand(undefined, { from: "alice@example.com" }, deps)).resolves.toBeDefined();
    });
  });

  describe("result collection", () => {
    it("returns allResults as a defined array", async () => {
      const deps = makeDeps();
      const result = await searchCommand("test", {}, deps);

      expect(Array.isArray(result.allResults)).toBe(true);
    });

    it("returns empty results when no messages match", async () => {
      const noResultClient = makeClient({ searchUids: [] });
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(noResultClient, makeAccount());
        }),
        _client: noResultClient,
      });
      const result = await searchCommand("nonexistent", {}, deps);

      expect(result.allResults).toHaveLength(0);
    });

    it("returns warnings as a defined array", async () => {
      const deps = makeDeps();
      const result = await searchCommand("test", {}, deps);

      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("returns empty allResults and a populated accountFailures list when every account fails to connect", async () => {
      const deps = makeDeps({
        forEachAccount: mock(async () => ({
          accountFailures: [{ account: "Test Account", error: "connect refused" }],
        })),
      });
      const result = await searchCommand("test", {}, deps);

      expect(result.allResults).toHaveLength(0);
      expect(result.accountFailures).toHaveLength(1);
    });
  });

  describe("mailbox selection", () => {
    it("uses explicit mailbox list when provided", async () => {
      const deps = makeDeps({ listMailboxes: makeListMailboxes([{ path: "Sent" }]) });
      const result = await searchCommand("test", { mailbox: ["INBOX"] }, deps);

      expect(result.allResults.map((r) => r.mailbox)).toEqual(["INBOX"]);
    });

    it("lists mailboxes and filters when no explicit mailbox given", async () => {
      const deps = makeDeps();
      const result = await searchCommand("test", {}, deps);

      expect(result.allResults.map((r) => r.mailbox).sort()).toEqual(["INBOX", "Sent"]);
    });
  });

  describe("date filtering", () => {
    it("returns a warning when both --months and --since are provided", async () => {
      const deps = makeDeps();
      const result = await searchCommand(
        "test",
        {
          months: "3",
          since: "2025-01-01",
        },
        deps,
      );

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
