import { describe, expect, it, mock } from "bun:test";
import { searchMailbox } from "../src/search.js";
import { makeLock } from "./helpers.js";

function makeDate(str = "2025-03-01") {
  return new Date(str);
}

/**
 * Build a minimal mock IMAP client with configurable search results.
 * @param {{ searchUids?: number[], envelopes?: object[] }} [opts]
 */
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

  it("emits mailbox-lock-failed when getMailboxLock throws", async () => {
    const error = new Error("no such mailbox");
    const client = { getMailboxLock: mock(() => Promise.reject(error)) };
    const onProgress = mock(() => {});

    await searchMailbox(client, "Account", "INBOX", "receipt", { onProgress });

    expect(onProgress).toHaveBeenCalledWith({
      type: "mailbox-lock-failed",
      severity: "error",
      mailbox: "INBOX",
      error,
    });
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

  describe("searches only the From field when opts.from is provided", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", "query", { from: "alice@example.com" });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with the from criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ from: "alice@example.com" }, { uid: true });
    });
  });

  describe("searches only the Subject field when opts.subject is provided", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", "query", { subject: "Invoice" });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with the subject criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ subject: "Invoice" }, { uid: true });
    });
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

  describe("maps envelope fields correctly onto the result object", () => {
    const date = makeDate("2025-06-15");
    const client = makeClient({
      searchUids: [7],
      envelopes: [
        {
          uid: 7,
          envelope: {
            date,
            from: [{ address: "Bill@Vendor.com", name: "Vendor Billing" }],
            subject: "Your receipt",
            messageId: "msg-7@vendor.com",
          },
        },
      ],
    });

    it("sets uid", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.uid).toBe(7);
    });

    it("sets account", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.account).toBe("MyAccount");
    });

    it("sets mailbox", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.mailbox).toBe("INBOX");
    });

    it("sets from", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.from).toBe("Bill@Vendor.com");
    });

    it("sets fromName", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.fromName).toBe("Vendor Billing");
    });

    it("sets subject", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.subject).toBe("Your receipt");
    });

    it("sets messageId", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.messageId).toBe("msg-7@vendor.com");
    });

    it("sets date", async () => {
      const [result] = await searchMailbox(client, "MyAccount", "INBOX", "receipt");
      expect(result.date).toBe(date);
    });
  });

  describe("limits results to the most recent N UIDs", () => {
    const searchUids = Array.from({ length: 20 }, (_, i) => i + 1);
    const client = makeClient({ searchUids, envelopes: [] });
    client.fetch = mock((_uidRange) => {
      // Capture what range was passed
      async function* gen() {}
      return gen();
    });
    let fetchedUids;
    const setup = async () => {
      if (!fetchedUids) {
        await searchMailbox(client, "Account", "INBOX", "receipt", { limit: 3 });
        const calls = /** @type {string[][]} */ (client.fetch.mock.calls);
        const [[range]] = calls;
        fetchedUids = range.split(",").map(Number);
      }
    };

    it("passes only 3 UIDs to fetch", async () => {
      await setup();
      expect(fetchedUids).toHaveLength(3);
    });

    it("passes the last 3 UIDs to fetch", async () => {
      await setup();
      expect(fetchedUids).toEqual([18, 19, 20]);
    });
  });

  // ── null/empty query tests ───────────────────────────────────────────────

  describe("returns results when query is null and --from is provided", () => {
    const client = makeClient({
      searchUids: [10],
      envelopes: [
        {
          uid: 10,
          envelope: {
            date: makeDate(),
            from: [{ address: "salman@example.com", name: "Salman" }],
            subject: "Hello",
            messageId: "msg-10",
          },
        },
      ],
    });
    let results;
    const setup = async () => {
      if (!results) {
        results = await searchMailbox(client, "Account", "INBOX", null, { from: "salman@example.com" });
      }
    };

    it("returns one result", async () => {
      await setup();
      expect(results).toHaveLength(1);
    });

    it("maps the from address correctly", async () => {
      await setup();
      expect(results[0].from).toBe("salman@example.com");
    });
  });

  describe("returns results when query is null and --subject is provided", () => {
    const client = makeClient({
      searchUids: [11],
      envelopes: [
        {
          uid: 11,
          envelope: {
            date: makeDate(),
            from: [{ address: "billing@co.com", name: "Billing" }],
            subject: "Invoice #123",
            messageId: "msg-11",
          },
        },
      ],
    });
    let results;
    const setup = async () => {
      if (!results) {
        results = await searchMailbox(client, "Account", "INBOX", null, { subject: "Invoice" });
      }
    };

    it("returns one result", async () => {
      await setup();
      expect(results).toHaveLength(1);
    });

    it("maps the subject correctly", async () => {
      await setup();
      expect(results[0].subject).toBe("Invoice #123");
    });
  });

  describe("uses combined criteria when query is null and both --from and --subject are provided", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", null, { from: "alice@example.com", subject: "Invoice" });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with combined from and subject criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ from: "alice@example.com", subject: "Invoice" }, { uid: true });
    });
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

  describe("searches by criteria when query is empty string and --from is provided", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", "", { from: "bob@example.com" });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with the from criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ from: "bob@example.com" }, { uid: true });
    });
  });

  // ── date filter tests ────────────────────────────────────────────────────────

  describe("passes since and before to IMAP criteria when using field filters", () => {
    const since = new Date(2026, 0, 1);
    const before = new Date(2026, 1, 1);
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", null, { from: "alice@example.com", since, before });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with from, since and before criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ from: "alice@example.com", since, before }, { uid: true });
    });
  });

  describe("passes since and before to both From and Subject searches for general query", () => {
    const since = new Date(2026, 0, 1);
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let calls;
    const setup = async () => {
      if (!calls) {
        await searchMailbox(client, "Account", "INBOX", "invoice", { since });
        calls = /** @type {any[][]} */ (client.search.mock.calls);
      }
    };

    it("calls search twice (from and subject)", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(2);
    });

    it("passes since to the from search", async () => {
      await setup();
      expect(calls[0][0]).toEqual({ from: "invoice", since });
    });

    it("passes since to the subject search", async () => {
      await setup();
      expect(calls[1][0]).toEqual({ subject: "invoice", since });
    });
  });

  describe("combines since with query and field criteria", () => {
    const before = new Date(2026, 5, 1);
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", "query", { subject: "Report", before });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with subject and before criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ subject: "Report", before }, { uid: true });
    });
  });

  // ── --to filter tests ───────────────────────────────────────────────────────

  describe("searches by to criteria when opts.to is provided", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", null, { to: "bob@example.com" });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with the to criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ to: "bob@example.com" }, { uid: true });
    });
  });

  describe("combines --from and --to criteria in a single search", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", null, {
          from: "alice@example.com",
          to: "bob@example.com",
        });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with combined from and to criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ from: "alice@example.com", to: "bob@example.com" }, { uid: true });
    });
  });

  describe("includes to and toName fields in result objects", () => {
    const date = makeDate("2026-03-01");
    const client = makeClient({
      searchUids: [15],
      envelopes: [
        {
          uid: 15,
          envelope: {
            date,
            from: [{ address: "alice@example.com", name: "Alice" }],
            to: [{ address: "bob@example.com", name: "Bob" }],
            subject: "Test",
            messageId: "msg-15",
          },
        },
      ],
    });

    it("sets to address", async () => {
      const [result] = await searchMailbox(client, "Account", "INBOX", "Test");
      expect(result.to).toBe("bob@example.com");
    });

    it("sets toName", async () => {
      const [result] = await searchMailbox(client, "Account", "INBOX", "Test");
      expect(result.toName).toBe("Bob");
    });
  });

  describe("uses field criteria path when query and --to are both provided", () => {
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", "keyword", { to: "bob@example.com" });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with the to criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ to: "bob@example.com" }, { uid: true });
    });
  });

  describe("combines --to with date filtering", () => {
    const since = new Date(2026, 2, 1);
    const client = makeClient({ searchUids: [], envelopes: [] });
    client.search = mock(() => Promise.resolve([]));
    let searchCalled = false;
    const setup = async () => {
      if (!searchCalled) {
        searchCalled = true;
        await searchMailbox(client, "Account", "INBOX", null, { to: "bob@example.com", since });
      }
    };

    it("calls search exactly once", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    it("calls search with to and since criteria", async () => {
      await setup();
      expect(client.search).toHaveBeenCalledWith({ to: "bob@example.com", since }, { uid: true });
    });
  });

  it("releases the mailbox lock after completing the search", async () => {
    const lock = makeLock();
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      fetch: mock(() => (async function* () {})()),
    };

    await searchMailbox(client, "Account", "INBOX", "receipt");

    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});
