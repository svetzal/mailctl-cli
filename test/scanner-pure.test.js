import { describe, expect, it } from "bun:test";

// Import aggregateBySender with a cache-busting query to bypass mock.module
// contamination from scan-command.test.js which mocks "../src/scanner.js".
const { aggregateBySender } = await import(`../src/scanner.js?t=${Date.now()}`);

describe("aggregateBySender", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateBySender([])).toEqual([]);
  });

  describe("returns a single sender entry for a single result", () => {
    const results = [
      {
        address: "billing@acme.com",
        name: "Acme Billing",
        account: "personal",
        subject: "Your receipt",
        date: new Date("2025-01-01"),
      },
    ];
    const senders = aggregateBySender(results);

    it("has one sender", () => {
      expect(senders.length).toBe(1);
    });

    it("sender address is correct", () => {
      expect(senders[0].address).toBe("billing@acme.com");
    });

    it("sender count is 1", () => {
      expect(senders[0].count).toBe(1);
    });
  });

  describe("aggregates multiple results from the same address into one entry", () => {
    const results = [
      {
        address: "billing@acme.com",
        name: "Acme",
        account: "work",
        subject: "Invoice 1",
        date: new Date("2025-01-01"),
      },
      {
        address: "billing@acme.com",
        name: "Acme",
        account: "work",
        subject: "Invoice 2",
        date: new Date("2025-02-01"),
      },
    ];
    const senders = aggregateBySender(results);

    it("collapses to one sender entry", () => {
      expect(senders.length).toBe(1);
    });

    it("count reflects both results", () => {
      expect(senders[0].count).toBe(2);
    });
  });

  describe("collects unique accounts across results for the same sender", () => {
    const results = [
      { address: "billing@acme.com", name: "Acme", account: "personal", subject: "Inv1", date: new Date() },
      { address: "billing@acme.com", name: "Acme", account: "work", subject: "Inv2", date: new Date() },
    ];
    const senders = aggregateBySender(results);

    it("accounts includes personal", () => {
      expect(senders[0].accounts).toContain("personal");
    });

    it("accounts includes work", () => {
      expect(senders[0].accounts).toContain("work");
    });
  });

  it("caps sampleSubjects at 3 entries", () => {
    const results = Array.from({ length: 5 }, (_, i) => ({
      address: "billing@acme.com",
      name: "Acme",
      account: "personal",
      subject: `Invoice ${i + 1}`,
      date: new Date(),
    }));
    const senders = aggregateBySender(results);
    expect(senders[0].sampleSubjects.length).toBeLessThanOrEqual(3);
  });

  it("tracks the latest date across results for the same sender", () => {
    const earlier = new Date("2025-01-01");
    const later = new Date("2025-06-15");
    const results = [
      { address: "billing@acme.com", name: "Acme", account: "work", subject: "Old", date: earlier },
      { address: "billing@acme.com", name: "Acme", account: "work", subject: "New", date: later },
    ];
    const senders = aggregateBySender(results);
    expect(senders[0].latestDate).toEqual(later);
  });

  it("updates sender name to match most recent result", () => {
    const results = [
      { address: "billing@acme.com", name: "Acme Old", account: "work", subject: "Old", date: new Date("2025-01-01") },
      { address: "billing@acme.com", name: "Acme New", account: "work", subject: "New", date: new Date("2025-06-01") },
    ];
    const senders = aggregateBySender(results);
    expect(senders[0].name).toBe("Acme New");
  });

  describe("sorts senders by count descending", () => {
    const results = [
      { address: "rare@example.com", name: "Rare", account: "a", subject: "S1", date: new Date() },
      { address: "common@example.com", name: "Common", account: "a", subject: "S2", date: new Date() },
      { address: "common@example.com", name: "Common", account: "a", subject: "S3", date: new Date() },
      { address: "common@example.com", name: "Common", account: "a", subject: "S4", date: new Date() },
    ];
    const senders = aggregateBySender(results);

    it("first sender is the common one", () => {
      expect(senders[0].address).toBe("common@example.com");
    });

    it("second sender is the rare one", () => {
      expect(senders[1].address).toBe("rare@example.com");
    });
  });

  describe("returns arrays (not Sets) in the output objects", () => {
    const results = [{ address: "billing@acme.com", name: "Acme", account: "work", subject: "Inv", date: new Date() }];
    const senders = aggregateBySender(results);

    it("accounts is an Array", () => {
      expect(Array.isArray(senders[0].accounts)).toBe(true);
    });

    it("sampleSubjects is an Array", () => {
      expect(Array.isArray(senders[0].sampleSubjects)).toBe(true);
    });
  });
});
