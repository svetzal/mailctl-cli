import { describe, expect, it } from "bun:test";
import {
  BILLING_SENDER_PATTERNS,
  RECEIPT_SUBJECT_EXCLUSIONS,
  RECEIPT_SUBJECT_TERMS,
  stripVendorSuffixes,
} from "../src/receipt-terms.js";

describe("RECEIPT_SUBJECT_TERMS", () => {
  describe("is a non-empty array", () => {
    it("is an array", () => {
      expect(Array.isArray(RECEIPT_SUBJECT_TERMS)).toBe(true);
    });

    it("has at least one entry", () => {
      expect(RECEIPT_SUBJECT_TERMS.length).toBeGreaterThan(0);
    });
  });

  describe("contains only lowercase strings", () => {
    it("every entry is a string", () => {
      for (const term of RECEIPT_SUBJECT_TERMS) {
        expect(typeof term).toBe("string");
      }
    });

    it("every entry is already lowercase", () => {
      for (const term of RECEIPT_SUBJECT_TERMS) {
        expect(term).toBe(term.toLowerCase());
      }
    });
  });

  it("contains no duplicates", () => {
    const unique = new Set(RECEIPT_SUBJECT_TERMS);
    expect(unique.size).toBe(RECEIPT_SUBJECT_TERMS.length);
  });

  describe("includes terms from both the scan and download lists", () => {
    it("includes 'order confirmation' from the old scan list", () => {
      expect(RECEIPT_SUBJECT_TERMS).toContain("order confirmation");
    });

    it("includes 'billing statement' from the old scan list", () => {
      expect(RECEIPT_SUBJECT_TERMS).toContain("billing statement");
    });

    it("includes 'payment processed' from the old download list", () => {
      expect(RECEIPT_SUBJECT_TERMS).toContain("payment processed");
    });

    it("includes 'subscription' from the old download list", () => {
      expect(RECEIPT_SUBJECT_TERMS).toContain("subscription");
    });
  });
});

describe("RECEIPT_SUBJECT_EXCLUSIONS", () => {
  describe("is a non-empty array", () => {
    it("is an array", () => {
      expect(Array.isArray(RECEIPT_SUBJECT_EXCLUSIONS)).toBe(true);
    });

    it("has at least one entry", () => {
      expect(RECEIPT_SUBJECT_EXCLUSIONS.length).toBeGreaterThan(0);
    });
  });

  it("contains only RegExp instances", () => {
    for (const pattern of RECEIPT_SUBJECT_EXCLUSIONS) {
      expect(pattern instanceof RegExp).toBe(true);
    }
  });
});

describe("BILLING_SENDER_PATTERNS", () => {
  describe("is a non-empty array", () => {
    it("is an array", () => {
      expect(Array.isArray(BILLING_SENDER_PATTERNS)).toBe(true);
    });

    it("has at least one entry", () => {
      expect(BILLING_SENDER_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  it("contains only strings", () => {
    for (const pattern of BILLING_SENDER_PATTERNS) {
      expect(typeof pattern).toBe("string");
    }
  });
});

describe("stripVendorSuffixes", () => {
  it("strips Inc suffix", () => {
    expect(stripVendorSuffixes("Acme Inc")).toBe("Acme");
  });

  it("strips via Stripe", () => {
    expect(stripVendorSuffixes("Foo via Stripe")).toBe("Foo");
  });

  it("strips LLC suffix", () => {
    expect(stripVendorSuffixes("Widgets LLC")).toBe("Widgets");
  });

  it("strips via Clover", () => {
    expect(stripVendorSuffixes("Bar via Clover")).toBe("Bar");
  });

  it("leaves a plain name unchanged", () => {
    expect(stripVendorSuffixes("GitHub")).toBe("GitHub");
  });
});
