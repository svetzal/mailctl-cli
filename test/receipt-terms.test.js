import { describe, expect, it } from "bun:test";
import { BILLING_SENDER_PATTERNS, RECEIPT_SUBJECT_EXCLUSIONS, RECEIPT_SUBJECT_TERMS } from "../src/receipt-terms.js";

describe("RECEIPT_SUBJECT_TERMS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(RECEIPT_SUBJECT_TERMS)).toBe(true);
    expect(RECEIPT_SUBJECT_TERMS.length).toBeGreaterThan(0);
  });

  it("contains only lowercase strings", () => {
    for (const term of RECEIPT_SUBJECT_TERMS) {
      expect(typeof term).toBe("string");
      expect(term).toBe(term.toLowerCase());
    }
  });

  it("contains no duplicates", () => {
    const unique = new Set(RECEIPT_SUBJECT_TERMS);
    expect(unique.size).toBe(RECEIPT_SUBJECT_TERMS.length);
  });

  it("includes terms from both the scan and download lists", () => {
    // From the old scan list (imap-client.js)
    expect(RECEIPT_SUBJECT_TERMS).toContain("order confirmation");
    expect(RECEIPT_SUBJECT_TERMS).toContain("billing statement");
    // From the old download list (download-receipts.js)
    expect(RECEIPT_SUBJECT_TERMS).toContain("payment processed");
    expect(RECEIPT_SUBJECT_TERMS).toContain("subscription");
  });
});

describe("RECEIPT_SUBJECT_EXCLUSIONS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(RECEIPT_SUBJECT_EXCLUSIONS)).toBe(true);
    expect(RECEIPT_SUBJECT_EXCLUSIONS.length).toBeGreaterThan(0);
  });

  it("contains only RegExp instances", () => {
    for (const pattern of RECEIPT_SUBJECT_EXCLUSIONS) {
      expect(pattern instanceof RegExp).toBe(true);
    }
  });
});

describe("BILLING_SENDER_PATTERNS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(BILLING_SENDER_PATTERNS)).toBe(true);
    expect(BILLING_SENDER_PATTERNS.length).toBeGreaterThan(0);
  });

  it("contains only strings", () => {
    for (const pattern of BILLING_SENDER_PATTERNS) {
      expect(typeof pattern).toBe("string");
    }
  });
});
