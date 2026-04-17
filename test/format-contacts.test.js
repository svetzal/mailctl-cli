import { describe, expect, it } from "bun:test";
import { buildContactsJson, formatContactsText } from "../src/format-contacts.js";

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

// ── formatContactsText ────────────────────────────────────────────────────────

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

  it("formats contact without name as address only", () => {
    const text = formatContactsText([makeContact({ name: "", address: "bare@example.com" })], { sinceLabel: "x" });
    expect(text).toContain("bare@example.com");
    expect(text).not.toContain("<bare@example.com>");
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

// ── buildContactsJson ─────────────────────────────────────────────────────────

describe("buildContactsJson", () => {
  it("returns input array unchanged", () => {
    const contacts = [{ address: "alice@example.com", name: "Alice", count: 5 }];
    expect(buildContactsJson(contacts)).toBe(contacts);
  });
});
