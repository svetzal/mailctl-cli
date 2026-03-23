import { describe, it, expect, mock } from "bun:test";
import { sortReceipts } from "../src/sorter.js";
import { makeLock } from "./helpers.js";

/** Minimal mock IMAP client for sorter tests. */
function makeMockClient() {
  return {
    mailboxOpen:    mock(() => Promise.resolve()),
    mailboxClose:   mock(() => Promise.resolve()),
    mailboxCreate:  mock(() => Promise.reject(new Error("already exists"))),
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    messageMove:    mock(() => Promise.resolve()),
    mailbox:        { exists: 0 },
  };
}

/** Build a fake receipt scan result. */
function makeMsg(uid, address, mailbox = "INBOX") {
  return { uid, address, name: "Sender", mailbox, date: new Date(), subject: "Receipt" };
}

describe("sortReceipts", () => {
  it("throws when no accounts are configured", async () => {
    await expect(
      sortReceipts({}, {
        loadClassifications: () => ({}),
        loadAccounts: () => [],
        forEachAccount: async () => {},
      })
    ).rejects.toThrow("No accounts configured");
  });

  it("moves a business-classified message to Receipts/Business", async () => {
    const client = makeMockClient();

    await sortReceipts({}, {
      loadClassifications: () => ({ "billing@vendor.com": "business" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve([makeMsg(1, "billing@vendor.com")]),
    });

    expect(client.messageMove).toHaveBeenCalledTimes(1);
    expect(client.messageMove).toHaveBeenCalledWith(
      expect.stringContaining("1"),
      "Receipts/Business",
      { uid: true }
    );
  });

  it("moves a personal-classified message to Receipts/Personal", async () => {
    const client = makeMockClient();

    await sortReceipts({}, {
      loadClassifications: () => ({ "family@home.com": "personal" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve([makeMsg(2, "family@home.com")]),
    });

    expect(client.messageMove).toHaveBeenCalledTimes(1);
    expect(client.messageMove).toHaveBeenCalledWith(
      expect.anything(),
      "Receipts/Personal",
      { uid: true }
    );
  });

  it("counts unclassified messages in stats and routes them to personal", async () => {
    const client = makeMockClient();

    const stats = await sortReceipts({}, {
      loadClassifications: () => ({}), // no classifications
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve([makeMsg(3, "unknown@example.com")]),
    });

    expect(stats.unclassified).toBe(1);
    expect(client.messageMove).toHaveBeenCalledWith(
      expect.anything(),
      "Receipts/Personal",
      { uid: true }
    );
  });

  it("does not call messageMove in dry-run mode", async () => {
    const client = makeMockClient();

    await sortReceipts({ dryRun: true }, {
      loadClassifications: () => ({ "billing@vendor.com": "business" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve([makeMsg(4, "billing@vendor.com")]),
    });

    expect(client.messageMove).not.toHaveBeenCalled();
  });

  it("increments skipped when messageMove throws", async () => {
    const client = makeMockClient();
    client.messageMove = mock(() => Promise.reject(new Error("IMAP error")));

    const stats = await sortReceipts({}, {
      loadClassifications: () => ({ "billing@vendor.com": "business" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: () => ["INBOX"],
      scanForReceipts: () => Promise.resolve([makeMsg(5, "billing@vendor.com")]),
    });

    expect(stats.skipped).toBeGreaterThan(0);
    expect(stats.moved).toBe(0);
  });

  it("moves messages from two mailboxes in one account", async () => {
    const client = makeMockClient();

    await sortReceipts({}, {
      loadClassifications: () => ({ "billing@vendor.com": "business" }),
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([
        { path: "INBOX",   specialUse: null, flags: new Set() },
        { path: "Archive", specialUse: null, flags: new Set() },
      ]),
      filterScanMailboxes: () => ["INBOX", "Archive"],
      scanForReceipts: () => Promise.resolve([
        makeMsg(10, "billing@vendor.com", "INBOX"),
        makeMsg(11, "billing@vendor.com", "Archive"),
      ]),
    });

    // Two separate mailbox locks → two messageMove calls (one per mailbox)
    expect(client.messageMove).toHaveBeenCalledTimes(2);
  });
});
