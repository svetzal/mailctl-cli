import { describe, expect, it } from "bun:test";
import {
  buildReprocessedSidecar,
  classifyReceiptExtraction,
  classifyReprocessResult,
  isEmptyExtraction,
  MIN_INVOICE_CONFIDENCE,
  sidecarPassesFilters,
} from "../src/receipt-decisions.js";

// ── isEmptyExtraction ─────────────────────────────────────────────────────────

describe("isEmptyExtraction", () => {
  it("returns false when a PDF attachment is present", () => {
    const metadata = { amount: null, invoice_number: null };
    const pdfAttachments = [{ content: Buffer.from("%PDF") }];
    expect(isEmptyExtraction(metadata, pdfAttachments)).toBe(false);
  });

  it("returns false when amount is present", () => {
    const metadata = { amount: 49.99, invoice_number: null };
    expect(isEmptyExtraction(metadata, [])).toBe(false);
  });

  it("returns false when invoice_number is present", () => {
    const metadata = { amount: null, invoice_number: "INV-001" };
    expect(isEmptyExtraction(metadata, [])).toBe(false);
  });

  it("returns true when no PDF, no amount, and no invoice_number", () => {
    const metadata = { amount: null, invoice_number: null };
    expect(isEmptyExtraction(metadata, [])).toBe(true);
  });
});

// ── classifyReceiptExtraction ─────────────────────────────────────────────────

const BASE_METADATA = {
  is_invoice: true,
  confidence: 0.9,
  vendor: "Acme",
  invoice_number: null,
  amount: 99,
};
const EMPTY_INVOICE_NUMBERS = new Set();

describe("classifyReceiptExtraction", () => {
  it("returns skipNonInvoice when is_invoice is false", () => {
    const metadata = { ...BASE_METADATA, is_invoice: false };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.event).toBe("skipNonInvoice");
  });

  it("returns action skipped for skipNonInvoice", () => {
    const metadata = { ...BASE_METADATA, is_invoice: false };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.action).toBe("skipped");
  });

  it("carries vendor in skipNonInvoice result", () => {
    const metadata = { ...BASE_METADATA, is_invoice: false, vendor: "TestVendor" };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.vendor).toBe("TestVendor");
  });

  it("returns skipLowConfidence when confidence is below threshold", () => {
    const metadata = { ...BASE_METADATA, confidence: 0.1 };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.event).toBe("skipLowConfidence");
  });

  it("returns action skipped for skipLowConfidence", () => {
    const metadata = { ...BASE_METADATA, confidence: 0.1 };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.action).toBe("skipped");
  });

  it("returns skipExistingInvoice when invoice_number is already in set", () => {
    const metadata = { ...BASE_METADATA, invoice_number: "INV-001" };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: new Set(["INV-001"]),
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.event).toBe("skipExistingInvoice");
  });

  it("returns action duplicate for skipExistingInvoice", () => {
    const metadata = { ...BASE_METADATA, invoice_number: "INV-001" };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: new Set(["INV-001"]),
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.action).toBe("duplicate");
  });

  it("carries invoice_number in skipExistingInvoice result", () => {
    const metadata = { ...BASE_METADATA, invoice_number: "INV-001" };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: new Set(["INV-001"]),
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.invoice_number).toBe("INV-001");
  });

  it("returns emptyExtractionSkipped when extraction is empty and includeEmpty is false", () => {
    const metadata = { ...BASE_METADATA, amount: null, invoice_number: null };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.event).toBe("emptyExtractionSkipped");
  });

  it("returns action skippedEmpty for empty extraction", () => {
    const metadata = { ...BASE_METADATA, amount: null, invoice_number: null };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.action).toBe("skippedEmpty");
  });

  it("returns proceed when includeEmpty is true even for empty extraction", () => {
    const metadata = { ...BASE_METADATA, amount: null, invoice_number: null };
    const result = classifyReceiptExtraction(metadata, [], {
      includeEmpty: true,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.action).toBe("proceed");
  });

  it("returns proceed for a normal invoice with all checks passing", () => {
    const result = classifyReceiptExtraction(BASE_METADATA, [], {
      includeEmpty: false,
      existingInvoiceNumbers: EMPTY_INVOICE_NUMBERS,
      minConfidence: MIN_INVOICE_CONFIDENCE,
    });
    expect(result.action).toBe("proceed");
  });
});

// ── sidecarPassesFilters ──────────────────────────────────────────────────────

describe("sidecarPassesFilters", () => {
  it("returns true when no filters are active", () => {
    const sidecar = { vendor: "Stripe", date: "2026-01-15" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: null, sinceDate: null })).toBe(true);
  });

  it("returns true when vendor matches the filter (case-insensitive)", () => {
    const sidecar = { vendor: "Stripe", date: "2026-01-15" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: "stripe", sinceDate: null })).toBe(true);
  });

  it("returns false when vendor does not match the filter", () => {
    const sidecar = { vendor: "GitHub", date: "2026-01-15" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: "stripe", sinceDate: null })).toBe(false);
  });

  it("returns true when sidecar has no vendor and vendor filter is set", () => {
    const sidecar = { date: "2026-01-15" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: "stripe", sinceDate: null })).toBe(true);
  });

  it("returns false when sidecar date is older than sinceDate", () => {
    const sidecar = { vendor: "Stripe", date: "2025-12-01" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: null, sinceDate: new Date("2026-01-01") })).toBe(false);
  });

  it("returns true when sidecar date is newer than sinceDate", () => {
    const sidecar = { vendor: "Stripe", date: "2026-03-01" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: null, sinceDate: new Date("2026-01-01") })).toBe(true);
  });

  it("returns true when sidecar date is invalid (NaN guard)", () => {
    const sidecar = { vendor: "Stripe", date: "not-a-date" };
    expect(sidecarPassesFilters(sidecar, { vendorFilter: null, sinceDate: new Date("2026-01-01") })).toBe(true);
  });
});

// ── buildReprocessedSidecar ───────────────────────────────────────────────────

describe("buildReprocessedSidecar", () => {
  const ORIGINAL_SIDECAR = {
    source_account: "personal",
    email_uid: 42,
    receipt_file: "Stripe-INV-001.pdf",
    source_body_snippet: "original body",
    downloadedAt: "2026-01-01T00:00:00Z",
  };

  const METADATA = {
    vendor: "Stripe",
    amount: 49,
    invoice_number: "INV-001",
    is_invoice: true,
    confidence: 0.9,
  };

  it("sets reprocessedAt to the injected value", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.reprocessedAt).toBe("2026-03-01T12:00:00Z");
  });

  it("preserves source_account from original sidecar", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.source_account).toBe("personal");
  });

  it("preserves email_uid from original sidecar", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.email_uid).toBe(42);
  });

  it("preserves receipt_file from original sidecar", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.receipt_file).toBe("Stripe-INV-001.pdf");
  });

  it("preserves source_body_snippet from original sidecar", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.source_body_snippet).toBe("original body");
  });

  it("preserves downloadedAt from original sidecar", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.downloadedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("includes fresh extraction fields like vendor and amount", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");
    expect(result.vendor).toBe("Stripe");
    expect(result.amount).toBe(49);
  });

  it("sets source_body_snippet to null when missing from both sidecar and metadata", () => {
    const sidecar = { ...ORIGINAL_SIDECAR, source_body_snippet: undefined };
    const result = buildReprocessedSidecar(METADATA, sidecar, "2026-03-01T12:00:00Z");
    expect(result.source_body_snippet).toBeNull();
  });
});

// ── classifyReprocessResult ───────────────────────────────────────────────────

describe("classifyReprocessResult", () => {
  it("returns noData when metadata is null", () => {
    const result = classifyReprocessResult(null);
    expect(result.action).toBe("noData");
  });

  it("returns noData when metadata is undefined", () => {
    const result = classifyReprocessResult(undefined);
    expect(result.action).toBe("noData");
  });

  it("returns reclassified when is_invoice is false", () => {
    const result = classifyReprocessResult({ is_invoice: false, vendor: "Acme" });
    expect(result.action).toBe("reclassified");
  });

  it("returns update for a valid invoice", () => {
    const result = classifyReprocessResult({ is_invoice: true, vendor: "Stripe", amount: 49 });
    expect(result.action).toBe("update");
  });

  it("returns update when is_invoice is null (extraction uncertain)", () => {
    const result = classifyReprocessResult({ is_invoice: null, vendor: "Unknown" });
    expect(result.action).toBe("update");
  });
});
