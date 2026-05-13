import { describe, expect, it } from "bun:test";
import { buildSearchJson, formatSearchText } from "../src/format-search.js";

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

// ── buildSearchJson ────────────────────────────────────────────────────────────

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
