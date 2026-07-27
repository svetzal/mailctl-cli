import { describe, expect, it } from "bun:test";
import {
  attachAccountFailures,
  buildAttachmentListJson,
  buildAttachmentSavedJson,
  buildContactsJson,
  buildFoldersJson,
  buildInboxJson,
  buildReadJson,
  buildReadResult,
  buildSearchJson,
  buildThreadJson,
  formatAttachmentListText,
  formatAttachmentOutput,
  formatAttachmentSavedText,
  formatContactsText,
  formatFoldersText,
  formatInboxText,
  formatReadOutput,
  formatReadText,
  formatSearchText,
  formatThreadOutput,
  formatThreadText,
} from "../src/format-mail.js";

// ── format-read ───────────────────────────────────────────────────────────────

function mockParsed(overrides = {}) {
  return {
    date: new Date("2025-01-15T12:00:00Z"),
    from: { text: "Sender <sender@example.com>" },
    to: { text: "Me <me@example.com>" },
    subject: "Test",
    text: "Body text",
    html: null,
    attachments: [],
    headers: new Map(),
    ...overrides,
  };
}

describe("buildReadResult", () => {
  it("passes numeric uid through unchanged as a number", () => {
    const result = buildReadResult(mockParsed(), "icloud", 42, { maxBody: 1000, includeHeaders: false });

    expect(result.uid).toBe(42);
  });

  it("uses htmlToText for body when text is absent but html is present", () => {
    const result = buildReadResult(mockParsed({ text: null, html: "<p>Hello</p>" }), "icloud", 1, {
      maxBody: 1000,
      includeHeaders: false,
    });

    expect(result.body).toContain("Hello");
  });

  it("includes bodyHtml when the parsed message has html", () => {
    const result = buildReadResult(mockParsed({ text: null, html: "<p>Hello</p>" }), "icloud", 1, {
      maxBody: 1000,
      includeHeaders: false,
    });

    expect(result.bodyHtml).toBeDefined();
  });

  it("omits bodyHtml when the parsed message has no html", () => {
    const result = buildReadResult(mockParsed({ html: null }), "icloud", 1, {
      maxBody: 1000,
      includeHeaders: false,
    });

    expect(result).not.toHaveProperty("bodyHtml");
  });
});

describe("buildReadJson", () => {
  it("includes headers when includeHeaders is true", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "value");
    const result = buildReadJson(parsed, "icloud", "1", {
      maxBody: 1000,
      maxBodyExplicit: false,
      includeHeaders: true,
    });

    expect(result).toHaveProperty("headers");
  });

  it("omits headers when includeHeaders is false", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "value");
    const result = buildReadJson(parsed, "icloud", "1", {
      maxBody: 1000,
      maxBodyExplicit: false,
      includeHeaders: false,
    });

    expect(result).not.toHaveProperty("headers");
  });
});

describe("formatReadText", () => {
  it("includes body text in the output", () => {
    const result = formatReadText(mockParsed(), { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(result).toContain("Body text");
  });

  it("uses htmlToText output when only html is present", () => {
    const result = formatReadText(mockParsed({ text: null, html: "<p>Hello world</p>" }), {
      maxBody: 1000,
      showHeaders: false,
      showRaw: false,
    });

    expect(result).toContain("Hello world");
  });

  it("lists attachment filenames when attachments are present", () => {
    const parsed = mockParsed({ attachments: [{ filename: "invoice.pdf" }] });
    const result = formatReadText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(result).toContain("Attachments: invoice.pdf");
  });

  it("uses (unnamed) for attachments without a filename", () => {
    const parsed = mockParsed({ attachments: [{ filename: null }] });
    const result = formatReadText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(result).toContain("(unnamed)");
  });

  it("includes headers section when showHeaders is true", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "value123");
    const result = formatReadText(parsed, { maxBody: 1000, showHeaders: true, showRaw: false });

    expect(result).toContain("x-custom");
  });

  it("omits headers section when showHeaders is false", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "value123");
    const result = formatReadText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(result).not.toContain("--- Headers ---");
  });
});

describe("formatReadOutput", () => {
  it("returns JSON string when json is true", () => {
    const result = formatReadOutput(true, mockParsed(), "icloud", "42", {});
    expect(JSON.parse(result)).toHaveProperty("account", "icloud");
  });

  it("returns text string containing body text when json is false", () => {
    const result = formatReadOutput(false, mockParsed(), "icloud", "42", {});

    expect(result).toContain("Body text");
  });

  it("defaults maxBody to 3000 when opts.maxBody is not set", () => {
    const longBody = "x".repeat(4000);
    const result = formatReadOutput(false, mockParsed({ text: longBody }), "icloud", "42", {});
    expect(result.length).toBeLessThan(longBody.length);
  });
});

// ── format-search ─────────────────────────────────────────────────────────────

describe("formatSearchText", () => {
  const result = {
    mailbox: "INBOX",
    uid: 42,
    date: "2026-01-15",
    fromName: "Alice",
    from: "alice@example.com",
    subject: "Hello there",
  };

  describe("formats a single result correctly", () => {
    const text = formatSearchText([result]);

    it("contains mailbox label", () => {
      expect(text).toContain("[INBOX]");
    });

    it("contains uid", () => {
      expect(text).toContain("UID:42");
    });

    it("contains date", () => {
      expect(text).toContain("2026-01-15");
    });

    it("contains sender name", () => {
      expect(text).toContain("Alice");
    });

    it("contains from address", () => {
      expect(text).toContain("alice@example.com");
    });

    it("contains subject", () => {
      expect(text).toContain("Hello there");
    });
  });

  describe("formats multiple results, one per line", () => {
    const second = { ...result, uid: 99, mailbox: "Sent", subject: "Re: Hello" };
    const text = formatSearchText([result, second]);
    const lines = text.split("\n");

    it("produces two lines", () => {
      expect(lines).toHaveLength(2);
    });

    it("first line contains INBOX", () => {
      expect(lines[0]).toContain("INBOX");
    });

    it("second line contains Sent", () => {
      expect(lines[1]).toContain("Sent");
    });
  });

  it("returns an empty string when results array is empty", () => {
    expect(formatSearchText([])).toBe("");
  });

  it("renders the account-failure warning when results are empty but an account failed to connect", () => {
    const text = formatSearchText([], [{ account: "Test Account", error: "connect refused" }]);
    expect(text).toContain("⚠");
    expect(text).toContain("Test Account");
  });

  it("does not render a warning when results are empty and there are no account failures", () => {
    const text = formatSearchText([], []);
    expect(text).not.toContain("⚠");
  });

  it("handles missing fromName gracefully", () => {
    const noName = { ...result, fromName: undefined };
    const text = formatSearchText([noName]);

    expect(text).toContain("<alice@example.com>");
  });

  describe("handles missing from address gracefully", () => {
    const noFrom = { ...result, from: undefined };
    const text = formatSearchText([noFrom]);

    it("still contains mailbox label", () => {
      expect(text).toContain("[INBOX]");
    });

    it("still contains the subject", () => {
      expect(text).toContain("Hello there");
    });
  });

  it("handles missing subject gracefully", () => {
    const noSubject = { ...result, subject: undefined };
    const text = formatSearchText([noSubject]);

    expect(text).toContain("[INBOX]");
  });

  describe("handles missing date gracefully", () => {
    const noDate = { ...result, date: undefined };
    const text = formatSearchText([noDate]);

    it("still contains mailbox label", () => {
      expect(text).toContain("[INBOX]");
    });

    it("still contains uid", () => {
      expect(text).toContain("UID:42");
    });
  });
});

describe("buildSearchJson", () => {
  it("strips the internal messageId field from results", () => {
    const results = [{ mailbox: "INBOX", uid: 42, messageId: "<abc@example.com>", subject: "Hello" }];
    const output = buildSearchJson(results);

    expect(output[0]).not.toHaveProperty("messageId");
  });

  it("preserves other fields", () => {
    const results = [{ mailbox: "INBOX", uid: 42, messageId: "<abc@example.com>", subject: "Hello" }];
    const output = buildSearchJson(results);

    expect(output[0].subject).toBe("Hello");
  });

  it("returns one object per result", () => {
    const results = [
      { mailbox: "INBOX", uid: 1, messageId: "<a@x.com>" },
      { mailbox: "Sent", uid: 2, messageId: "<b@x.com>" },
    ];
    const output = buildSearchJson(results);

    expect(output).toHaveLength(2);
  });
});

// ── attachAccountFailures ───────────────────────────────────────────────────────

describe("attachAccountFailures", () => {
  it("returns the payload unchanged when there are no account failures", () => {
    const payload = [{ subject: "Hello" }];
    expect(attachAccountFailures(payload, [], "results")).toBe(payload);
  });

  it("wraps an array payload under arrayKey alongside accountFailures when failures exist", () => {
    const payload = [{ subject: "Hello" }];
    const failures = [{ account: "icloud", error: "timeout" }];

    expect(attachAccountFailures(payload, failures, "results")).toEqual({
      results: payload,
      accountFailures: failures,
    });
  });

  it("merges accountFailures directly onto an object payload when failures exist", () => {
    const payload = { sinceLabel: "30 days", contacts: [] };
    const failures = [{ account: "icloud", error: "timeout" }];

    expect(attachAccountFailures(payload, failures)).toEqual({
      sinceLabel: "30 days",
      contacts: [],
      accountFailures: failures,
    });
  });
});

// ── format-folders ────────────────────────────────────────────────────────────

describe("formatFoldersText", () => {
  const singleAccount = [
    {
      account: "iCloud",
      folders: [
        { path: "INBOX", specialUse: null },
        { path: "Sent Messages", specialUse: "\\Sent" },
      ],
    },
  ];

  it("shows the account header", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("=== iCloud ===");
  });

  it("shows the folder path with indentation", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("  INBOX");
  });

  it("shows specialUse suffix when present", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("Sent Messages (\\Sent)");
  });

  it("omits specialUse suffix when null", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("  INBOX\n");
  });

  it("shows headers for multiple accounts", () => {
    const multiAccount = [
      { account: "iCloud", folders: [{ path: "INBOX", specialUse: null }] },
      { account: "Gmail", folders: [{ path: "INBOX", specialUse: null }] },
    ];
    const text = formatFoldersText(multiAccount);

    expect(text).toContain("=== Gmail ===");
  });

  it("returns empty string for empty input array", () => {
    const text = formatFoldersText([]);

    expect(text).toBe("");
  });
});

describe("buildFoldersJson", () => {
  const input = [
    {
      account: "iCloud",
      folders: [
        { path: "INBOX", specialUse: null },
        { path: "Sent Messages", specialUse: "\\Sent" },
      ],
    },
    {
      account: "Gmail",
      folders: [{ path: "INBOX", specialUse: null }],
    },
  ];

  it("flattens folders from all accounts", () => {
    const result = buildFoldersJson(input);

    expect(result).toHaveLength(3);
  });

  it("tags each folder with its account name", () => {
    const result = buildFoldersJson(input);

    expect(result[0].account).toBe("iCloud");
  });

  it("includes the folder path", () => {
    const result = buildFoldersJson(input);

    expect(result[0].path).toBe("INBOX");
  });

  it("includes specialUse attribute", () => {
    const result = buildFoldersJson(input);

    expect(result[1].specialUse).toBe("\\Sent");
  });

  it("returns an empty array for empty input", () => {
    const result = buildFoldersJson([]);

    expect(result).toEqual([]);
  });
});

// ── format-thread ─────────────────────────────────────────────────────────────

function makeThreadMsg(overrides = {}) {
  return {
    subject: "Hello",
    date: new Date("2025-01-15T12:00:00Z"),
    from: "a@b.com",
    fromName: "Alice",
    snippet: "Snippet text",
    body: "Full body text",
    ...overrides,
  };
}

describe("formatThreadText", () => {
  it("returns 'No thread messages found.' for empty array", () => {
    expect(formatThreadText([])).toBe("No thread messages found.");
  });

  it("uses subject from last message in thread header", () => {
    const messages = [makeThreadMsg({ subject: "First" }), makeThreadMsg({ subject: "Re: First" })];
    expect(formatThreadText(messages)).toContain("Re: First");
  });

  it("shows singular 'message' when thread has one message", () => {
    expect(formatThreadText([makeThreadMsg()])).toContain("1 message)");
  });

  it("shows plural 'messages' when thread has multiple messages", () => {
    expect(formatThreadText([makeThreadMsg(), makeThreadMsg({ subject: "Re: Hello" })])).toContain("2 messages)");
  });

  it("appends subject-match fallback note when opts.fallback is true", () => {
    expect(formatThreadText([makeThreadMsg()], { fallback: true })).toContain("subject match");
  });

  it("omits fallback note when opts.fallback is false", () => {
    expect(formatThreadText([makeThreadMsg()], { fallback: false })).not.toContain("subject match");
  });

  describe("formats each message with 1-based index", () => {
    const text = formatThreadText([makeThreadMsg(), makeThreadMsg({ subject: "Re: Hello" })]);
    it("includes '  1. ' for the first message", () => expect(text).toContain("  1. "));
    it("includes '  2. ' for the second message", () => expect(text).toContain("  2. "));
  });

  it("shows snippet when opts.full is false", () => {
    expect(formatThreadText([makeThreadMsg({ snippet: "Unique snippet" })], { full: false })).toContain(
      "Unique snippet",
    );
  });

  it("shows full body when opts.full is true", () => {
    expect(formatThreadText([makeThreadMsg({ body: "Unique full body" })], { full: true })).toContain(
      "Unique full body",
    );
  });

  it("uses 'fromName <from>' format when fromName is present", () => {
    expect(formatThreadText([makeThreadMsg({ fromName: "Alice", from: "a@b.com" })])).toContain("Alice <a@b.com>");
  });

  describe("falls back to from address only when fromName is absent", () => {
    const text = formatThreadText([makeThreadMsg({ fromName: undefined, from: "a@b.com" })]);
    it("includes the from address", () => expect(text).toContain("a@b.com"));
    it("does not contain the word 'undefined'", () => expect(text).not.toContain("undefined"));
  });

  it("shows 'unknown' when date is null", () => {
    expect(formatThreadText([makeThreadMsg({ date: null })])).toContain("unknown");
  });
});

describe("buildThreadJson", () => {
  it("includes account field", () => {
    expect(buildThreadJson("iCloud", 3, false, []).account).toBe("iCloud");
  });

  it("includes threadSize field", () => {
    expect(buildThreadJson("iCloud", 3, false, []).threadSize).toBe(3);
  });

  it("includes fallback field", () => {
    expect(buildThreadJson("iCloud", 3, true, []).fallback).toBe(true);
  });

  it("passes messages array through unchanged", () => {
    const messages = [{ subject: "Hello" }];
    expect(buildThreadJson("iCloud", 1, false, messages).messages).toBe(messages);
  });
});

describe("formatThreadOutput", () => {
  const messages = [makeThreadMsg()];
  const results = [{ account: "iCloud", threadSize: 1, fallback: false, messages }];

  it("returns one entry per result", () => {
    const output = formatThreadOutput(false, results, {});
    expect(output).toHaveLength(1);
  });

  it("preserves account name in output entries", () => {
    const output = formatThreadOutput(false, results, {});
    expect(output[0].account).toBe("iCloud");
  });

  it("returns JSON string in JSON mode", () => {
    const output = formatThreadOutput(true, results, {});
    const parsed = JSON.parse(output[0].output);
    expect(parsed.account).toBe("iCloud");
  });

  it("returns text string in text mode", () => {
    const output = formatThreadOutput(false, results, {});

    expect(output[0].output).toContain("Hello");
  });
});

// ── format-inbox ──────────────────────────────────────────────────────────────

function makeInboxMsg(overrides = {}) {
  return {
    account: "iCloud",
    uid: 1,
    date: new Date("2025-01-15T10:30:00Z"),
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Test Subject",
    unread: false,
    mailbox: "INBOX",
    ...overrides,
  };
}

describe("formatInboxText", () => {
  it("shows account name as section header", () => {
    const map = new Map([["iCloud", []]]);
    expect(formatInboxText(map)).toContain("=== iCloud ===");
  });

  it("omits unread count when all messages are read", () => {
    const map = new Map([["iCloud", [makeInboxMsg({ unread: false })]]]);
    expect(formatInboxText(map)).not.toContain("unread");
  });

  it("shows '(no messages)' for empty account", () => {
    const map = new Map([["iCloud", []]]);
    expect(formatInboxText(map)).toContain("(no messages)");
  });

  it("includes UID in each message line", () => {
    const map = new Map([["iCloud", [makeInboxMsg({ uid: 99 })]]]);
    expect(formatInboxText(map)).toContain("UID:99");
  });

  it("includes sender name in each message line", () => {
    const map = new Map([["iCloud", [makeInboxMsg({ fromName: "Alice Smith" })]]]);
    expect(formatInboxText(map)).toContain("Alice Smith");
  });

  it("includes subject in each message", () => {
    const map = new Map([["iCloud", [makeInboxMsg({ subject: "Unique Subject Line" })]]]);
    expect(formatInboxText(map)).toContain("Unique Subject Line");
  });

  it("formats today's messages with time only (HH:MM)", () => {
    const today = new Date();
    today.setHours(10, 30, 0, 0);
    const map = new Map([["iCloud", [makeInboxMsg({ date: today })]]]);
    expect(formatInboxText(map)).toContain("10:30");
  });

  it("formats older messages with month and day", () => {
    const older = new Date(2025, 0, 15, 10, 30);
    const map = new Map([["iCloud", [makeInboxMsg({ date: older })]]]);
    expect(formatInboxText(map)).toContain("Jan");
  });

  describe("handles multiple accounts in sequence", () => {
    const map = new Map([
      ["iCloud", []],
      ["Gmail", []],
    ]);
    const text = formatInboxText(map);

    it("shows the iCloud section header", () => {
      expect(text).toContain("=== iCloud ===");
    });

    it("shows the Gmail section header", () => {
      expect(text).toContain("=== Gmail ===");
    });
  });

  it("uses fromName <from> format when fromName is present", () => {
    const map = new Map([["iCloud", [makeInboxMsg({ fromName: "Alice", from: "alice@example.com" })]]]);
    expect(formatInboxText(map)).toContain("Alice <alice@example.com>");
  });

  it("uses address only when fromName is absent", () => {
    const map = new Map([["iCloud", [makeInboxMsg({ fromName: "", from: "bare@example.com" })]]]);
    expect(formatInboxText(map)).toContain("bare@example.com");
  });
});

describe("buildInboxJson", () => {
  const date = new Date("2025-01-15T10:30:00Z");
  const msg = makeInboxMsg({ uid: 42, date, subject: "Hello" });
  const result = buildInboxJson([msg]);

  it("returns one entry per message", () => {
    expect(result).toHaveLength(1);
  });

  it("serializes date as ISO string", () => {
    expect(result[0].date).toBe("2025-01-15T10:30:00.000Z");
  });

  it("preserves uid", () => {
    expect(result[0].uid).toBe(42);
  });

  it("preserves subject", () => {
    expect(result[0].subject).toBe("Hello");
  });

  it("preserves unread flag", () => {
    expect(result[0].unread).toBe(false);
  });
});

// ── format-contacts ───────────────────────────────────────────────────────────

function makeContact(overrides = {}) {
  return {
    address: "alice@example.com",
    name: "Alice",
    count: 3,
    lastSeen: new Date(2026, 0, 15),
    direction: "received",
    ...overrides,
  };
}

describe("formatContactsText", () => {
  it("includes sinceLabel in the header", () => {
    expect(formatContactsText([makeContact()], { sinceLabel: "last 6 months" })).toContain("last 6 months");
  });

  it("includes contact count in the header", () => {
    const contacts = [makeContact(), makeContact({ address: "bob@example.com" })];
    expect(formatContactsText(contacts, { sinceLabel: "last 3 months" })).toContain("2 found");
  });

  it("formats contact with name as 'Name <address>'", () => {
    expect(
      formatContactsText([makeContact({ name: "Alice", address: "alice@example.com" })], { sinceLabel: "x" }),
    ).toContain("Alice <alice@example.com>");
  });

  describe("formats contact without name as address only", () => {
    const text = formatContactsText([makeContact({ name: "", address: "bare@example.com" })], { sinceLabel: "x" });
    it("includes the address", () => expect(text).toContain("bare@example.com"));
    it("does not wrap the address in angle brackets", () => expect(text).not.toContain("<bare@example.com>"));
  });

  it("shows message count per contact", () => {
    expect(formatContactsText([makeContact({ count: 7 })], { sinceLabel: "x" })).toContain("7 msgs");
  });

  it("shows 'recv' direction for received-only contacts", () => {
    expect(formatContactsText([makeContact({ direction: "received" })], { sinceLabel: "x" })).toContain("recv");
  });

  it("shows 'sent' direction for sent-only contacts", () => {
    expect(formatContactsText([makeContact({ direction: "sent" })], { sinceLabel: "x" })).toContain("sent");
  });

  it("shows 'both' direction for bidirectional contacts", () => {
    expect(formatContactsText([makeContact({ direction: "both" })], { sinceLabel: "x" })).toContain("both");
  });

  it("shows last-seen date in month+day format", () => {
    const contact = makeContact({ lastSeen: new Date(2025, 0, 15) });
    expect(formatContactsText([contact], { sinceLabel: "x" })).toContain("Jan");
  });

  it("numbers contacts starting from 1", () => {
    expect(formatContactsText([makeContact()], { sinceLabel: "x" })).toContain("1. ");
  });
});

describe("buildContactsJson", () => {
  const lastSeen = new Date("2026-01-15T00:00:00Z");
  const contact = makeContact({ lastSeen });
  const result = buildContactsJson([contact], { sinceLabel: "last 6 months" });

  it("includes sinceLabel", () => {
    expect(result.sinceLabel).toBe("last 6 months");
  });

  it("includes contacts array", () => {
    expect(result.contacts).toHaveLength(1);
  });

  it("serializes lastSeen as ISO string", () => {
    expect(result.contacts[0].lastSeen).toBe("2026-01-15T00:00:00.000Z");
  });

  it("preserves address", () => {
    expect(result.contacts[0].address).toBe("alice@example.com");
  });

  it("preserves direction", () => {
    expect(result.contacts[0].direction).toBe("received");
  });
});

// ── format-attachment ─────────────────────────────────────────────────────────

describe("formatAttachmentListText", () => {
  it("returns 'No attachments.' for an empty array", () => {
    const text = formatAttachmentListText([]);

    expect(text).toBe("No attachments.");
  });

  it("shows the index for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("[0]");
  });

  it("shows the filename for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("invoice.pdf");
  });

  it("shows the content type for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("application/pdf");
  });

  it("shows the size in bytes for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("12345 bytes");
  });

  it("uses double-space separators between fields", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("invoice.pdf  application/pdf  12345 bytes");
  });

  it("shows multiple lines for multiple entries", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
      { index: 1, filename: "receipt.png", contentType: "image/png", size: 6789, part: "2" },
    ]);

    expect(text).toContain("\n");
  });
});

describe("formatAttachmentSavedText", () => {
  it("returns the path string as-is", () => {
    const text = formatAttachmentSavedText("/tmp/invoice.pdf");

    expect(text).toBe("/tmp/invoice.pdf");
  });
});

describe("buildAttachmentListJson", () => {
  const attachments = [{ index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" }];
  const result = buildAttachmentListJson({ account: "iCloud", uid: 42, attachments });

  it("includes account", () => {
    expect(result.account).toBe("iCloud");
  });

  it("includes uid", () => {
    expect(result.uid).toBe(42);
  });

  it("includes attachments array", () => {
    expect(result.attachments).toBe(attachments);
  });
});

describe("buildAttachmentSavedJson", () => {
  const saved = { path: "/tmp/invoice.pdf", filename: "invoice.pdf", size: 12345, contentType: "application/pdf" };
  const result = buildAttachmentSavedJson(saved);

  it("includes path", () => {
    expect(result.path).toBe("/tmp/invoice.pdf");
  });

  it("includes filename", () => {
    expect(result.filename).toBe("invoice.pdf");
  });

  it("includes size", () => {
    expect(result.size).toBe(12345);
  });

  it("includes contentType", () => {
    expect(result.contentType).toBe("application/pdf");
  });
});

describe("formatAttachmentOutput", () => {
  const attachments = [{ index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" }];
  const listResult = { list: true, account: "iCloud", uid: 42, attachments };
  const savedResult = {
    path: "/tmp/invoice.pdf",
    filename: "invoice.pdf",
    size: 12345,
    contentType: "application/pdf",
  };

  it("returns JSON listing in JSON mode when list is true", () => {
    const output = JSON.parse(formatAttachmentOutput(true, listResult));
    expect(output).toHaveProperty("attachments");
  });

  it("returns text listing in text mode when list is true", () => {
    const output = formatAttachmentOutput(false, listResult);
    expect(output).toContain("invoice.pdf");
  });

  it("returns JSON saved result in JSON mode when list is falsy", () => {
    const output = JSON.parse(formatAttachmentOutput(true, savedResult));
    expect(output.path).toBe("/tmp/invoice.pdf");
  });

  it("returns path text in text mode when list is falsy", () => {
    const output = formatAttachmentOutput(false, savedResult);
    expect(output).toBe("/tmp/invoice.pdf");
  });
});
