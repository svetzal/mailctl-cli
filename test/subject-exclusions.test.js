import { describe, it, expect } from "bun:test";
import { RECEIPT_SUBJECT_EXCLUSIONS } from "../src/download-receipts.js";

function isExcluded(subject) {
  return RECEIPT_SUBJECT_EXCLUSIONS.some(re => re.test(subject));
}

describe("RECEIPT_SUBJECT_EXCLUSIONS", () => {
  describe("excludes non-invoice subjects", () => {
    it("excludes 'approaching' subjects", () => {
      expect(isExcluded("Payment date for your annual All Products Pack subscription(s) is approaching")).toBe(true);
    });

    it("excludes pre-order subjects", () => {
      expect(isExcluded("Thank you for your pre-order")).toBe(true);
    });

    it("excludes free trial conversion subjects", () => {
      expect(isExcluded("Your free trial will convert to a paid subscription")).toBe(true);
    });

    it("excludes 'you've got N credits' subjects", () => {
      expect(isExcluded("You've got 3 credits!")).toBe(true);
    });

    it("excludes 'you've got 4 credits' subjects", () => {
      expect(isExcluded("You've got 4 credits!")).toBe(true);
    });

    it("excludes 'sent in error' subjects", () => {
      expect(isExcluded("We sent that in error")).toBe(true);
    });
  });

  describe("does not exclude real invoice subjects", () => {
    it("keeps 'Your invoice for January 2026'", () => {
      expect(isExcluded("Your invoice for January 2026")).toBe(false);
    });

    it("keeps 'Receipt for your purchase'", () => {
      expect(isExcluded("Receipt for your purchase")).toBe(false);
    });

    it("keeps 'Thanks, your order is complete'", () => {
      expect(isExcluded("Thanks, your order is complete")).toBe(false);
    });

    it("keeps 'Payment confirmation'", () => {
      expect(isExcluded("Payment confirmation")).toBe(false);
    });

    it("keeps 'Your subscription renewal'", () => {
      expect(isExcluded("Your subscription renewal")).toBe(false);
    });
  });
});
