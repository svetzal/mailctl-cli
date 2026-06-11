import { describe, expect, it, mock } from "bun:test";
import { sortReceipts } from "../src/sorter.js";
import { makeLock } from "./helpers.js";

/** Minimal mock IMAP client for sorter tests. */
function makeMockClient() {
  return {
    mailboxOpen: mock(() => Promise.resolve()),
    mailboxClose: mock(() => Promise.resolve()),
    mailboxCreate: mock(() => Promise.reject(new Error("already exists"))),
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    messageMove: mock(() => Promise.resolve()),
    mailbox: { exists: 0 },
  };
}

/** Build a fake receipt scan result. */
function makeMsg(uid, address, mailbox = "INBOX") {
  return { uid, address, name: "Sender", mailbox, date: new Date(), subject: "Receipt" };
}

describe("sortReceipts", () => {
  it("throws when no accounts are configured", async () => {
    await expect(
      sortReceipts(
        {},
        {
          loadClassifications: () => ({}),
          loadAccounts: () => [],
          forEachAccount: async () => {},
        },
      ),
    ).rejects.toThrow("No accounts configured");
  });

  describe("moves a business-classified message to Receipts/Business", () => {
    const client = makeMockClient();
    const deps = {
      loadClassifications: () => ({ "billing@vendor.com": "business" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve({ results: [makeMsg(1, "billing@vendor.com")], failures: [] }),
    };

    it("calls messageMove exactly once", async () => {
      await sortReceipts({}, deps);
      expect(client.messageMove).toHaveBeenCalledTimes(1);
    });

    it("calls messageMove with the correct destination folder", async () => {
      expect(client.messageMove).toHaveBeenCalledWith(expect.stringContaining("1"), "Receipts/Business", { uid: true });
    });
  });

  it("moves a personal-classified message to Receipts/Personal", async () => {
    const client = makeMockClient();

    await sortReceipts(
      {},
      {
        loadClassifications: () => ({ "family@home.com": "personal" }),
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
        listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
        filterScanMailboxes: () => ["INBOX"],
        scanForReceipts: () => Promise.resolve({ results: [makeMsg(2, "family@home.com")], failures: [] }),
      },
    );

    expect(client.messageMove).toHaveBeenCalledWith(expect.anything(), "Receipts/Personal", { uid: true });
  });

  describe("counts unclassified messages in stats and routes them to personal", () => {
    let client;
    let stats;
    const deps = () => {
      client = makeMockClient();
      return {
        loadClassifications: () => ({}), // no classifications
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
        listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
        filterScanMailboxes: () => ["INBOX"],
        scanForReceipts: () => Promise.resolve({ results: [makeMsg(3, "unknown@example.com")], failures: [] }),
      };
    };

    it("reports unclassified count of 1 in stats", async () => {
      stats = await sortReceipts({}, deps());
      expect(stats.unclassified).toBe(1);
    });

    it("routes unclassified messages to Receipts/Personal", async () => {
      await sortReceipts({}, deps());
      expect(client.messageMove).toHaveBeenCalledWith(expect.anything(), "Receipts/Personal", { uid: true });
    });
  });

  it("does not call messageMove in dry-run mode", async () => {
    const client = makeMockClient();

    await sortReceipts(
      { dryRun: true },
      {
        loadClassifications: () => ({ "billing@vendor.com": "business" }),
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
        listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
        filterScanMailboxes: () => ["INBOX"],
        scanForReceipts: () => Promise.resolve({ results: [makeMsg(4, "billing@vendor.com")], failures: [] }),
      },
    );

    expect(client.messageMove).not.toHaveBeenCalled();
  });

  describe("increments skipped when messageMove throws", () => {
    const makeErrorClient = () => {
      const c = makeMockClient();
      c.messageMove = mock(() => Promise.reject(new Error("IMAP error")));
      return c;
    };
    const makeDeps = (client) => ({
      loadClassifications: () => ({ "billing@vendor.com": "business" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve({ results: [makeMsg(5, "billing@vendor.com")], failures: [] }),
    });

    it("reports skipped count greater than 0", async () => {
      const stats = await sortReceipts({}, makeDeps(makeErrorClient()));
      expect(stats.skipped).toBeGreaterThan(0);
    });

    it("reports moved count of 0", async () => {
      const stats = await sortReceipts({}, makeDeps(makeErrorClient()));
      expect(stats.moved).toBe(0);
    });
  });

  it("moves messages from two mailboxes in one account", async () => {
    const client = makeMockClient();

    await sortReceipts(
      {},
      {
        loadClassifications: () => ({ "billing@vendor.com": "business" }),
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
        listMailboxes: () =>
          Promise.resolve([
            { path: "INBOX", specialUse: null, flags: new Set() },
            { path: "Archive", specialUse: null, flags: new Set() },
          ]),
        filterScanMailboxes: () => ["INBOX", "Archive"],
        scanForReceipts: () =>
          Promise.resolve({
            results: [makeMsg(10, "billing@vendor.com", "INBOX"), makeMsg(11, "billing@vendor.com", "Archive")],
            failures: [],
          }),
      },
    );

    // Two separate mailbox locks → two messageMove calls (one per mailbox)
    expect(client.messageMove).toHaveBeenCalledTimes(2);
  });

  describe("emits move-error with severity: error when messageMove throws", () => {
    it("emits a move-error event", async () => {
      const client = makeMockClient();
      client.messageMove = mock(() => Promise.reject(new Error("IMAP error")));

      const events = [];
      await sortReceipts(
        {},
        {
          loadClassifications: () => ({ "billing@vendor.com": "business" }),
          loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
          forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
          listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
          filterScanMailboxes: () => ["INBOX"],
          scanForReceipts: () => Promise.resolve({ results: [makeMsg(5, "billing@vendor.com")], failures: [] }),
        },
        (e) => events.push(e),
      );

      const event = events.find((e) => e.type === "move-error");
      expect(event).toBeDefined();
    });

    it("move-error event has severity: error", async () => {
      const client = makeMockClient();
      client.messageMove = mock(() => Promise.reject(new Error("IMAP error")));

      const events = [];
      await sortReceipts(
        {},
        {
          loadClassifications: () => ({ "billing@vendor.com": "business" }),
          loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
          forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
          listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
          filterScanMailboxes: () => ["INBOX"],
          scanForReceipts: () => Promise.resolve({ results: [makeMsg(5, "billing@vendor.com")], failures: [] }),
        },
        (e) => events.push(e),
      );

      const event = events.find((e) => e.type === "move-error");
      expect(event.severity).toBe("error");
    });
  });

  describe("emits folder-error with severity: error when mailboxCreate throws after mailboxOpen fails", () => {
    it("emits a folder-error event", async () => {
      const client = makeMockClient();
      // mailboxOpen throws (folder not found) and mailboxCreate also throws
      client.mailboxOpen = mock(() => Promise.reject(new Error("no such folder")));
      client.mailboxCreate = mock(() => Promise.reject(new Error("create failed")));

      const events = [];
      await sortReceipts(
        {},
        {
          loadClassifications: () => ({ "billing@vendor.com": "business" }),
          loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
          forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
          listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
          filterScanMailboxes: () => ["INBOX"],
          scanForReceipts: () => Promise.resolve({ results: [makeMsg(6, "billing@vendor.com")], failures: [] }),
        },
        (e) => events.push(e),
      );

      const event = events.find((e) => e.type === "folder-error");
      expect(event).toBeDefined();
    });

    it("folder-error event has severity: error", async () => {
      const client = makeMockClient();
      client.mailboxOpen = mock(() => Promise.reject(new Error("no such folder")));
      client.mailboxCreate = mock(() => Promise.reject(new Error("create failed")));

      const events = [];
      await sortReceipts(
        {},
        {
          loadClassifications: () => ({ "billing@vendor.com": "business" }),
          loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
          forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
          listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
          filterScanMailboxes: () => ["INBOX"],
          scanForReceipts: () => Promise.resolve({ results: [makeMsg(6, "billing@vendor.com")], failures: [] }),
        },
        (e) => events.push(e),
      );

      const event = events.find((e) => e.type === "folder-error");
      expect(event.severity).toBe("error");
    });
  });
});
