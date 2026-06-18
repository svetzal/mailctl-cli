import { describe, expect, it } from "bun:test";
import {
  buildReprocessedSidecar,
  chooseReprocessSource,
  classifyReceiptExtraction,
  classifyReprocessResult,
  isEmptyExtraction,
  MIN_INVOICE_CONFIDENCE,
  receiptDecisionEvent,
  receiptFilterEvents,
  shouldStopProcessing,
  sidecarPassesFilters,
  tallyReceiptAction,
} from "../src/receipts/receipt-decisions.js";

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

  describe("includes fresh extraction fields like vendor and amount", () => {
    const result = buildReprocessedSidecar(METADATA, ORIGINAL_SIDECAR, "2026-03-01T12:00:00Z");

    it("vendor is Stripe", () => {
      expect(result.vendor).toBe("Stripe");
    });

    it("amount is 49", () => {
      expect(result.amount).toBe(49);
    });
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

// ── receiptDecisionEvent ──────────────────────────────────────────────────────

describe("receiptDecisionEvent", () => {
  const BASE_META = { vendor: "Acme", confidence: 0.9, date: null };
  const MSG = { fromName: "Acme Corp", fromAddress: "billing@acme.com" };
  const EMAIL_DATE = new Date("2025-03-07");

  it("returns skipNonInvoice event for skipNonInvoice decision", () => {
    const decision = { action: "skipped", event: "skipNonInvoice", vendor: "Acme", confidence: 0.8 };
    const ev = receiptDecisionEvent(decision, BASE_META, MSG, EMAIL_DATE);
    expect(ev.type).toBe("skip-non-invoice");
  });

  it("returns skipLowConfidence event for skipLowConfidence decision", () => {
    const decision = { action: "skipped", event: "skipLowConfidence", vendor: "Acme", confidence: 0.2 };
    const ev = receiptDecisionEvent(decision, BASE_META, MSG, EMAIL_DATE);
    expect(ev.type).toBe("skip-low-confidence");
  });

  it("returns skipExistingInvoice event for skipExistingInvoice decision", () => {
    const decision = { action: "duplicate", event: "skipExistingInvoice", vendor: "Acme", invoice_number: "INV-1" };
    const ev = receiptDecisionEvent(decision, BASE_META, MSG, EMAIL_DATE);
    expect(ev.type).toBe("skip-existing-invoice");
  });

  it("returns emptyExtractionSkipped event for emptyExtractionSkipped decision", () => {
    const decision = { action: "skippedEmpty", event: "emptyExtractionSkipped" };
    const ev = receiptDecisionEvent(decision, BASE_META, MSG, EMAIL_DATE);
    expect(ev.type).toBe("empty-extraction-skipped");
  });

  it("returns null for proceed decision", () => {
    const decision = { action: "proceed" };
    const ev = receiptDecisionEvent(decision, BASE_META, MSG, EMAIL_DATE);
    expect(ev).toBeNull();
  });
});

// ── tallyReceiptAction ────────────────────────────────────────────────────────

describe("tallyReceiptAction", () => {
  const BASE_STATS = { found: 0, downloaded: 0, noPdf: 0, skipped: 0, skippedEmpty: 0, alreadyHave: 0, errors: 0 };

  it("increments downloaded for downloaded action", () => {
    expect(tallyReceiptAction(BASE_STATS, "downloaded").downloaded).toBe(1);
  });

  it("increments noPdf for noPdf action", () => {
    expect(tallyReceiptAction(BASE_STATS, "noPdf").noPdf).toBe(1);
  });

  it("increments skipped for skipped action", () => {
    expect(tallyReceiptAction(BASE_STATS, "skipped").skipped).toBe(1);
  });

  it("increments skippedEmpty for skippedEmpty action", () => {
    expect(tallyReceiptAction(BASE_STATS, "skippedEmpty").skippedEmpty).toBe(1);
  });

  it("increments alreadyHave for duplicate action", () => {
    expect(tallyReceiptAction(BASE_STATS, "duplicate").alreadyHave).toBe(1);
  });

  it("increments errors for error action", () => {
    expect(tallyReceiptAction(BASE_STATS, "error").errors).toBe(1);
  });

  it("does not mutate the input stats object", () => {
    const stats = { ...BASE_STATS };
    tallyReceiptAction(stats, "downloaded");
    expect(stats.downloaded).toBe(0);
  });

  it("returns stats unchanged for unknown action", () => {
    expect(tallyReceiptAction(BASE_STATS, "unknown")).toEqual(BASE_STATS);
  });
});

// ── shouldStopProcessing ──────────────────────────────────────────────────────

describe("shouldStopProcessing", () => {
  const startedAt = 0;
  const now = 1000;

  it("returns stop false when neither max nor budget is set", () => {
    const result = shouldStopProcessing({ processedCount: 5, maxMessages: null, startedAt, budgetMs: null }, now);
    expect(result.stop).toBe(false);
  });

  it("returns null event when not stopping", () => {
    const result = shouldStopProcessing({ processedCount: 5, maxMessages: null, startedAt, budgetMs: null }, now);
    expect(result.event).toBeNull();
  });

  it("returns stop true when processedCount reaches maxMessages", () => {
    const result = shouldStopProcessing({ processedCount: 10, maxMessages: 10, startedAt, budgetMs: null }, now);
    expect(result.stop).toBe(true);
  });

  it("returns a max-reached event when max is hit", () => {
    const result = shouldStopProcessing({ processedCount: 10, maxMessages: 10, startedAt, budgetMs: null }, now);
    expect(result.event).not.toBeNull();
    expect(result.event.type).toBe("max-reached");
  });

  it("returns stop true when elapsed time exceeds budgetMs", () => {
    const result = shouldStopProcessing({ processedCount: 1, maxMessages: null, startedAt: 0, budgetMs: 500 }, 600);
    expect(result.stop).toBe(true);
  });

  it("returns a budget-exceeded event when budget is hit", () => {
    const result = shouldStopProcessing({ processedCount: 1, maxMessages: null, startedAt: 0, budgetMs: 500 }, 600);
    expect(result.event).not.toBeNull();
    expect(result.event.type).toBe("budget-exceeded");
  });

  it("max check takes precedence over budget when both are exceeded", () => {
    const result = shouldStopProcessing({ processedCount: 5, maxMessages: 5, startedAt: 0, budgetMs: 100 }, 200);
    expect(result.event.type).toBe("max-reached");
  });

  it("does not stop when processedCount is below maxMessages", () => {
    const result = shouldStopProcessing({ processedCount: 4, maxMessages: 10, startedAt, budgetMs: null }, now);
    expect(result.stop).toBe(false);
  });

  it("does not stop when elapsed time is below budgetMs", () => {
    const result = shouldStopProcessing({ processedCount: 1, maxMessages: null, startedAt: 0, budgetMs: 5000 }, 1000);
    expect(result.stop).toBe(false);
  });
});

// ── chooseReprocessSource ─────────────────────────────────────────────────────

describe("chooseReprocessSource", () => {
  it("returns dryRunPdf when hasPdf is true and dryRun is true", () => {
    expect(chooseReprocessSource({ hasPdf: true, hasBodySnippet: false, dryRun: true }).kind).toBe("dryRunPdf");
  });

  it("returns pdf when hasPdf is true and dryRun is false", () => {
    expect(chooseReprocessSource({ hasPdf: true, hasBodySnippet: false, dryRun: false }).kind).toBe("pdf");
  });

  it("returns dryRunBody when no pdf, has snippet, and dryRun is true", () => {
    expect(chooseReprocessSource({ hasPdf: false, hasBodySnippet: true, dryRun: true }).kind).toBe("dryRunBody");
  });

  it("returns body when no pdf, has snippet, and dryRun is false", () => {
    expect(chooseReprocessSource({ hasPdf: false, hasBodySnippet: true, dryRun: false }).kind).toBe("body");
  });

  it("returns skip when no pdf and no snippet", () => {
    expect(chooseReprocessSource({ hasPdf: false, hasBodySnippet: false, dryRun: false }).kind).toBe("skip");
  });
});

// ── receiptFilterEvents ───────────────────────────────────────────────────────

describe("receiptFilterEvents", () => {
  it("includes vendor-filter-applied event when vendorExcluded > 0", () => {
    const events = receiptFilterEvents({ uniqueCount: 5, vendorExcluded: 2, subjectExcluded: 0, vendor: "acme" });
    expect(events.some((e) => e.type === "vendor-filter-applied")).toBe(true);
  });

  it("includes subject-exclusions event when subjectExcluded > 0", () => {
    const events = receiptFilterEvents({ uniqueCount: 5, vendorExcluded: 0, subjectExcluded: 1, vendor: null });
    expect(events.some((e) => e.type === "subject-exclusions")).toBe(true);
  });

  it("always includes unique-receipts event last", () => {
    const events = receiptFilterEvents({ uniqueCount: 3, vendorExcluded: 0, subjectExcluded: 0, vendor: null });
    expect(events[events.length - 1].type).toBe("unique-receipts");
  });

  it("returns only the unique-receipts event when both exclusion counts are zero", () => {
    const events = receiptFilterEvents({ uniqueCount: 3, vendorExcluded: 0, subjectExcluded: 0, vendor: null });
    expect(events).toHaveLength(1);
  });
});
