import { describe, expect, it, mock } from "bun:test";
import { aggregateBySender, scanAllAccounts } from "../src/scanner.js";

/** Build a fake scan result. */
function makeResult(address, account, subject = "Invoice", date = new Date()) {
  return { address, name: "Sender", account, subject, date, mailbox: "INBOX", uid: 1 };
}

describe("scanAllAccounts", () => {
  it("throws when no accounts are configured", async () => {
    await expect(
      scanAllAccounts(
        {},
        {
          loadAccounts: () => [],
          forEachAccount: async () => {},
        },
      ),
    ).rejects.toThrow("No accounts configured");
  });

  it("returns results aggregated from a single account", async () => {
    const fakeResults = [makeResult("billing@acme.com", "test"), makeResult("orders@shop.com", "test")];

    const results = await scanAllAccounts(
      {},
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) =>
          fn(
            {
              /* mock client */
            },
            { name: "Test", user: "test@example.com" },
          ),
        listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
        filterScanMailboxes: (list) => list.map((m) => m.path),
        scanForReceipts: () => Promise.resolve({ results: fakeResults, failures: [] }),
      },
    );

    expect(results.length).toBe(2);
  });

  describe("aggregates results from multiple accounts", () => {
    const accounts = [
      { name: "Personal", user: "personal@example.com" },
      { name: "Work", user: "work@example.com" },
    ];

    let callCount = 0;
    let results;

    // Computed once at describe scope — mirrors the canonical pattern
    const scanPromise = scanAllAccounts(
      {},
      {
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
          return { results: [makeResult("billing@vendor.com", accountName)], failures: [] };
        },
      },
    ).then((r) => {
      results = r;
    });

    it("calls scanForReceipts once per account", async () => {
      await scanPromise;
      expect(callCount).toBe(2);
    });

    it("collects one result per account", async () => {
      await scanPromise;
      expect(results.length).toBe(2);
    });
  });

  it("uses the provided mailboxes override instead of listing", async () => {
    const scanForReceipts = mock(() => Promise.resolve({ results: [], failures: [] }));

    await scanAllAccounts(
      { mailboxes: ["INBOX", "Archive"] },
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn({}, { name: "Test", user: "test@example.com" }),
        listMailboxes: mock(() => Promise.resolve([])),
        filterScanMailboxes: mock(() => []),
        scanForReceipts,
      },
    );

    // scanForReceipts should receive the override mailboxes
    expect(scanForReceipts).toHaveBeenCalledWith(expect.anything(), "Test", ["INBOX", "Archive"], expect.anything());
  });

  it("calculates the since date from the months option", async () => {
    /** @type {{ since: Date } | undefined} */
    let capturedOpts;

    await scanAllAccounts(
      { months: 6 },
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn({}, { name: "Test", user: "test@example.com" }),
        listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
        filterScanMailboxes: (list) => list.map((m) => m.path),
        scanForReceipts: async (_client, _name, _mailboxes, scanOpts) => {
          capturedOpts = scanOpts;
          return { results: [], failures: [] };
        },
      },
    );

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    // since is normalized to local midnight by monthsAgo()
    const expectedSince = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), sixMonthsAgo.getDate());

    if (!capturedOpts) throw new Error("scanForReceipts was not called");

    expect(capturedOpts.since.getTime()).toBe(expectedSince.getTime());
  });

  it("uses all mailboxes when allMailboxes option is true", async () => {
    const scanForReceipts = mock(() => Promise.resolve({ results: [], failures: [] }));
    const allMailboxList = [
      { path: "INBOX", specialUse: null, flags: new Set() },
      { path: "Archive", specialUse: null, flags: new Set() },
      { path: "Trash", specialUse: "\\Trash", flags: new Set() },
    ];

    await scanAllAccounts(
      { allMailboxes: true },
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn({}, { name: "Test", user: "test@example.com" }),
        listMailboxes: () => Promise.resolve(allMailboxList),
        filterScanMailboxes: mock(() => []),
        scanForReceipts,
      },
    );

    // Should receive all three mailboxes, not just the filtered set
    expect(scanForReceipts).toHaveBeenCalledWith(
      expect.anything(),
      "Test",
      ["INBOX", "Archive", "Trash"],
      expect.anything(),
    );
  });
});

// ── aggregateBySender ─────────────────────────────────────────────────────────

describe("aggregateBySender", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateBySender([])).toEqual([]);
  });

  describe("returns a single sender entry for a single result", () => {
    const results = [
      {
        address: "billing@acme.com",
        name: "Acme Billing",
        account: "personal",
        subject: "Your receipt",
        date: new Date("2025-01-01"),
      },
    ];
    const senders = aggregateBySender(results);

    it("has one sender", () => {
      expect(senders.length).toBe(1);
    });

    it("sender address is correct", () => {
      expect(senders[0].address).toBe("billing@acme.com");
    });

    it("sender count is 1", () => {
      expect(senders[0].count).toBe(1);
    });
  });

  describe("aggregates multiple results from the same address into one entry", () => {
    const results = [
      {
        address: "billing@acme.com",
        name: "Acme",
        account: "work",
        subject: "Invoice 1",
        date: new Date("2025-01-01"),
      },
      {
        address: "billing@acme.com",
        name: "Acme",
        account: "work",
        subject: "Invoice 2",
        date: new Date("2025-02-01"),
      },
    ];
    const senders = aggregateBySender(results);

    it("collapses to one sender entry", () => {
      expect(senders.length).toBe(1);
    });

    it("count reflects both results", () => {
      expect(senders[0].count).toBe(2);
    });
  });

  describe("collects unique accounts across results for the same sender", () => {
    const results = [
      { address: "billing@acme.com", name: "Acme", account: "personal", subject: "Inv1", date: new Date() },
      { address: "billing@acme.com", name: "Acme", account: "work", subject: "Inv2", date: new Date() },
    ];
    const senders = aggregateBySender(results);

    it("accounts includes personal", () => {
      expect(senders[0].accounts).toContain("personal");
    });

    it("accounts includes work", () => {
      expect(senders[0].accounts).toContain("work");
    });
  });

  it("caps sampleSubjects at 3 entries", () => {
    const results = Array.from({ length: 5 }, (_, i) => ({
      address: "billing@acme.com",
      name: "Acme",
      account: "personal",
      subject: `Invoice ${i + 1}`,
      date: new Date(),
    }));
    const senders = aggregateBySender(results);
    expect(senders[0].sampleSubjects.length).toBeLessThanOrEqual(3);
  });

  it("tracks the latest date across results for the same sender", () => {
    const earlier = new Date("2025-01-01");
    const later = new Date("2025-06-15");
    const results = [
      { address: "billing@acme.com", name: "Acme", account: "work", subject: "Old", date: earlier },
      { address: "billing@acme.com", name: "Acme", account: "work", subject: "New", date: later },
    ];
    const senders = aggregateBySender(results);
    expect(senders[0].latestDate).toEqual(later);
  });

  it("updates sender name to match most recent result", () => {
    const results = [
      { address: "billing@acme.com", name: "Acme Old", account: "work", subject: "Old", date: new Date("2025-01-01") },
      { address: "billing@acme.com", name: "Acme New", account: "work", subject: "New", date: new Date("2025-06-01") },
    ];
    const senders = aggregateBySender(results);
    expect(senders[0].name).toBe("Acme New");
  });

  describe("sorts senders by count descending", () => {
    const results = [
      { address: "rare@example.com", name: "Rare", account: "a", subject: "S1", date: new Date() },
      { address: "common@example.com", name: "Common", account: "a", subject: "S2", date: new Date() },
      { address: "common@example.com", name: "Common", account: "a", subject: "S3", date: new Date() },
      { address: "common@example.com", name: "Common", account: "a", subject: "S4", date: new Date() },
    ];
    const senders = aggregateBySender(results);

    it("first sender is the common one", () => {
      expect(senders[0].address).toBe("common@example.com");
    });

    it("second sender is the rare one", () => {
      expect(senders[1].address).toBe("rare@example.com");
    });
  });

  describe("returns arrays (not Sets) in the output objects", () => {
    const results = [{ address: "billing@acme.com", name: "Acme", account: "work", subject: "Inv", date: new Date() }];
    const senders = aggregateBySender(results);

    it("accounts is an Array", () => {
      expect(Array.isArray(senders[0].accounts)).toBe(true);
    });

    it("sampleSubjects is an Array", () => {
      expect(Array.isArray(senders[0].sampleSubjects)).toBe(true);
    });
  });
});
