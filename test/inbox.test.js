import { beforeAll, describe, expect, it, mock } from "bun:test";
import { formatInboxText } from "../src/format-inbox.js";
import { fetchInbox } from "../src/inbox.js";
import { makeLock } from "./helpers.js";

/**
 * @param {object} opts
 * @param {number} opts.uid
 * @param {Date} [opts.date]
 * @param {string} [opts.from]
 * @param {string} [opts.fromName]
 * @param {string} [opts.subject]
 * @param {string[]} [opts.flags]
 */
function makeEnvelope({ uid, date, from, fromName, subject, flags }) {
  return {
    uid,
    envelope: {
      date: date || new Date("2026-03-07T14:00:00Z"),
      from: [{ address: from || "test@example.com", name: fromName || "" }],
      subject: subject || "Test subject",
    },
    flags: new Set(flags || []),
  };
}

/** @param {{ searchUids?: number[], envelopes?: object[] }} [opts] */
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

describe("fetchInbox", () => {
  describe("returns messages sorted by date, newest first", () => {
    const envelopes = [
      makeEnvelope({ uid: 1, date: new Date("2026-03-05T10:00:00Z"), subject: "Older" }),
      makeEnvelope({ uid: 2, date: new Date("2026-03-07T14:00:00Z"), subject: "Newer" }),
      makeEnvelope({ uid: 3, date: new Date("2026-03-06T12:00:00Z"), subject: "Middle" }),
    ];
    const client = makeClient({ searchUids: [1, 2, 3], envelopes });
    let results;
    beforeAll(async () => {
      results = await fetchInbox(client, "TestAccount", { limit: 10 });
    });

    it("first result is Newer", async () => {
      expect(results[0].subject).toBe("Newer");
    });

    it("second result is Middle", async () => {
      expect(results[1].subject).toBe("Middle");
    });

    it("third result is Older", async () => {
      expect(results[2].subject).toBe("Older");
    });
  });

  it("filters to unseen messages when unreadOnly is true", async () => {
    const client = makeClient({ searchUids: [1], envelopes: [makeEnvelope({ uid: 1 })] });

    await fetchInbox(client, "TestAccount", { limit: 10, unreadOnly: true });

    const calls = /** @type {any[][]} */ (client.search.mock.calls);
    const searchCriteria = calls[0][0];
    expect(searchCriteria.seen).toBe(false);
  });

  it("respects limit by taking the last N UIDs", async () => {
    const searchUids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const client = makeClient({ searchUids, envelopes: [] });
    client.fetch = mock((_uidRange) => {
      async function* gen() {}
      return gen();
    });

    await fetchInbox(client, "TestAccount", { limit: 3 });

    const fetchCalls = /** @type {string[][]} */ (client.fetch.mock.calls);
    const fetchedRange = fetchCalls[0][0];
    const fetchedUids = fetchedRange.split(",").map(Number);
    expect(fetchedUids).toEqual([8, 9, 10]);
  });

  describe("includes unread flag from message flags", () => {
    const envelopes = [
      makeEnvelope({ uid: 1, flags: ["\\Seen"], subject: "Read msg" }),
      makeEnvelope({ uid: 2, flags: [], subject: "Unread msg" }),
    ];
    const client = makeClient({ searchUids: [1, 2], envelopes });
    let results;
    beforeAll(async () => {
      results = await fetchInbox(client, "TestAccount", { limit: 10 });
    });

    it("seen message has unread: false", async () => {
      const readMsg = results.find((r) => r.subject === "Read msg");
      expect(readMsg.unread).toBe(false);
    });

    it("unseen message has unread: true", async () => {
      const unreadMsg = results.find((r) => r.subject === "Unread msg");
      expect(unreadMsg.unread).toBe(true);
    });
  });

  it("passes since date to IMAP search criteria", async () => {
    const since = new Date("2026-03-01");
    const client = makeClient({ searchUids: [], envelopes: [] });

    await fetchInbox(client, "TestAccount", { limit: 10, since });

    const calls = /** @type {any[][]} */ (client.search.mock.calls);
    const searchCriteria = calls[0][0];
    expect(searchCriteria.since).toBe(since);
  });

  it("returns an empty array when getMailboxLock throws", async () => {
    const client = {
      getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))),
    };

    const results = await fetchInbox(client, "TestAccount", { limit: 10 });

    expect(results).toHaveLength(0);
  });

  it("emits mailbox-lock-failed when getMailboxLock throws", async () => {
    const error = new Error("no such mailbox");
    const client = { getMailboxLock: mock(() => Promise.reject(error)) };
    const onProgress = mock(() => {});

    await fetchInbox(client, "TestAccount", { limit: 10, onProgress });

    expect(onProgress).toHaveBeenCalledWith({ type: "mailbox-lock-failed", mailbox: "INBOX", error });
  });

  it("emits search-failed when search throws", async () => {
    const error = new Error("search error");
    const lock = makeLock();
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.reject(error)),
    };
    const onProgress = mock(() => {});

    await fetchInbox(client, "TestAccount", { limit: 10, onProgress });

    expect(onProgress).toHaveBeenCalledWith({ type: "search-failed", mailbox: "INBOX", error });
  });

  it("returns an empty array when search returns no UIDs", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });

    const results = await fetchInbox(client, "TestAccount", { limit: 10 });

    expect(results).toHaveLength(0);
  });

  it("sets mailbox to INBOX on all results", async () => {
    const envelopes = [makeEnvelope({ uid: 1 })];
    const client = makeClient({ searchUids: [1], envelopes });

    const results = await fetchInbox(client, "TestAccount", { limit: 10 });

    expect(results[0].mailbox).toBe("INBOX");
  });
});

describe("formatInboxText", () => {
  it("shows unread count in account header", () => {
    const messages = [
      {
        account: "iCloud",
        uid: 1,
        date: new Date("2026-03-07"),
        from: "a@b.com",
        fromName: "",
        subject: "S1",
        unread: true,
        mailbox: "INBOX",
      },
      {
        account: "iCloud",
        uid: 2,
        date: new Date("2026-03-07"),
        from: "c@d.com",
        fromName: "",
        subject: "S2",
        unread: false,
        mailbox: "INBOX",
      },
    ];
    const map = new Map([["iCloud", messages]]);

    const text = formatInboxText(map);

    expect(text).toContain("=== iCloud (1 unread) ===");
  });

  describe("uses filled circle for unread and open circle for read", () => {
    const messages = [
      {
        account: "Test",
        uid: 1,
        date: new Date("2026-03-07"),
        from: "a@b.com",
        fromName: "",
        subject: "Unread",
        unread: true,
        mailbox: "INBOX",
      },
      {
        account: "Test",
        uid: 2,
        date: new Date("2026-03-07"),
        from: "c@d.com",
        fromName: "",
        subject: "Read",
        unread: false,
        mailbox: "INBOX",
      },
    ];
    const map = new Map([["Test", messages]]);
    const text = formatInboxText(map);

    it("unread message has filled circle", () => {
      expect(text).toContain("\u25CF UID:1");
    });

    it("read message has open circle", () => {
      expect(text).toContain("\u25CB UID:2");
    });
  });
});
