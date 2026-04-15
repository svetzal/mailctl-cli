import { describe, expect, it, mock } from "bun:test";
import { aggregateContacts, extractContacts } from "../src/contacts.js";
import { buildContactsJson, formatContactsText } from "../src/format-contacts.js";
import { makeLock } from "./helpers.js";

/** @typedef {{address: string, name: string, date: Date, direction: 'sent'|'received'}} Entry */

/** @type {(addr: string, name: string, date: Date) => Entry} */
const recv = (addr, name, date) => ({ address: addr, name, date, direction: "received" });
/** @type {(addr: string, name: string, date: Date) => Entry} */
const sent = (addr, name, date) => ({ address: addr, name, date, direction: "sent" });

describe("aggregateContacts", () => {
  describe("deduplicates by lowercase address", () => {
    const entries = [
      recv("Alice@Example.com", "Alice", new Date("2026-01-01")),
      recv("alice@example.com", "Alice", new Date("2026-01-02")),
    ];
    const result = aggregateContacts(entries);

    it("returns one contact", () => {
      expect(result.length).toBe(1);
    });

    it("counts both occurrences", () => {
      expect(result[0].count).toBe(2);
    });

    it("uses lowercase address", () => {
      expect(result[0].address).toBe("alice@example.com");
    });
  });

  it("uses most recent non-empty name", () => {
    const entries = [
      recv("bob@example.com", "Bob Old", new Date("2026-01-01")),
      recv("bob@example.com", "", new Date("2026-02-01")),
      recv("bob@example.com", "Bob New", new Date("2026-03-01")),
    ];
    const result = aggregateContacts(entries);
    expect(result[0].name).toBe("Bob New");
  });

  describe("sorts by count descending", () => {
    const entries = [
      recv("rare@example.com", "Rare", new Date("2026-01-01")),
      recv("common@example.com", "Common", new Date("2026-01-01")),
      recv("common@example.com", "Common", new Date("2026-01-02")),
      recv("common@example.com", "Common", new Date("2026-01-03")),
    ];
    const result = aggregateContacts(entries);

    it("first result is the more common address", () => {
      expect(result[0].address).toBe("common@example.com");
    });

    it("second result is the rarer address", () => {
      expect(result[1].address).toBe("rare@example.com");
    });
  });

  describe("tracks direction as sent, received, or both", () => {
    const entries = [
      recv("a@example.com", "A", new Date("2026-01-01")),
      sent("b@example.com", "B", new Date("2026-01-01")),
      recv("c@example.com", "C", new Date("2026-01-01")),
      sent("c@example.com", "C", new Date("2026-01-02")),
    ];
    const result = aggregateContacts(entries);
    const byAddr = Object.fromEntries(result.map((c) => [c.address, c.direction]));

    it("marks received-only as received", () => {
      expect(byAddr["a@example.com"]).toBe("received");
    });

    it("marks sent-only as sent", () => {
      expect(byAddr["b@example.com"]).toBe("sent");
    });

    it("marks both-direction as both", () => {
      expect(byAddr["c@example.com"]).toBe("both");
    });
  });

  describe("filters by search string matching name or address", () => {
    const entries = [
      recv("alice@example.com", "Alice Smith", new Date("2026-01-01")),
      recv("bob@example.com", "Bob Jones", new Date("2026-01-01")),
      recv("salman@ort.com", "Salman", new Date("2026-01-01")),
    ];

    it("filters by name match returns one result", () => {
      const byName = aggregateContacts(entries, { search: "alice" });
      expect(byName.length).toBe(1);
    });

    it("filters by name match returns the correct address", () => {
      const byName = aggregateContacts(entries, { search: "alice" });
      expect(byName[0].address).toBe("alice@example.com");
    });

    it("filters by address domain returns one result", () => {
      const byAddr = aggregateContacts(entries, { search: "ort.com" });
      expect(byAddr.length).toBe(1);
    });

    it("filters by address domain returns the correct address", () => {
      const byAddr = aggregateContacts(entries, { search: "ort.com" });
      expect(byAddr[0].address).toBe("salman@ort.com");
    });
  });

  it("respects limit", () => {
    const entries = [
      recv("a@example.com", "A", new Date("2026-01-01")),
      recv("b@example.com", "B", new Date("2026-01-01")),
      recv("c@example.com", "C", new Date("2026-01-01")),
    ];
    const result = aggregateContacts(entries, { limit: 2 });
    expect(result.length).toBe(2);
  });

  describe("excludes self addresses", () => {
    const entries = [
      recv("me@example.com", "Me", new Date("2026-01-01")),
      recv("other@example.com", "Other", new Date("2026-01-01")),
      sent("ME@Example.com", "Me", new Date("2026-01-02")),
    ];
    const result = aggregateContacts(entries, { selfAddresses: ["me@example.com"] });

    it("returns only one contact", () => {
      expect(result.length).toBe(1);
    });

    it("the remaining contact is not the self address", () => {
      expect(result[0].address).toBe("other@example.com");
    });
  });

  describe("breaks count ties by lastSeen descending", () => {
    const entries = [
      recv("old@example.com", "Old", new Date("2026-01-01")),
      recv("new@example.com", "New", new Date("2026-03-01")),
    ];
    const result = aggregateContacts(entries);

    it("more recently seen contact is first", () => {
      expect(result[0].address).toBe("new@example.com");
    });

    it("older contact is second", () => {
      expect(result[1].address).toBe("old@example.com");
    });
  });

  it("returns empty array for empty input", () => {
    expect(aggregateContacts([])).toEqual([]);
  });
});

// ── formatContactsText ────────────────────────────────────────────────────────

describe("formatContactsText", () => {
  it("includes the sinceLabel in the header", () => {
    const contacts = [
      {
        address: "alice@example.com",
        name: "Alice",
        count: 3,
        lastSeen: new Date("2026-01-15"),
        direction: "received",
      },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 6 months" });
    expect(text).toContain("last 6 months");
  });

  it("includes the contact count in the header", () => {
    const contacts = [
      {
        address: "alice@example.com",
        name: "Alice",
        count: 3,
        lastSeen: new Date("2026-01-15"),
        direction: "received",
      },
      { address: "bob@example.com", name: "Bob", count: 1, lastSeen: new Date("2026-01-10"), direction: "sent" },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 3 months" });
    expect(text).toContain("2 found");
  });

  it("includes each contact address in the output", () => {
    const contacts = [
      {
        address: "alice@example.com",
        name: "Alice",
        count: 3,
        lastSeen: new Date("2026-01-15"),
        direction: "received",
      },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 6 months" });
    expect(text).toContain("alice@example.com");
  });

  it("includes contact name in the output", () => {
    const contacts = [
      {
        address: "alice@example.com",
        name: "Alice Smith",
        count: 3,
        lastSeen: new Date("2026-01-15"),
        direction: "received",
      },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 6 months" });
    expect(text).toContain("Alice Smith");
  });

  it("shows direction as recv for received-only contacts", () => {
    const contacts = [
      {
        address: "alice@example.com",
        name: "Alice",
        count: 1,
        lastSeen: new Date("2026-01-15"),
        direction: "received",
      },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 6 months" });
    expect(text).toContain("recv");
  });

  it("shows direction as sent for sent-only contacts", () => {
    const contacts = [
      { address: "bob@example.com", name: "Bob", count: 1, lastSeen: new Date("2026-01-15"), direction: "sent" },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 6 months" });
    expect(text).toContain("sent");
  });

  it("shows direction as both for bidirectional contacts", () => {
    const contacts = [
      { address: "carol@example.com", name: "Carol", count: 2, lastSeen: new Date("2026-01-15"), direction: "both" },
    ];
    const text = formatContactsText(contacts, { sinceLabel: "last 6 months" });
    expect(text).toContain("both");
  });
});

// ── extractContacts ───────────────────────────────────────────────────────────

describe("extractContacts", () => {
  /** @param {{ inboxUids?: number[], sentUids?: number[], inboxEnvelopes?: any[], sentEnvelopes?: any[] }} [opts] */
  function makeClient({ inboxUids = [1], sentUids = [2], inboxEnvelopes = [], sentEnvelopes = [] } = {}) {
    let fetchCallIndex = 0;

    return {
      list: mock(() =>
        Promise.resolve([
          { path: "INBOX", specialUse: "\\Inbox", name: "INBOX" },
          { path: "Sent", specialUse: "\\Sent", name: "Sent" },
        ]),
      ),
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      search: mock((_criteria) => {
        // First search is for INBOX, second for Sent
        fetchCallIndex++;
        if (fetchCallIndex === 1) return Promise.resolve(inboxUids);
        return Promise.resolve(sentUids);
      }),
      fetch: mock(() => {
        const envelopes = fetchCallIndex <= 1 ? inboxEnvelopes : sentEnvelopes;
        async function* gen() {
          for (const env of envelopes) yield env;
        }
        return gen();
      }),
    };
  }

  it("returns an array of contact entries", async () => {
    const client = /** @type {any} */ (
      makeClient({
        inboxUids: [1],
        inboxEnvelopes: [
          {
            uid: 1,
            envelope: {
              date: new Date("2026-01-15"),
              from: [{ address: "sender@example.com", name: "Sender" }],
            },
          },
        ],
        sentUids: [],
        sentEnvelopes: [],
      })
    );

    const entries = await extractContacts(client, "TestAccount", { since: new Date("2026-01-01"), limit: 25 });

    expect(Array.isArray(entries)).toBe(true);
  });

  it("extracts From addresses from INBOX as received direction", async () => {
    const client = /** @type {any} */ (
      makeClient({
        inboxUids: [1],
        inboxEnvelopes: [
          {
            uid: 1,
            envelope: {
              date: new Date("2026-01-15"),
              from: [{ address: "Alice@Example.com", name: "Alice" }],
            },
          },
        ],
        sentUids: [],
        sentEnvelopes: [],
      })
    );

    const entries = await extractContacts(client, "TestAccount", {
      since: new Date("2026-01-01"),
      limit: 25,
      receivedOnly: true,
    });

    expect(entries.some((e) => e.address === "alice@example.com" && e.direction === "received")).toBe(true);
  });

  it("extracts To addresses from Sent folder as sent direction", async () => {
    const client = /** @type {any} */ ({
      list: mock(() =>
        Promise.resolve([
          { path: "INBOX", specialUse: "\\Inbox", name: "INBOX" },
          { path: "Sent", specialUse: "\\Sent", name: "Sent" },
        ]),
      ),
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      search: mock(() => Promise.resolve([2])),
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 2,
            envelope: {
              date: new Date("2026-01-20"),
              to: [{ address: "recipient@example.com", name: "Recipient" }],
            },
          };
        }
        return gen();
      }),
    });

    const entries = await extractContacts(client, "TestAccount", {
      since: new Date("2026-01-01"),
      limit: 25,
      sentOnly: true,
    });

    expect(entries.some((e) => e.address === "recipient@example.com" && e.direction === "sent")).toBe(true);
  });

  it("returns empty entries when INBOX lock fails", async () => {
    const client = /** @type {any} */ ({
      list: mock(() => Promise.resolve([{ path: "INBOX", specialUse: "\\Inbox", name: "INBOX" }])),
      getMailboxLock: mock(() => Promise.reject(new Error("lock failed"))),
    });

    const entries = await extractContacts(client, "TestAccount", {
      since: new Date("2026-01-01"),
      limit: 25,
      receivedOnly: true,
    });

    expect(entries).toEqual([]);
  });

  it("emits mailbox-lock-failed when INBOX lock fails", async () => {
    const error = new Error("lock failed");
    const onProgress = mock(() => {});
    const client = /** @type {any} */ ({
      list: mock(() => Promise.resolve([{ path: "INBOX", specialUse: "\\Inbox", name: "INBOX" }])),
      getMailboxLock: mock(() => Promise.reject(error)),
    });

    await extractContacts(client, "TestAccount", {
      since: new Date("2026-01-01"),
      limit: 25,
      receivedOnly: true,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({ type: "mailbox-lock-failed", mailbox: "INBOX", error });
  });
});

// ── buildContactsJson ─────────────────────────────────────────────────────────

describe("buildContactsJson", () => {
  it("returns the contacts array unchanged", () => {
    const contacts = [{ address: "alice@example.com", name: "Alice", count: 5 }];
    const result = buildContactsJson(contacts);

    expect(result).toBe(contacts);
  });
});
