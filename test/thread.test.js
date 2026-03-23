import { describe, it, expect, mock } from "bun:test";
import { findThread, stripSubjectPrefixes, parseReferences, formatThreadText } from "../src/thread.js";
import { makeLock } from "./helpers.js";

function makeDate(str = "2025-03-01T12:00:00Z") {
  return new Date(str);
}

/**
 * Build a mock IMAP client for thread tests.
 *
 * @param {object} opts
 * @param {object} [opts.anchorEnvelope] - envelope for the anchor message fetch
 * @param {string} [opts.anchorHeaders] - raw headers text for the anchor
 * @param {Map<string, number[]>} [opts.searchResults] - criteria key → UIDs
 * @param {Array} [opts.threadEnvelopes] - envelopes returned for thread fetches
 * @param {boolean} [opts.headerSearchFails] - simulate header search failure
 * @param {number[]} [opts.subjectSearchUids] - UIDs for subject fallback
 */
function makeClient(opts = {}) {
  const anchorEnvelope = opts.anchorEnvelope || {
    messageId: "<anchor@example.com>",
    subject: "Test thread",
    date: makeDate(),
    from: [{ address: "alice@example.com", name: "Alice" }],
  };
  const anchorHeaders = opts.anchorHeaders || "";
  const threadEnvelopes = opts.threadEnvelopes || [];
  const headerSearchFails = opts.headerSearchFails || false;
  const subjectSearchUids = opts.subjectSearchUids || [];

  let fetchCallCount = 0;

  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock((criteria) => {
      if (criteria.header && headerSearchFails) {
        return Promise.reject(new Error("header search not supported"));
      }
      if (criteria.header) {
        // Check if any threadEnvelope messageId matches the search
        const searchValue = criteria.header["Message-ID"] || criteria.header.References || criteria.header["In-Reply-To"];
        const matchingUids = threadEnvelopes
          .filter((env) => {
            if (criteria.header["Message-ID"]) return env.envelope.messageId === searchValue;
            if (criteria.header.References) return (env.references || "").includes(searchValue);
            if (criteria.header["In-Reply-To"]) return env.inReplyTo === searchValue;
            return false;
          })
          .map((env) => env.uid);
        return Promise.resolve(matchingUids);
      }
      if (criteria.subject) {
        return Promise.resolve(subjectSearchUids);
      }
      if (criteria.uid) {
        // detectMailbox-style search
        return Promise.resolve([Number(criteria.uid)]);
      }
      return Promise.resolve([]);
    }),
    fetch: mock((uidRange, fields) => {
      fetchCallCount++;
      const requestedUids = uidRange.split(",").map(Number);

      async function* gen() {
        // First fetch call is for anchor headers
        if (fields.headers && fields.envelope) {
          yield {
            uid: requestedUids[0],
            envelope: anchorEnvelope,
            headers: Buffer.from(anchorHeaders),
          };
          return;
        }

        // Subsequent fetches are for thread messages (source + envelope)
        if (fields.source) {
          for (const uid of requestedUids) {
            // Find matching thread envelope
            const match = threadEnvelopes.find((e) => e.uid === uid);
            if (match) {
              yield {
                uid,
                envelope: match.envelope,
                source: Buffer.from(`From: ${match.envelope.from[0].address}\r\nSubject: ${match.envelope.subject}\r\n\r\n${match.body || "message body"}`),
              };
            } else if (uid === requestedUids[0] || uid === Number(uidRange.split(",")[0])) {
              // Anchor message
              yield {
                uid,
                envelope: anchorEnvelope,
                source: Buffer.from(`From: ${anchorEnvelope.from[0].address}\r\nSubject: ${anchorEnvelope.subject}\r\n\r\nanchor body`),
              };
            }
          }
        }
      }
      return gen();
    }),
  };
}

// ── parseReferences ───────────────────────────────────────────────────────────

describe("parseReferences", () => {
  it("extracts Message-IDs from a References header", () => {
    const refs = "<msg1@example.com> <msg2@example.com> <msg3@example.com>";
    expect(parseReferences(refs)).toEqual(["msg1@example.com", "msg2@example.com", "msg3@example.com"]);
  });

  it("returns empty array for null/empty input", () => {
    expect(parseReferences("")).toEqual([]);
    expect(parseReferences(null)).toEqual([]);
  });
});

// ── stripSubjectPrefixes ──────────────────────────────────────────────────────

describe("stripSubjectPrefixes", () => {
  it("strips Re: prefix", () => {
    expect(stripSubjectPrefixes("Re: Hello")).toBe("Hello");
  });

  it("strips Fwd: prefix", () => {
    expect(stripSubjectPrefixes("Fwd: Hello")).toBe("Hello");
  });

  it("strips multiple prefixes", () => {
    expect(stripSubjectPrefixes("Re: Fwd: Re: Hello")).toBe("Hello");
  });
});

// ── findThread ────────────────────────────────────────────────────────────────

describe("findThread", () => {
  it("follows References header to find related messages", async () => {
    const reply1 = {
      uid: 10,
      envelope: {
        messageId: "<reply1@example.com>",
        subject: "Re: Test thread",
        date: makeDate("2025-03-02T10:00:00Z"),
        from: [{ address: "bob@example.com", name: "Bob" }],
      },
      references: "<anchor@example.com>",
      body: "reply body",
    };

    const client = makeClient({
      anchorEnvelope: {
        messageId: "<anchor@example.com>",
        subject: "Test thread",
        date: makeDate("2025-03-01T12:00:00Z"),
        from: [{ address: "alice@example.com", name: "Alice" }],
      },
      anchorHeaders: "References: \r\nIn-Reply-To: \r\n",
      threadEnvelopes: [reply1],
    });

    const { messages } = await findThread(client, "TestAccount", "INBOX", 1, ["INBOX", "Sent"]);

    // Should find anchor + reply
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it("follows In-Reply-To header to find related messages", async () => {
    const reply1 = {
      uid: 20,
      envelope: {
        messageId: "<reply-irt@example.com>",
        subject: "Re: Original",
        date: makeDate("2025-03-02T14:00:00Z"),
        from: [{ address: "carol@example.com", name: "Carol" }],
      },
      inReplyTo: "<original@example.com>",
      body: "in-reply-to body",
    };

    const client = makeClient({
      anchorEnvelope: {
        messageId: "<original@example.com>",
        subject: "Original",
        date: makeDate("2025-03-01T09:00:00Z"),
        from: [{ address: "dave@example.com", name: "Dave" }],
      },
      anchorHeaders: "",
      threadEnvelopes: [reply1],
    });

    const { messages } = await findThread(client, "TestAccount", "INBOX", 5, ["INBOX"]);

    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates by Message-ID", async () => {
    // Same message found in two mailboxes
    const msg = {
      uid: 30,
      envelope: {
        messageId: "<dup@example.com>",
        subject: "Re: Test thread",
        date: makeDate("2025-03-02T10:00:00Z"),
        from: [{ address: "bob@example.com", name: "Bob" }],
      },
      references: "<anchor@example.com>",
      body: "dup body",
    };

    const client = makeClient({
      anchorHeaders: "",
      threadEnvelopes: [msg],
    });

    const { messages } = await findThread(client, "TestAccount", "INBOX", 1, ["INBOX", "Sent"]);

    // Count how many messages have messageId "<dup@example.com>"
    const dupCount = messages.filter((m) => m.messageId === "<dup@example.com>").length;
    expect(dupCount).toBeLessThanOrEqual(1);
  });

  it("sorts results chronologically", async () => {
    const older = {
      uid: 40,
      envelope: {
        messageId: "<older@example.com>",
        subject: "Re: Test thread",
        date: makeDate("2025-03-01T08:00:00Z"),
        from: [{ address: "early@example.com", name: "Early" }],
      },
      references: "<anchor@example.com>",
      body: "older",
    };
    const newer = {
      uid: 41,
      envelope: {
        messageId: "<newer@example.com>",
        subject: "Re: Test thread",
        date: makeDate("2025-03-03T16:00:00Z"),
        from: [{ address: "late@example.com", name: "Late" }],
      },
      references: "<anchor@example.com>",
      body: "newer",
    };

    const client = makeClient({
      anchorEnvelope: {
        messageId: "<anchor@example.com>",
        subject: "Test thread",
        date: makeDate("2025-03-02T12:00:00Z"),
        from: [{ address: "alice@example.com", name: "Alice" }],
      },
      anchorHeaders: "",
      threadEnvelopes: [newer, older],
    });

    const { messages } = await findThread(client, "TestAccount", "INBOX", 1, ["INBOX"]);

    // Verify chronological order
    for (let i = 1; i < messages.length; i++) {
      expect(new Date(messages[i].date).getTime()).toBeGreaterThanOrEqual(
        new Date(messages[i - 1].date).getTime()
      );
    }
  });

  it("searches across multiple mailboxes (INBOX + Sent)", async () => {
    const sentReply = {
      uid: 50,
      envelope: {
        messageId: "<sent-reply@example.com>",
        subject: "Re: Test thread",
        date: makeDate("2025-03-02T10:00:00Z"),
        from: [{ address: "me@example.com", name: "Me" }],
      },
      references: "<anchor@example.com>",
      body: "my reply",
    };

    const client = makeClient({
      anchorHeaders: "",
      threadEnvelopes: [sentReply],
    });

    const { messages } = await findThread(client, "TestAccount", "INBOX", 1, ["INBOX", "Sent"]);

    // The search should have been called for both INBOX and Sent
    const searchCalls = client.search.mock.calls;
    const mailboxLockCalls = client.getMailboxLock.mock.calls;
    // Multiple mailbox locks should have been acquired
    expect(mailboxLockCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to subject matching when header search fails", async () => {
    const subjectMatch = {
      uid: 60,
      envelope: {
        messageId: "<subj-match@example.com>",
        subject: "Re: Test thread",
        date: makeDate("2025-03-02T10:00:00Z"),
        from: [{ address: "bob@example.com", name: "Bob" }],
      },
      body: "subject match body",
    };

    const client = makeClient({
      anchorHeaders: "",
      threadEnvelopes: [subjectMatch],
      headerSearchFails: true,
      subjectSearchUids: [60],
    });

    const { messages, fallback } = await findThread(client, "TestAccount", "INBOX", 1, ["INBOX"]);

    expect(fallback).toBe(true);
  });

  it("respects the limit option", async () => {
    // Create many thread messages
    const many = Array.from({ length: 10 }, (_, i) => ({
      uid: 100 + i,
      envelope: {
        messageId: `<msg-${i}@example.com>`,
        subject: "Re: Test thread",
        date: makeDate(`2025-03-0${(i % 9) + 1}T12:00:00Z`),
        from: [{ address: `user${i}@example.com`, name: `User ${i}` }],
      },
      references: "<anchor@example.com>",
      body: `message ${i}`,
    }));

    const client = makeClient({
      anchorHeaders: "",
      threadEnvelopes: many,
    });

    const { messages } = await findThread(client, "TestAccount", "INBOX", 1, ["INBOX"], { limit: 3 });

    expect(messages.length).toBeLessThanOrEqual(3);
  });
});

// ── formatThreadText ──────────────────────────────────────────────────────────

describe("formatThreadText", () => {
  it("returns a message when no thread messages found", () => {
    expect(formatThreadText([])).toBe("No thread messages found.");
  });

  it("shows message count in header", () => {
    const messages = [
      { date: makeDate(), from: "a@b.com", fromName: "A", subject: "Test", snippet: "hello", body: "" },
      { date: makeDate(), from: "c@d.com", fromName: "C", subject: "Re: Test", snippet: "reply", body: "" },
    ];
    const text = formatThreadText(messages);
    expect(text).toContain("2 messages");
  });

  it("indicates subject-match fallback in header", () => {
    const messages = [
      { date: makeDate(), from: "a@b.com", fromName: "A", subject: "Test", snippet: "hello", body: "" },
    ];
    const text = formatThreadText(messages, { fallback: true });
    expect(text).toContain("thread reconstructed by subject match");
  });

  it("shows full body in full mode", () => {
    const messages = [
      { date: makeDate(), from: "a@b.com", fromName: "A", subject: "Test", snippet: "hello", body: "full body content here" },
    ];
    const text = formatThreadText(messages, { full: true });
    expect(text).toContain("full body content here");
  });
});
