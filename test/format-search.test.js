import { describe, expect, it } from "bun:test";
import { formatSearchResultsText } from "../src/format-search.js";

describe("formatSearchResultsText", () => {
  const result = {
    mailbox: "INBOX",
    uid: 42,
    date: "2026-01-15",
    fromName: "Alice",
    from: "alice@example.com",
    subject: "Hello there",
  };

  it("formats a single result correctly", () => {
    const text = formatSearchResultsText([result]);

    expect(text).toContain("[INBOX]");
    expect(text).toContain("UID:42");
    expect(text).toContain("2026-01-15");
    expect(text).toContain("Alice");
    expect(text).toContain("alice@example.com");
    expect(text).toContain("Hello there");
  });

  it("formats multiple results, one per line", () => {
    const second = { ...result, uid: 99, mailbox: "Sent", subject: "Re: Hello" };
    const text = formatSearchResultsText([result, second]);

    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("INBOX");
    expect(lines[1]).toContain("Sent");
  });

  it("returns an empty string when results array is empty", () => {
    expect(formatSearchResultsText([])).toBe("");
  });

  it("handles missing fromName gracefully", () => {
    const noName = { ...result, fromName: undefined };
    const text = formatSearchResultsText([noName]);

    expect(text).toContain("<alice@example.com>");
  });

  it("handles missing from address gracefully", () => {
    const noFrom = { ...result, from: undefined };
    const text = formatSearchResultsText([noFrom]);

    // Should not throw and should still contain the other fields
    expect(text).toContain("[INBOX]");
    expect(text).toContain("Hello there");
  });

  it("handles missing subject gracefully", () => {
    const noSubject = { ...result, subject: undefined };
    const text = formatSearchResultsText([noSubject]);

    expect(text).toContain("[INBOX]");
  });

  it("handles missing date gracefully", () => {
    const noDate = { ...result, date: undefined };
    const text = formatSearchResultsText([noDate]);

    expect(text).toContain("[INBOX]");
    expect(text).toContain("UID:42");
  });
});
