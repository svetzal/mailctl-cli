import { describe, expect, it, mock } from "bun:test";
import { searchAccountForReceipts, searchMailboxForReceipts } from "../src/receipt-search-pipeline.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** @param {string} path */
function makeMailbox(path) {
  return { path, flags: new Set() };
}

function makeMsg(uid, messageId, fromAddress = "billing@acme.com", fromName = "Acme") {
  return {
    uid,
    messageId,
    account: "TestAccount",
    mailbox: "INBOX",
    date: new Date("2025-03-01"),
    fromAddress,
    fromName,
    subject: "Invoice",
  };
}

/** @param {{ mailboxes?: object[], messages?: Record<string, object[]> }} [opts] */
function makeFns({ mailboxes = [], messages = {} } = {}) {
  return {
    listMailboxes: mock(() => Promise.resolve(mailboxes)),
    searchMailboxForReceipts: mock((_client, _accountName, mbPath) => Promise.resolve(messages[mbPath] ?? [])),
  };
}

// ── searchAccountForReceipts ──────────────────────────────────────────────────

describe("searchAccountForReceipts", () => {
  it("returns empty array when no mailboxes match", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const fns = makeFns({ mailboxes: [] });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(0);
  });

  it("returns empty array when mailboxes exist but no emails found", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX")],
      messages: { INBOX: [] },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(0);
  });

  it("returns results from a single mailbox", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const msg = makeMsg(1, "msg-1@acme.com");
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX")],
      messages: { INBOX: [msg] },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe(1);
  });

  it("deduplicates results with the same message-id across mailboxes", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const msg1 = makeMsg(1, "same-id@acme.com");
    const msg2 = makeMsg(2, "same-id@acme.com"); // same message-id, different mailbox
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX"), makeMailbox("Archive")],
      messages: {
        INBOX: [msg1],
        Archive: [msg2],
      },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe(1); // first occurrence kept
  });

  it("returns results from multiple mailboxes when message-ids are unique", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const msg1 = makeMsg(1, "msg-1@acme.com");
    const msg2 = makeMsg(2, "msg-2@acme.com");
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX"), makeMailbox("Sent")],
      messages: {
        INBOX: [msg1],
        Sent: [msg2],
      },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(2);
  });

  it("passes the since date to searchMailboxForReceipts", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date("2025-01-01");
    const capturedSince = [];
    const fns = {
      listMailboxes: mock(() => Promise.resolve([makeMailbox("INBOX")])),
      searchMailboxForReceipts: mock((_c, _name, _mbPath, s) => {
        capturedSince.push(s);
        return Promise.resolve([]);
      }),
    };

    await searchAccountForReceipts(client, account, since, fns);

    expect(capturedSince[0]).toBe(since);
  });

  it("passes the account name to searchMailboxForReceipts", async () => {
    const client = {};
    const account = { name: "MyAccount" };
    const since = new Date();
    const capturedNames = [];
    const fns = {
      listMailboxes: mock(() => Promise.resolve([makeMailbox("INBOX")])),
      searchMailboxForReceipts: mock((_c, name) => {
        capturedNames.push(name);
        return Promise.resolve([]);
      }),
    };

    await searchAccountForReceipts(client, account, since, fns);

    expect(capturedNames[0]).toBe("MyAccount");
  });
});

// ── searchMailboxForReceipts ──────────────────────────────────────────────────

describe("searchMailboxForReceipts", () => {
  it("returns an empty array when getMailboxLock throws", async () => {
    const client = {
      getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))),
    };
    const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(result).toHaveLength(0);
  });

  describe("emits mailbox-lock-failed event when getMailboxLock throws", () => {
    it("emits exactly one event", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events).toHaveLength(1);
    });

    it("emits event with type mailbox-lock-failed", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events[0].type).toBe("mailbox-lock-failed");
    });

    it("emits event with the correct mailbox", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events[0].mailbox).toBe("INBOX");
    });

    it("emits event with the original error", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events[0].error).toBe(lockErr);
    });
  });

  describe("emits search-term-error and continues when a subject search throws", () => {
    function makeSearchErrClient() {
      const lock = { release: mock(() => {}) };
      const searchErr = new Error("search failed");
      const client = {
        getMailboxLock: mock(() => Promise.resolve(lock)),
        search: mock(() => Promise.reject(searchErr)),
        mailbox: { exists: 0 },
        fetch: mock(() => (async function* () {})()),
      };
      return { client, searchErr };
    }

    it("emits at least one search-term-error event", async () => {
      const { client } = makeSearchErrClient();
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      const errorEvents = events.filter((e) => e.type === "search-term-error");
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it("emits search-term-error with the correct mailbox", async () => {
      const { client } = makeSearchErrClient();
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      const errorEvents = events.filter((e) => e.type === "search-term-error");
      expect(errorEvents[0].mailbox).toBe("INBOX");
    });

    it("emits search-term-error with the original error", async () => {
      const { client, searchErr } = makeSearchErrClient();
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      const errorEvents = events.filter((e) => e.type === "search-term-error");
      expect(errorEvents[0].error).toBe(searchErr);
    });

    it("returns an empty array after error", async () => {
      const { client } = makeSearchErrClient();
      const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
      expect(result).toHaveLength(0);
    });
  });

  it("returns an empty array when no UIDs match any search term", async () => {
    const lock = { release: mock(() => {}) };
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      mailbox: { exists: 0 },
      fetch: mock(() => (async function* () {})()),
    };
    const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(result).toHaveLength(0);
  });

  describe("deduplicates UIDs across multiple search terms", () => {
    function makeDedupClient() {
      const lock = { release: mock(() => {}) };
      return {
        getMailboxLock: mock(() => Promise.resolve(lock)),
        search: mock(() => Promise.resolve([42])),
        mailbox: { exists: 1 },
        fetch: mock((_range) => {
          async function* gen() {
            yield {
              uid: 42,
              envelope: {
                date: new Date(),
                from: [{ address: "billing@acme.com", name: "Acme" }],
                subject: "Your invoice",
                messageId: "msg-42",
              },
            };
          }
          return gen();
        }),
      };
    }

    it("returns only one result despite multiple matching search terms", async () => {
      const client = makeDedupClient();
      const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
      expect(result).toHaveLength(1);
    });

    it("returns the correct uid in the deduplicated result", async () => {
      const client = makeDedupClient();
      const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
      expect(result[0].uid).toBe(42);
    });
  });

  it("releases the mailbox lock when done", async () => {
    const lock = { release: mock(() => {}) };
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      mailbox: { exists: 0 },
      fetch: mock(() => (async function* () {})()),
    };
    await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  describe("maps envelope fields to result objects", () => {
    const emailDate = new Date("2025-03-01");

    function makeEnvelopeClient() {
      const lock = { release: mock(() => {}) };
      return {
        getMailboxLock: mock(() => Promise.resolve(lock)),
        search: mock(() => Promise.resolve([99])),
        mailbox: { exists: 1 },
        fetch: mock(() => {
          async function* gen() {
            yield {
              uid: 99,
              envelope: {
                date: emailDate,
                from: [{ address: "Bill@Acme.COM", name: "Acme Billing" }],
                subject: "Invoice #123",
                messageId: "msg-99@acme.com",
              },
            };
          }
          return gen();
        }),
      };
    }

    it("sets uid", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.uid).toBe(99);
    });

    it("lowercases fromAddress", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.fromAddress).toBe("bill@acme.com");
    });

    it("sets fromName", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.fromName).toBe("Acme Billing");
    });

    it("sets subject", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.subject).toBe("Invoice #123");
    });

    it("sets messageId", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.messageId).toBe("msg-99@acme.com");
    });

    it("sets account", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.account).toBe("TestAccount");
    });

    it("sets mailbox", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.mailbox).toBe("INBOX");
    });
  });
});
