import { describe, expect, it } from "bun:test";
import { applyReceiptFilters } from "../src/receipt-filters.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMsg(overrides = {}) {
  return {
    uid: 1,
    messageId: "msg@example.com",
    fromAddress: "billing@acme.com",
    fromName: "Acme Corp",
    subject: "Invoice #123",
    ...overrides,
  };
}

/** Simple vendor matcher: checks if vendorFilter appears in fromAddress or fromName. */
function matchesVendor(vendor, fromAddress, fromName) {
  const v = vendor.toLowerCase();
  return fromAddress.toLowerCase().includes(v) || fromName.toLowerCase().includes(v);
}

const NO_EXCLUSIONS = [];
const SOME_EXCLUSIONS = [/payment date/i, /approaching/i];

// ── applyReceiptFilters ───────────────────────────────────────────────────────

describe("applyReceiptFilters", () => {
  it("returns all results unchanged when no vendor filter and no exclusions", () => {
    const results = [makeMsg(), makeMsg({ uid: 2, messageId: "msg2@example.com" })];
    const { filtered, vendorExcluded, subjectExcluded } = applyReceiptFilters(
      results,
      {},
      matchesVendor,
      NO_EXCLUSIONS,
    );
    expect(filtered).toHaveLength(2);
    expect(vendorExcluded).toBe(0);
    expect(subjectExcluded).toBe(0);
  });

  it("filters messages not matching the vendor", () => {
    const results = [
      makeMsg({ fromAddress: "billing@acme.com", fromName: "Acme" }),
      makeMsg({ uid: 2, messageId: "msg2@example.com", fromAddress: "noreply@github.com", fromName: "GitHub" }),
    ];
    const { filtered, vendorExcluded } = applyReceiptFilters(results, { vendor: "acme" }, matchesVendor, NO_EXCLUSIONS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fromName).toBe("Acme");
    expect(vendorExcluded).toBe(1);
  });

  it("passes all messages when vendor filter matches all", () => {
    const results = [
      makeMsg({ fromAddress: "billing@acme.com" }),
      makeMsg({ uid: 2, messageId: "msg2@example.com", fromAddress: "noreply@acme.com" }),
    ];
    const { filtered, vendorExcluded } = applyReceiptFilters(results, { vendor: "acme" }, matchesVendor, NO_EXCLUSIONS);
    expect(filtered).toHaveLength(2);
    expect(vendorExcluded).toBe(0);
  });

  it("excludes messages matching subject exclusion patterns", () => {
    const results = [
      makeMsg({ subject: "Invoice #123" }),
      makeMsg({ uid: 2, messageId: "msg2@example.com", subject: "Payment date approaching" }),
    ];
    const { filtered, subjectExcluded } = applyReceiptFilters(results, {}, matchesVendor, SOME_EXCLUSIONS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].subject).toBe("Invoice #123");
    expect(subjectExcluded).toBe(1);
  });

  it("applies vendor filter before subject exclusions", () => {
    const results = [
      makeMsg({ fromAddress: "billing@acme.com", fromName: "Acme", subject: "Invoice #123" }),
      makeMsg({
        uid: 2,
        messageId: "msg2@example.com",
        fromAddress: "noreply@github.com",
        fromName: "GitHub",
        subject: "Payment date approaching",
      }),
      makeMsg({
        uid: 3,
        messageId: "msg3@example.com",
        fromAddress: "billing@acme.com",
        fromName: "Acme",
        subject: "Payment date approaching",
      }),
    ];
    const { filtered, vendorExcluded, subjectExcluded } = applyReceiptFilters(
      results,
      { vendor: "acme" },
      matchesVendor,
      SOME_EXCLUSIONS,
    );
    // GitHub filtered by vendor; acme "Payment date" filtered by subject
    expect(filtered).toHaveLength(1);
    expect(filtered[0].subject).toBe("Invoice #123");
    expect(vendorExcluded).toBe(1);
    expect(subjectExcluded).toBe(1);
  });

  it("returns empty array when all results are excluded", () => {
    const results = [makeMsg({ subject: "Payment date approaching" })];
    const { filtered, subjectExcluded } = applyReceiptFilters(results, {}, matchesVendor, SOME_EXCLUSIONS);
    expect(filtered).toHaveLength(0);
    expect(subjectExcluded).toBe(1);
  });

  it("does not apply vendor filter when opts.vendor is undefined", () => {
    const results = [makeMsg({ fromAddress: "billing@acme.com" })];
    const { filtered, vendorExcluded } = applyReceiptFilters(results, {}, matchesVendor, NO_EXCLUSIONS);
    expect(filtered).toHaveLength(1);
    expect(vendorExcluded).toBe(0);
  });

  it("does not apply vendor filter when opts.vendor is null", () => {
    const results = [makeMsg({ fromAddress: "billing@acme.com" })];
    const { filtered, vendorExcluded } = applyReceiptFilters(results, { vendor: null }, matchesVendor, NO_EXCLUSIONS);
    expect(filtered).toHaveLength(1);
    expect(vendorExcluded).toBe(0);
  });
});
