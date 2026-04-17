import { describe, expect, it } from "bun:test";
import { buildInboxJson, formatInboxText } from "../src/format-inbox.js";

function makeMsg(overrides = {}) {
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

// ── formatInboxText ───────────────────────────────────────────────────────────

describe("formatInboxText", () => {
  it("shows account name as section header", () => {
    const map = new Map([["iCloud", []]]);
    expect(formatInboxText(map)).toContain("=== iCloud ===");
  });

  it("omits unread count when all messages are read", () => {
    const map = new Map([["iCloud", [makeMsg({ unread: false })]]]);
    expect(formatInboxText(map)).not.toContain("unread");
  });

  it("shows '(no messages)' for empty account", () => {
    const map = new Map([["iCloud", []]]);
    expect(formatInboxText(map)).toContain("(no messages)");
  });

  it("includes UID in each message line", () => {
    const map = new Map([["iCloud", [makeMsg({ uid: 99 })]]]);
    expect(formatInboxText(map)).toContain("UID:99");
  });

  it("includes sender name in each message line", () => {
    const map = new Map([["iCloud", [makeMsg({ fromName: "Alice Smith" })]]]);
    expect(formatInboxText(map)).toContain("Alice Smith");
  });

  it("includes subject in each message", () => {
    const map = new Map([["iCloud", [makeMsg({ subject: "Unique Subject Line" })]]]);
    expect(formatInboxText(map)).toContain("Unique Subject Line");
  });

  it("formats today's messages with time only (HH:MM)", () => {
    const today = new Date();
    today.setHours(10, 30, 0, 0);
    const map = new Map([["iCloud", [makeMsg({ date: today })]]]);
    expect(formatInboxText(map)).toContain("10:30");
  });

  it("formats older messages with month and day", () => {
    const older = new Date(2025, 0, 15, 10, 30);
    const map = new Map([["iCloud", [makeMsg({ date: older })]]]);
    expect(formatInboxText(map)).toContain("Jan");
  });

  it("handles multiple accounts in sequence", () => {
    const map = new Map([
      ["iCloud", []],
      ["Gmail", []],
    ]);
    const text = formatInboxText(map);
    expect(text).toContain("=== iCloud ===");
    expect(text).toContain("=== Gmail ===");
  });

  it("uses fromName <from> format when fromName is present", () => {
    const map = new Map([["iCloud", [makeMsg({ fromName: "Alice", from: "alice@example.com" })]]]);
    expect(formatInboxText(map)).toContain("Alice <alice@example.com>");
  });

  it("uses address only when fromName is absent", () => {
    const map = new Map([["iCloud", [makeMsg({ fromName: "", from: "bare@example.com" })]]]);
    expect(formatInboxText(map)).toContain("bare@example.com");
  });
});

// ── buildInboxJson ────────────────────────────────────────────────────────────

describe("buildInboxJson", () => {
  it("returns input array unchanged", () => {
    const input = [{ uid: 1, subject: "Hello", account: "iCloud" }];
    expect(buildInboxJson(input)).toBe(input);
  });
});
