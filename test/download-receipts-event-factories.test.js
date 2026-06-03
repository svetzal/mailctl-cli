import { describe, expect, it } from "bun:test";
import {
  doclingConversionFailed,
  doclingFailed,
  downloadedPdf,
  downloadSummary,
  dryRunJson,
  dryRunMetadata,
  dryRunPdf,
  emptyExtractionSkipped,
  llmDisabled,
  llmEnabled,
  llmExtractionFailed,
  llmNotConfigured,
  mailboxCandidates,
  mailboxFetchError,
  mailboxSearchStart,
  outputTreeError,
  processError,
  reprocessDoclingFailed,
  reprocessDryRun,
  reprocessDryRunBody,
  reprocessError,
  reprocessNoData,
  reprocessReclassified,
  reprocessSkipped,
  reprocessStart,
  reprocessSummary,
  reprocessUpdated,
  reprocessUsingBody,
  searchAccount,
  searchTermError,
  skipDuplicate,
  skipExistingInvoice,
  skipLowConfidence,
  skipNonInvoice,
  subjectExclusions,
  uniqueReceipts,
  usingPdfContent,
  vendorFilterApplied,
  wroteMetadata,
} from "../src/download-receipts-event-factories.js";

describe("searchAccount", () => {
  it("builds the search-account event", () => {
    expect(searchAccount("TestAccount", "user@example.com")).toEqual({
      type: "search-account",
      name: "TestAccount",
      user: "user@example.com",
    });
  });
});

describe("vendorFilterApplied", () => {
  it("builds the vendor-filter-applied event", () => {
    expect(vendorFilterApplied(5, 2, "acme")).toEqual({
      type: "vendor-filter-applied",
      matchCount: 5,
      excludedCount: 2,
      vendor: "acme",
    });
  });
});

describe("subjectExclusions", () => {
  it("builds the subject-exclusions event", () => {
    expect(subjectExclusions(3)).toEqual({
      type: "subject-exclusions",
      count: 3,
    });
  });
});

describe("uniqueReceipts", () => {
  it("builds the unique-receipts event", () => {
    expect(uniqueReceipts(12)).toEqual({
      type: "unique-receipts",
      count: 12,
    });
  });
});

describe("skipNonInvoice", () => {
  it("builds the skip-non-invoice event", () => {
    expect(skipNonInvoice("acme", 0.4)).toEqual({
      type: "skip-non-invoice",
      vendor: "acme",
      confidence: 0.4,
    });
  });
});

describe("skipLowConfidence", () => {
  it("builds the skip-low-confidence event", () => {
    expect(skipLowConfidence("acme", 0.3)).toEqual({
      type: "skip-low-confidence",
      vendor: "acme",
      confidence: 0.3,
    });
  });
});

describe("skipExistingInvoice", () => {
  it("builds the skip-existing-invoice event", () => {
    expect(skipExistingInvoice("acme", "INV-001")).toEqual({
      type: "skip-existing-invoice",
      vendor: "acme",
      invoiceNumber: "INV-001",
    });
  });
});

describe("llmEnabled", () => {
  it("builds the llm-enabled event", () => {
    expect(llmEnabled()).toEqual({ type: "llm-enabled" });
  });
});

describe("llmDisabled", () => {
  it("builds the llm-disabled event", () => {
    expect(llmDisabled()).toEqual({ type: "llm-disabled" });
  });
});

describe("downloadSummary", () => {
  it("builds the download-summary event", () => {
    const stats = { total: 5 };
    expect(downloadSummary(stats)).toEqual({
      type: "download-summary",
      stats,
    });
  });
});

describe("reprocessStart", () => {
  it("builds the reprocess-start event", () => {
    expect(reprocessStart("/tmp/receipts")).toEqual({
      type: "reprocess-start",
      outputDir: "/tmp/receipts",
    });
  });
});

describe("reprocessDryRun", () => {
  it("builds the reprocess-dry-run event", () => {
    expect(reprocessDryRun("receipt.pdf")).toEqual({
      type: "reprocess-dry-run",
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessDryRunBody", () => {
  it("builds the reprocess-dry-run-body event", () => {
    expect(reprocessDryRunBody("receipt.pdf")).toEqual({
      type: "reprocess-dry-run-body",
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessUsingBody", () => {
  it("builds the reprocess-using-body event", () => {
    expect(reprocessUsingBody("receipt.pdf")).toEqual({
      type: "reprocess-using-body",
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessSkipped", () => {
  it("builds the reprocess-skipped event", () => {
    expect(reprocessSkipped("receipt.pdf", "already up to date")).toEqual({
      type: "reprocess-skipped",
      filename: "receipt.pdf",
      reason: "already up to date",
    });
  });
});

describe("reprocessNoData", () => {
  it("builds the reprocess-no-data event", () => {
    expect(reprocessNoData("receipt.pdf")).toEqual({
      type: "reprocess-no-data",
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessReclassified", () => {
  it("builds the reprocess-reclassified event", () => {
    expect(reprocessReclassified("receipt.pdf")).toEqual({
      type: "reprocess-reclassified",
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessUpdated", () => {
  it("builds the reprocess-updated event", () => {
    expect(reprocessUpdated("receipt.pdf")).toEqual({
      type: "reprocess-updated",
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessSummary", () => {
  it("builds the reprocess-summary event", () => {
    expect(reprocessSummary(3, 1, 2, 0)).toEqual({
      type: "reprocess-summary",
      reprocessed: 3,
      skipped: 1,
      reclassified: 2,
      errors: 0,
    });
  });
});

describe("mailboxSearchStart", () => {
  it("builds the mailbox-search-start event", () => {
    expect(mailboxSearchStart("INBOX", 100)).toEqual({
      type: "mailbox-search-start",
      mailbox: "INBOX",
      messageCount: 100,
    });
  });
});

describe("mailboxCandidates", () => {
  it("builds the mailbox-candidates event", () => {
    expect(mailboxCandidates("INBOX", 5)).toEqual({
      type: "mailbox-candidates",
      mailbox: "INBOX",
      count: 5,
    });
  });
});

describe("skipDuplicate", () => {
  it("builds the skip-duplicate event", () => {
    expect(skipDuplicate("acme-2024-01.pdf")).toEqual({
      type: "skip-duplicate",
      label: "acme-2024-01.pdf",
    });
  });
});

describe("dryRunPdf", () => {
  it("builds the dry-run-pdf event", () => {
    expect(dryRunPdf("receipt.pdf")).toEqual({
      type: "dry-run-pdf",
      filename: "receipt.pdf",
    });
  });
});

describe("dryRunJson", () => {
  it("builds the dry-run-json event", () => {
    expect(dryRunJson("receipt.json")).toEqual({
      type: "dry-run-json",
      filename: "receipt.json",
    });
  });
});

describe("dryRunMetadata", () => {
  it("builds the dry-run-metadata event", () => {
    expect(dryRunMetadata("receipt.txt")).toEqual({
      type: "dry-run-metadata",
      filename: "receipt.txt",
    });
  });
});

describe("downloadedPdf", () => {
  it("builds the downloaded-pdf event", () => {
    expect(downloadedPdf("receipt.pdf", 2048)).toEqual({
      type: "downloaded-pdf",
      filename: "receipt.pdf",
      size: 2048,
    });
  });
});

describe("wroteMetadata", () => {
  it("builds the wrote-metadata event", () => {
    expect(wroteMetadata("receipt.json")).toEqual({
      type: "wrote-metadata",
      filename: "receipt.json",
    });
  });
});

describe("usingPdfContent", () => {
  it("builds the using-pdf-content event", () => {
    expect(usingPdfContent(42)).toEqual({
      type: "using-pdf-content",
      uid: 42,
    });
  });
});

describe("doclingFailed", () => {
  it("builds the docling-failed event", () => {
    const err = new Error("docling not found");
    expect(doclingFailed(err, 42)).toEqual({
      type: "docling-failed",
      severity: "warning",
      error: err,
      uid: 42,
    });
  });
});

describe("doclingConversionFailed", () => {
  it("builds the docling-conversion-failed event", () => {
    const err = new Error("subprocess failed");
    expect(doclingConversionFailed(err, 7, "/tmp/x.pdf")).toEqual({
      type: "docling-conversion-failed",
      severity: "warning",
      error: err,
      uid: 7,
      pdfPath: "/tmp/x.pdf",
    });
  });
});

describe("llmNotConfigured", () => {
  it("builds the llm-not-configured event", () => {
    const err = new Error("bad api key");
    expect(llmNotConfigured(err)).toEqual({
      type: "llm-not-configured",
      severity: "warning",
      error: err,
    });
  });
});

describe("llmExtractionFailed", () => {
  it("builds the llm-extraction-failed event", () => {
    const err = new Error("api timeout");
    expect(llmExtractionFailed(err)).toEqual({
      type: "llm-extraction-failed",
      severity: "warning",
      error: err,
    });
  });
});

describe("searchTermError", () => {
  it("builds the search-term-error event", () => {
    const err = new Error("server error");
    expect(searchTermError(err, "INBOX")).toEqual({
      type: "search-term-error",
      severity: "warning",
      error: err,
      mailbox: "INBOX",
    });
  });
});

describe("mailboxFetchError", () => {
  it("builds the mailbox-fetch-error event", () => {
    const err = new Error("timeout");
    expect(mailboxFetchError(err)).toEqual({
      type: "mailbox-fetch-error",
      severity: "warning",
      error: err,
    });
  });
});

describe("outputTreeError", () => {
  it("builds the output-tree-error event", () => {
    const err = new Error("read failed");
    expect(outputTreeError(err, "/receipts/2024", "vendor")).toEqual({
      type: "output-tree-error",
      severity: "warning",
      error: err,
      path: "/receipts/2024",
      level: "vendor",
    });
  });
});

describe("processError", () => {
  it("builds the process-error event", () => {
    const err = new Error("parse failed");
    expect(processError(err, 77)).toEqual({
      type: "process-error",
      severity: "error",
      error: err,
      uid: 77,
    });
  });
});

describe("reprocessDoclingFailed", () => {
  it("builds the reprocess-docling-failed event", () => {
    const err = new Error("docling conversion failed");
    expect(reprocessDoclingFailed(err, "receipt.pdf")).toEqual({
      type: "reprocess-docling-failed",
      severity: "warning",
      error: err,
      filename: "receipt.pdf",
    });
  });
});

describe("reprocessError", () => {
  it("builds the reprocess-error event", () => {
    const err = new Error("extraction failed");
    expect(reprocessError(err, "receipt.json")).toEqual({
      type: "reprocess-error",
      severity: "error",
      error: err,
      filename: "receipt.json",
    });
  });
});

describe("emptyExtractionSkipped", () => {
  it("builds the empty-extraction-skipped event", () => {
    expect(emptyExtractionSkipped("Acme", "billing@acme.com", "2025-03-07")).toEqual({
      type: "empty-extraction-skipped",
      vendor: "Acme",
      sourceEmail: "billing@acme.com",
      date: "2025-03-07",
    });
  });
});
