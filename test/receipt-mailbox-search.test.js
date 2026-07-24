import { describe, expect, it, mock } from "bun:test";
import { buildReceiptSearchCriteria, searchMailboxForReceiptRecords } from "../src/receipts/receipt-mailbox-search.js";
import { BILLING_SENDER_PATTERNS, RECEIPT_SUBJECT_TERMS } from "../src/receipts/receipt-terms.js";
import { makeLock } from "./helpers.js";

// ── buildReceiptSearchCriteria ────────────────────────────────────────────────

describe("buildReceiptSearchCriteria", () => {
  it("builds one subject criterion per receipt subject term when senders are excluded", () => {
    const entries = buildReceiptSearchCriteria({ includeSenders: false });

    expect(entries).toHaveLength(RECEIPT_SUBJECT_TERMS.length);
  });

  it("builds subject criteria with the term as the subject value", () => {
    const entries = buildReceiptSearchCriteria({ includeSenders: false });

    expect(entries[0].criteria).toEqual({ subject: entries[0].term });
  });

  it("does not include a since field when since is omitted", () => {
    const entries = buildReceiptSearchCriteria({ includeSenders: false });

    expect(entries[0].criteria.since).toBeUndefined();
  });

  it("applies since to every criterion when provided", () => {
    const since = new Date("2025-01-01");
    const entries = buildReceiptSearchCriteria({ since, includeSenders: false });

    expect(entries.every((e) => e.criteria.since === since)).toBe(true);
  });

  it("adds one from criterion per billing sender pattern when includeSenders is true", () => {
    const entries = buildReceiptSearchCriteria({ includeSenders: true });

    expect(entries).toHaveLength(RECEIPT_SUBJECT_TERMS.length + BILLING_SENDER_PATTERNS.length);
  });

  it("builds sender criteria as a from field keyed on the pattern", () => {
    const entries = buildReceiptSearchCriteria({ includeSenders: true });
    const senderEntry = entries.find((e) => e.term === BILLING_SENDER_PATTERNS[0]);

    expect(senderEntry?.criteria).toEqual({ from: BILLING_SENDER_PATTERNS[0] });
  });

  it("applies since to sender criteria too", () => {
    const since = new Date("2025-01-01");
    const entries = buildReceiptSearchCriteria({ since, includeSenders: true });
    const senderEntry = entries.find((e) => e.term === BILLING_SENDER_PATTERNS[0]);

    expect(senderEntry?.criteria.since).toBe(since);
  });

  it("defaults includeSenders to false when opts are omitted entirely", () => {
    const entries = buildReceiptSearchCriteria();

    expect(entries).toHaveLength(RECEIPT_SUBJECT_TERMS.length);
  });
});

// ── searchMailboxForReceiptRecords ────────────────────────────────────────────

describe("searchMailboxForReceiptRecords", () => {
  const criteria = [{ term: "receipt", criteria: { subject: "receipt" } }];
  const fetchQuery = { envelope: true, uid: true };
  const buildRecord = (msg) => ({ uid: msg.uid, subject: msg.envelope.subject });

  it("returns empty results and failures when getMailboxLock throws", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))),
    });

    const { results, failures } = await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria,
      fetchQuery,
      buildRecord,
    });

    expect(results).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("returns empty results when no criteria match any UID", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 0 },
      search: mock(() => Promise.resolve([])),
    });

    const { results } = await searchMailboxForReceiptRecords(client, "INBOX", { criteria, fetchQuery, buildRecord });

    expect(results).toEqual([]);
  });

  it("deduplicates UIDs across multiple criteria before fetching", async () => {
    const twoCriteria = [
      { term: "receipt", criteria: { subject: "receipt" } },
      { term: "invoice", criteria: { subject: "invoice" } },
    ];
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([42])),
      fetch: mock(() => {
        async function* gen() {
          yield { uid: 42, envelope: { subject: "Your invoice" } };
        }
        return gen();
      }),
    });

    const { results } = await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria: twoCriteria,
      fetchQuery,
      buildRecord,
    });

    expect(results).toHaveLength(1);
  });

  it("records a failure entry when a search criterion throws", async () => {
    const searchErr = new Error("IMAP search failed");
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.reject(searchErr)),
    });

    const { results, failures } = await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria,
      fetchQuery,
      buildRecord,
    });

    expect(results).toEqual([]);
    expect(failures).toEqual([{ mailbox: "INBOX", phase: "search", term: "receipt", error: searchErr }]);
  });

  it("rethrows a bare TypeError raised from client.search instead of recording a failure", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.reject(new TypeError("bad criteria shape"))),
    });

    await expect(
      searchMailboxForReceiptRecords(client, "INBOX", { criteria, fetchQuery, buildRecord }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("records a failure entry when the fetch phase throws", async () => {
    const fetchErr = new Error("fetch failed");
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([1])),
      fetch: mock(() => {
        // biome-ignore lint/correctness/useYield: intentionally throws before any yield to simulate a fetch failure
        async function* gen() {
          throw fetchErr;
        }
        return gen();
      }),
    });

    const { results, failures } = await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria,
      fetchQuery,
      buildRecord,
    });

    expect(results).toEqual([]);
    expect(failures).toEqual([{ mailbox: "INBOX", phase: "fetch", error: fetchErr }]);
  });

  it("rethrows a bare TypeError raised from client.fetch instead of recording a failure", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([1])),
      fetch: mock(() => {
        // biome-ignore lint/correctness/useYield: intentionally throws before any yield to simulate a fetch failure
        async function* gen() {
          throw new TypeError("bad fetch query shape");
        }
        return gen();
      }),
    });

    await expect(
      searchMailboxForReceiptRecords(client, "INBOX", { criteria, fetchQuery, buildRecord }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("does not throw when optional event slots are omitted", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([1])),
      fetch: mock(() => {
        async function* gen() {
          yield { uid: 1, envelope: { subject: "Receipt" } };
        }
        return gen();
      }),
    });

    const { results } = await searchMailboxForReceiptRecords(client, "INBOX", { criteria, fetchQuery, buildRecord });

    expect(results).toHaveLength(1);
  });

  it("emits the start event with mailbox and message count when provided", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 7 },
      search: mock(() => Promise.resolve([])),
    });
    const events = [];

    await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria,
      fetchQuery,
      buildRecord,
      events: { start: (mailbox, count) => ({ type: "start", mailbox, count }) },
      onProgress: (e) => events.push(e),
    });

    expect(events).toEqual([{ type: "start", mailbox: "INBOX", count: 7 }]);
  });

  it("emits the empty event when no UIDs match", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 0 },
      search: mock(() => Promise.resolve([])),
    });
    const events = [];

    await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria,
      fetchQuery,
      buildRecord,
      events: { empty: (mailbox) => ({ type: "empty", mailbox }) },
      onProgress: (e) => events.push(e),
    });

    expect(events).toEqual([{ type: "empty", mailbox: "INBOX" }]);
  });

  it("emits the candidates event with the deduplicated UID count", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([1, 2])),
      fetch: mock(() => (async function* () {})()),
    });
    const events = [];

    await searchMailboxForReceiptRecords(client, "INBOX", {
      criteria,
      fetchQuery,
      buildRecord,
      events: { candidates: (mailbox, count) => ({ type: "candidates", mailbox, count }) },
      onProgress: (e) => events.push(e),
    });

    expect(events).toEqual([{ type: "candidates", mailbox: "INBOX", count: 2 }]);
  });
});
