import { describe, it, expect, mock } from "bun:test";
import { searchMailbox } from "../src/search.js";
import { makeLock } from "./helpers.js";

function makeDate(str = "2025-03-01") {
  return new Date(str);
}

/** Build a minimal mock IMAP client with configurable search results. */
function makeClient({ searchUids = [1], envelopes = [] } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(searchUids)),
    fetch: mock(() => {
      async function* gen() {
        for (const env of envelopes) yield env;
      }
      return gen();
    }),
  };
}

// ── searchMailbox ─────────────────────────────────────────────────────────────

describe("searchMailbox", () => {
  it("returns an empty array when getMailboxLock throws", async () => {
    const client = {
      getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))),
    };
    const result = await searchMailbox(client, "Account", "INBOX", "receipt");
    expect(result).toHaveLength(0);
  });

  it("returns an empty array when search returns no UIDs", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    const result = await searchMailbox(client, "Account", "INBOX", "receipt");
    expect(result).toHaveLength(0);
  });

  it("searches both From and Subject when no field criteria given", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    // Override search to capture calls
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", "receipt");

    // Two calls: one for `from`, one for `subject`
    expect(client.search).toHaveBeenCalledTimes(2);
  });

  it("searches only the specified field when opts.from is provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", "query", { from: "alice@example.com" });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { from: "alice@example.com" }, { uid: true }
    );
  });

  it("searches only the specified field when opts.subject is provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", "query", { subject: "Invoice" });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { subject: "Invoice" }, { uid: true }
    );
  });

  it("deduplicates UIDs across From and Subject searches", async () => {
    // Both searches return the same UID 42
    const client = {
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      search: mock(() => Promise.resolve([42])),
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 42,
            envelope: {
              date: makeDate(),
              from: [{ address: "a@b.com", name: "A" }],
              subject: "S",
              messageId: "msg-42",
            },
          };
        }
        return gen();
      }),
    };

    const results = await searchMailbox(client, "Account", "INBOX", "receipt");
    // UID 42 from both searches should result in only one fetch range and one result
    expect(results).toHaveLength(1);
  });

  it("maps envelope fields correctly onto the result object", async () => {
    const date = makeDate("2025-06-15");
    const client = makeClient({
      searchUids: [7],
      envelopes: [{
        uid: 7,
        envelope: {
          date,
          from: [{ address: "Bill@Vendor.com", name: "Vendor Billing" }],
          subject: "Your receipt",
          messageId: "msg-7@vendor.com",
        },
      }],
    });

    const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");

    expect(result.uid).toBe(7);
    expect(result.account).toBe("MyAccount");
    expect(result.mailbox).toBe("INBOX");
    expect(result.from).toBe("Bill@Vendor.com");
    expect(result.fromName).toBe("Vendor Billing");
    expect(result.subject).toBe("Your receipt");
    expect(result.messageId).toBe("msg-7@vendor.com");
    expect(result.date).toBe(date);
  });

  it("limits results to the most recent N UIDs", async () => {
    // 20 UIDs but limit = 3 → only the last 3 fetched
    const searchUids = Array.from({ length: 20 }, (_, i) => i + 1);
    const client = makeClient({ searchUids, envelopes: [] });
    client.fetch = mock((uidRange) => {
      // Capture what range was passed
      async function* gen() {}
      return gen();
    });

    await searchMailbox(client, "Account", "INBOX", "receipt", { limit: 3 });

    // The UID range passed to fetch should contain only the last 3 UIDs
    const calls = /** @type {string[][]} */ (client.fetch.mock.calls);
    const [[range]] = calls;
    const fetchedUids = range.split(",").map(Number);
    expect(fetchedUids).toHaveLength(3);
    expect(fetchedUids).toEqual([18, 19, 20]);
  });

  // ── null/empty query tests ───────────────────────────────────────────────

  it("returns results when query is null and --from is provided", async () => {
    const client = makeClient({
      searchUids: [10],
      envelopes: [{
        uid: 10,
        envelope: {
          date: makeDate(),
          from: [{ address: "salman@example.com", name: "Salman" }],
          subject: "Hello",
          messageId: "msg-10",
        },
      }],
    });

    const results = await searchMailbox(client, "Account", "INBOX", null, { from: "salman@example.com" });

    expect(results).toHaveLength(1);
    expect(results[0].from).toBe("salman@example.com");
  });

  it("returns results when query is null and --subject is provided", async () => {
    const client = makeClient({
      searchUids: [11],
      envelopes: [{
        uid: 11,
        envelope: {
          date: makeDate(),
          from: [{ address: "billing@co.com", name: "Billing" }],
          subject: "Invoice #123",
          messageId: "msg-11",
        },
      }],
    });

    const results = await searchMailbox(client, "Account", "INBOX", null, { subject: "Invoice" });

    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe("Invoice #123");
  });

  it("uses combined criteria when query is null and both --from and --subject are provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", null, { from: "alice@example.com", subject: "Invoice" });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { from: "alice@example.com", subject: "Invoice" }, { uid: true }
    );
  });

  it("returns an empty array when query is null and no opts are provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });

    const results = await searchMailbox(client, "Account", "INBOX", null);

    expect(results).toHaveLength(0);
  });

  it("returns an empty array when query is undefined and no opts are provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });

    const results = await searchMailbox(client, "Account", "INBOX", undefined);

    expect(results).toHaveLength(0);
  });

  it("searches by criteria when query is empty string and --from is provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", "", { from: "bob@example.com" });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { from: "bob@example.com" }, { uid: true }
    );
  });

  // ── date filter tests ────────────────────────────────────────────────────

  it("passes since and before to IMAP criteria when using field filters", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    const since = new Date(2026, 0, 1);
    const before = new Date(2026, 1, 1);

    await searchMailbox(client, "Account", "INBOX", null, {
      from: "alice@example.com",
      since,
      before,
    });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { from: "alice@example.com", since, before },
      { uid: true }
    );
  });

  it("passes since and before to both From and Subject searches for general query", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    const since = new Date(2026, 0, 1);

    await searchMailbox(client, "Account", "INBOX", "invoice", { since });

    expect(client.search).toHaveBeenCalledTimes(2);
    const calls = /** @type {any[][]} */ (client.search.mock.calls);
    expect(calls[0][0]).toEqual({ from: "invoice", since });
    expect(calls[1][0]).toEqual({ subject: "invoice", since });
  });

  it("combines since with query and field criteria", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    const before = new Date(2026, 5, 1);

    await searchMailbox(client, "Account", "INBOX", "query", {
      subject: "Report",
      before,
    });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { subject: "Report", before },
      { uid: true }
    );
  });

  // ── --to filter tests ───────────────────────────────────────────────────

  it("searches by to criteria when opts.to is provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", null, { to: "bob@example.com" });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { to: "bob@example.com" }, { uid: true }
    );
  });

  it("combines --from and --to criteria in a single search", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", null, {
      from: "alice@example.com",
      to: "bob@example.com",
    });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { from: "alice@example.com", to: "bob@example.com" }, { uid: true }
    );
  });

  it("includes to and toName fields in result objects", async () => {
    const date = makeDate("2026-03-01");
    const client = makeClient({
      searchUids: [15],
      envelopes: [{
        uid: 15,
        envelope: {
          date,
          from: [{ address: "alice@example.com", name: "Alice" }],
          to: [{ address: "bob@example.com", name: "Bob" }],
          subject: "Test",
          messageId: "msg-15",
        },
      }],
    });

    const [result] = await searchMailbox(client, "Account", "INBOX", "Test");

    expect(result.to).toBe("bob@example.com");
    expect(result.toName).toBe("Bob");
  });

  it("uses field criteria path when query and --to are both provided", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    await searchMailbox(client, "Account", "INBOX", "keyword", { to: "bob@example.com" });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { to: "bob@example.com" }, { uid: true }
    );
  });

  it("combines --to with date filtering", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));

    const since = new Date(2026, 2, 1);

    await searchMailbox(client, "Account", "INBOX", null, {
      to: "bob@example.com",
      since,
    });

    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { to: "bob@example.com", since }, { uid: true }
    );
  });

  it("releases the mailbox lock after completing the search", async () => {
    const lock = makeLock();
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      fetch: mock(() => (async function*() {})()),
    };

    await searchMailbox(client, "Account", "INBOX", "receipt");

    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});
