import { describe, it, expect, mock } from "bun:test";
import { searchCommand } from "../src/search-command.js";
import { makeLock, makeAccount, makeForEachAccount, makeListMailboxes } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSearchResult(uid = 42, account = "Test Account") {
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
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(searchUids)),
    fetch: mock(async function* () {
      yield {
        uid: searchUids[0],
        envelope: {
          subject: "Test email",
          from: [{ name: "Alice", address: "alice@example.com" }],
          date: new Date("2025-01-15"),
          messageId: `<msg-${searchUids[0]}@test.com>`,
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
        "Provide a search query or use --from, --to, --subject, or --body to filter."
      );
    });

    it("does not throw when --from is provided without a query", async () => {
      const deps = makeDeps();
      await expect(searchCommand(undefined, { from: "alice@example.com" }, deps)).resolves.toBeDefined();
    });
  });

  describe("result collection", () => {
    it("returns allResults array", async () => {
      const deps = makeDeps();
      const result = await searchCommand("test", {}, deps);

      expect(result.allResults).toBeDefined();
      expect(Array.isArray(result.allResults)).toBe(true);
    });

    it("returns empty results when no messages match", async () => {
      const noResultClient = makeClient({ searchUids: [] });
      const deps = makeDeps({
        forEachAccount: mock(async (accounts, fn) => {
          await fn(noResultClient, makeAccount());
        }),
        _client: noResultClient,
      });
      const result = await searchCommand("nonexistent", {}, deps);

      expect(result.allResults).toHaveLength(0);
    });

    it("returns warnings array (possibly empty)", async () => {
      const deps = makeDeps();
      const result = await searchCommand("test", {}, deps);

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("mailbox selection", () => {
    it("uses explicit mailbox list when provided", async () => {
      const deps = makeDeps();
      await searchCommand("test", { mailbox: ["INBOX"] }, deps);

      // listMailboxes should NOT be called when explicit mailboxes are given
      expect(deps.listMailboxes).not.toHaveBeenCalled();
    });

    it("lists mailboxes and filters when no explicit mailbox given", async () => {
      const deps = makeDeps();
      await searchCommand("test", {}, deps);

      expect(deps.listMailboxes).toHaveBeenCalledTimes(1);
    });
  });

  describe("date filtering", () => {
    it("returns a warning when both --months and --since are provided", async () => {
      const deps = makeDeps();
      const result = await searchCommand("test", {
        months: "3",
        since: "2025-01-01",
      }, deps);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
