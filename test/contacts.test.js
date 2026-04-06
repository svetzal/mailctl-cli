import { describe, expect, it } from "bun:test";
import { aggregateContacts } from "../src/contacts.js";

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
