import { describe, it, expect, mock } from "bun:test";
import { scanAllAccounts } from "../src/scanner.js";

/** Build a fake scan result. */
function makeResult(address, account, subject = "Invoice") {
  return { address, name: "Sender", account, subject, date: new Date(), mailbox: "INBOX", uid: 1 };
}

describe("scanAllAccounts", () => {
  it("throws when no accounts are configured", async () => {
    await expect(
      scanAllAccounts({}, {
        loadAccounts: () => [],
        forEachAccount: async () => {},
      })
    ).rejects.toThrow("No accounts configured");
  });

  it("returns results aggregated from a single account", async () => {
    const fakeResults = [
      makeResult("billing@acme.com", "test"),
      makeResult("orders@shop.com", "test"),
    ];

    const results = await scanAllAccounts({}, {
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) =>
        fn({ /* mock client */ }, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: (list) => list.map((m) => m.path),
      scanForReceipts: () => Promise.resolve(fakeResults),
    });

    expect(results.length).toBe(2);
  });

  it("aggregates results from multiple accounts", async () => {
    const accounts = [
      { name: "Personal", user: "personal@example.com" },
      { name: "Work",     user: "work@example.com" },
    ];

    let callCount = 0;
    const results = await scanAllAccounts({}, {
      loadAccounts: () => accounts,
      forEachAccount: async (_accounts, fn) => {
        for (const acct of _accounts) {
          await fn({}, acct);
        }
      },
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: (list) => list.map((m) => m.path),
      scanForReceipts: async (_client, accountName) => {
        callCount++;
        return [makeResult("billing@vendor.com", accountName)];
      },
    });

    expect(callCount).toBe(2);
    expect(results.length).toBe(2);
  });

  it("uses the provided mailboxes override instead of listing", async () => {
    const scanForReceipts = mock(() => Promise.resolve([]));

    await scanAllAccounts({ mailboxes: ["INBOX", "Archive"] }, {
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn({}, { name: "Test", user: "test@example.com" }),
      listMailboxes: mock(() => Promise.resolve([])),
      filterScanMailboxes: mock(() => []),
      scanForReceipts,
    });

    // scanForReceipts should receive the override mailboxes
    expect(scanForReceipts).toHaveBeenCalledWith(
      expect.anything(),
      "Test",
      ["INBOX", "Archive"],
      expect.anything()
    );
  });

  it("calculates the since date from the months option", async () => {
    /** @type {{ since: Date } | undefined} */
    let capturedOpts;

    await scanAllAccounts({ months: 6 }, {
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => fn({}, { name: "Test", user: "test@example.com" }),
      listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
      filterScanMailboxes: (list) => list.map((m) => m.path),
      scanForReceipts: async (_client, _name, _mailboxes, scanOpts) => {
        capturedOpts = scanOpts;
        return [];
      },
    });

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (!capturedOpts) throw new Error("scanForReceipts was not called");

    // Allow a few seconds of tolerance for test execution time
    const diff = Math.abs(capturedOpts.since.getTime() - sixMonthsAgo.getTime());
    expect(diff).toBeLessThan(5000);
  });
});
