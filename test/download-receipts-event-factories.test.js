import { describe, expect, it } from "bun:test";
import { receiptEvents } from "../src/receipts/download-receipts-event-factories.js";

describe("receiptEvents.searchAccount", () => {
  it("builds the search-account event", () => {
    expect(receiptEvents.searchAccount("TestAccount", "user@example.com")).toEqual({
      type: "search-account",
      name: "TestAccount",
      user: "user@example.com",
    });
  });
});

describe("receiptEvents.vendorFilterApplied", () => {
  it("builds the vendor-filter-applied event", () => {
    expect(receiptEvents.vendorFilterApplied(5, 2, "acme")).toEqual({
      type: "vendor-filter-applied",
      matchCount: 5,
      excludedCount: 2,
      vendor: "acme",
    });
  });
});

describe("receiptEvents.subjectExclusions", () => {
  it("builds the subject-exclusions event", () => {
    expect(receiptEvents.subjectExclusions(3)).toEqual({
      type: "subject-exclusions",
      count: 3,
    });
  });
});

describe("receiptEvents.uniqueReceipts", () => {
  it("builds the unique-receipts event", () => {
    expect(receiptEvents.uniqueReceipts(12)).toEqual({
      type: "unique-receipts",
      count: 12,
    });
  });
});

describe("receiptEvents.skipNonInvoice", () => {
  it("builds the skip-non-invoice event", () => {
    expect(receiptEvents.skipNonInvoice("acme", 0.4)).toEqual({
      type: "skip-non-invoice",
      vendor: "acme",
      confidence: 0.4,
    });
  });
});

describe("receiptEvents.skipLowConfidence", () => {
  it("builds the skip-low-confidence event", () => {
    expect(receiptEvents.skipLowConfidence("acme", 0.3)).toEqual({
      type: "skip-low-confidence",
      vendor: "acme",
      confidence: 0.3,
    });
  });
});

describe("receiptEvents.skipExistingInvoice", () => {
  it("builds the skip-existing-invoice event", () => {
    expect(receiptEvents.skipExistingInvoice("acme", "INV-001")).toEqual({
      type: "skip-existing-invoice",
      vendor: "acme",
      invoiceNumber: "INV-001",
    });
  });
});

describe("receiptEvents.llmEnabled", () => {
  it("builds the llm-enabled event", () => {
    expect(receiptEvents.llmEnabled()).toEqual({ type: "llm-enabled" });
  });
});

describe("receiptEvents.llmDisabled", () => {
  it("builds the llm-disabled event", () => {
    expect(receiptEvents.llmDisabled()).toEqual({ type: "llm-disabled" });
  });
});

describe("receiptEvents.reprocessStart", () => {
  it("builds the reprocess-start event", () => {
    expect(receiptEvents.reprocessStart("/tmp/receipts")).toEqual({
      type: "reprocess-start",
      outputDir: "/tmp/receipts",
    });
  });
});

describe("receiptEvents.reprocessDryRun", () => {
  it("builds the reprocess-dry-run event", () => {
    expect(receiptEvents.reprocessDryRun("receipt.pdf")).toEqual({
      type: "reprocess-dry-run",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessDryRunBody", () => {
  it("builds the reprocess-dry-run-body event", () => {
    expect(receiptEvents.reprocessDryRunBody("receipt.pdf")).toEqual({
      type: "reprocess-dry-run-body",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessUsingBody", () => {
  it("builds the reprocess-using-body event", () => {
    expect(receiptEvents.reprocessUsingBody("receipt.pdf")).toEqual({
      type: "reprocess-using-body",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessSkipped", () => {
  it("builds the reprocess-skipped event", () => {
    expect(receiptEvents.reprocessSkipped("receipt.pdf", "already up to date")).toEqual({
      type: "reprocess-skipped",
      filename: "receipt.pdf",
      reason: "already up to date",
    });
  });
});

describe("receiptEvents.reprocessNoData", () => {
  it("builds the reprocess-no-data event", () => {
    expect(receiptEvents.reprocessNoData("receipt.pdf")).toEqual({
      type: "reprocess-no-data",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessReclassified", () => {
  it("builds the reprocess-reclassified event", () => {
    expect(receiptEvents.reprocessReclassified("receipt.pdf")).toEqual({
      type: "reprocess-reclassified",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessUpdated", () => {
  it("builds the reprocess-updated event", () => {
    expect(receiptEvents.reprocessUpdated("receipt.pdf")).toEqual({
      type: "reprocess-updated",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessSummary", () => {
  it("builds the reprocess-summary event", () => {
    expect(receiptEvents.reprocessSummary(3, 1, 2, 0)).toEqual({
      type: "reprocess-summary",
      reprocessed: 3,
      skipped: 1,
      reclassified: 2,
      errors: 0,
    });
  });
});

describe("receiptEvents.mailboxSearchStart", () => {
  it("builds the mailbox-search-start event", () => {
    expect(receiptEvents.mailboxSearchStart("INBOX", 100)).toEqual({
      type: "mailbox-search-start",
      mailbox: "INBOX",
      messageCount: 100,
    });
  });
});

describe("receiptEvents.mailboxCandidates", () => {
  it("builds the mailbox-candidates event", () => {
    expect(receiptEvents.mailboxCandidates("INBOX", 5)).toEqual({
      type: "mailbox-candidates",
      mailbox: "INBOX",
      count: 5,
    });
  });
});

describe("receiptEvents.skipDuplicate", () => {
  it("builds the skip-duplicate event", () => {
    expect(receiptEvents.skipDuplicate("acme-2024-01.pdf")).toEqual({
      type: "skip-duplicate",
      label: "acme-2024-01.pdf",
    });
  });
});

describe("receiptEvents.dryRunPdf", () => {
  it("builds the dry-run-pdf event", () => {
    expect(receiptEvents.dryRunPdf("receipt.pdf")).toEqual({
      type: "dry-run-pdf",
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.dryRunJson", () => {
  it("builds the dry-run-json event", () => {
    expect(receiptEvents.dryRunJson("receipt.json")).toEqual({
      type: "dry-run-json",
      filename: "receipt.json",
    });
  });
});

describe("receiptEvents.dryRunMetadata", () => {
  it("builds the dry-run-metadata event", () => {
    expect(receiptEvents.dryRunMetadata("receipt.txt")).toEqual({
      type: "dry-run-metadata",
      filename: "receipt.txt",
    });
  });
});

describe("receiptEvents.downloadedPdf", () => {
  it("builds the downloaded-pdf event", () => {
    expect(receiptEvents.downloadedPdf("receipt.pdf", 2048)).toEqual({
      type: "downloaded-pdf",
      filename: "receipt.pdf",
      size: 2048,
    });
  });
});

describe("receiptEvents.wroteMetadata", () => {
  it("builds the wrote-metadata event", () => {
    expect(receiptEvents.wroteMetadata("receipt.json")).toEqual({
      type: "wrote-metadata",
      filename: "receipt.json",
    });
  });
});

describe("receiptEvents.usingPdfContent", () => {
  it("builds the using-pdf-content event", () => {
    expect(receiptEvents.usingPdfContent(42)).toEqual({
      type: "using-pdf-content",
      uid: 42,
    });
  });
});

describe("receiptEvents.doclingFailed", () => {
  it("builds the docling-failed event", () => {
    const err = new Error("docling not found");
    expect(receiptEvents.doclingFailed(err, 42)).toEqual({
      type: "docling-failed",
      severity: "warning",
      error: err,
      uid: 42,
    });
  });
});

describe("receiptEvents.doclingConversionFailed", () => {
  it("builds the docling-conversion-failed event", () => {
    const err = new Error("subprocess failed");
    expect(receiptEvents.doclingConversionFailed(err, 7, "/tmp/x.pdf")).toEqual({
      type: "docling-conversion-failed",
      severity: "warning",
      error: err,
      uid: 7,
      pdfPath: "/tmp/x.pdf",
    });
  });
});

describe("receiptEvents.llmNotConfigured", () => {
  it("builds the llm-not-configured event", () => {
    const err = new Error("bad api key");
    expect(receiptEvents.llmNotConfigured(err)).toEqual({
      type: "llm-not-configured",
      severity: "warning",
      error: err,
    });
  });
});

describe("receiptEvents.llmExtractionFailed", () => {
  it("builds the llm-extraction-failed event", () => {
    const err = new Error("api timeout");
    expect(receiptEvents.llmExtractionFailed(err)).toEqual({
      type: "llm-extraction-failed",
      severity: "warning",
      error: err,
    });
  });
});

describe("receiptEvents.searchTermError", () => {
  it("builds the search-term-error event", () => {
    const err = new Error("server error");
    expect(receiptEvents.searchTermError(err, "INBOX")).toEqual({
      type: "search-term-error",
      severity: "warning",
      error: err,
      mailbox: "INBOX",
    });
  });
});

describe("receiptEvents.mailboxFetchError", () => {
  it("builds the mailbox-fetch-error event", () => {
    const err = new Error("timeout");
    expect(receiptEvents.mailboxFetchError(err)).toEqual({
      type: "mailbox-fetch-error",
      severity: "warning",
      error: err,
    });
  });
});

describe("receiptEvents.outputTreeError", () => {
  it("builds the output-tree-error event", () => {
    const err = new Error("read failed");
    expect(receiptEvents.outputTreeError(err, "/receipts/2024", "vendor")).toEqual({
      type: "output-tree-error",
      severity: "warning",
      error: err,
      path: "/receipts/2024",
      level: "vendor",
    });
  });
});

describe("receiptEvents.processError", () => {
  it("builds the process-error event", () => {
    const err = new Error("parse failed");
    expect(receiptEvents.processError(err, 77)).toEqual({
      type: "process-error",
      severity: "error",
      error: err,
      uid: 77,
    });
  });
});

describe("receiptEvents.reprocessDoclingFailed", () => {
  it("builds the reprocess-docling-failed event", () => {
    const err = new Error("docling conversion failed");
    expect(receiptEvents.reprocessDoclingFailed(err, "receipt.pdf")).toEqual({
      type: "reprocess-docling-failed",
      severity: "warning",
      error: err,
      filename: "receipt.pdf",
    });
  });
});

describe("receiptEvents.reprocessError", () => {
  it("builds the reprocess-error event", () => {
    const err = new Error("extraction failed");
    expect(receiptEvents.reprocessError(err, "receipt.json")).toEqual({
      type: "reprocess-error",
      severity: "error",
      error: err,
      filename: "receipt.json",
    });
  });
});

describe("receiptEvents.emptyExtractionSkipped", () => {
  it("builds the empty-extraction-skipped event", () => {
    expect(receiptEvents.emptyExtractionSkipped("Acme", "billing@acme.com", "2025-03-07")).toEqual({
      type: "empty-extraction-skipped",
      vendor: "Acme",
      sourceEmail: "billing@acme.com",
      date: "2025-03-07",
    });
  });
});
