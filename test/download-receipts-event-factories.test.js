import { describe, expect, it } from "bun:test";
import {
  doclingConversionFailed,
  doclingFailed,
  downloadedPdf,
  downloadSummary,
  dryRunJson,
  dryRunMetadata,
  dryRunPdf,
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
  it("has type search-account", () => {
    expect(searchAccount("TestAccount", "user@example.com").type).toBe("search-account");
  });

  it("has name field", () => {
    expect(searchAccount("TestAccount", "user@example.com").name).toBe("TestAccount");
  });

  it("has user field", () => {
    expect(searchAccount("TestAccount", "user@example.com").user).toBe("user@example.com");
  });
});

describe("vendorFilterApplied", () => {
  it("has type vendor-filter-applied", () => {
    expect(vendorFilterApplied(5, 2, "acme").type).toBe("vendor-filter-applied");
  });

  it("has matchCount field", () => {
    expect(vendorFilterApplied(5, 2, "acme").matchCount).toBe(5);
  });

  it("has excludedCount field", () => {
    expect(vendorFilterApplied(5, 2, "acme").excludedCount).toBe(2);
  });

  it("has vendor field", () => {
    expect(vendorFilterApplied(5, 2, "acme").vendor).toBe("acme");
  });
});

describe("subjectExclusions", () => {
  it("has type subject-exclusions", () => {
    expect(subjectExclusions(3).type).toBe("subject-exclusions");
  });

  it("has count field", () => {
    expect(subjectExclusions(3).count).toBe(3);
  });
});

describe("uniqueReceipts", () => {
  it("has type unique-receipts", () => {
    expect(uniqueReceipts(12).type).toBe("unique-receipts");
  });

  it("has count field", () => {
    expect(uniqueReceipts(12).count).toBe(12);
  });
});

describe("skipNonInvoice", () => {
  it("has type skip-non-invoice", () => {
    expect(skipNonInvoice("acme", 0.4).type).toBe("skip-non-invoice");
  });

  it("has vendor field", () => {
    expect(skipNonInvoice("acme", 0.4).vendor).toBe("acme");
  });

  it("has confidence field", () => {
    expect(skipNonInvoice("acme", 0.4).confidence).toBe(0.4);
  });
});

describe("skipLowConfidence", () => {
  it("has type skip-low-confidence", () => {
    expect(skipLowConfidence("acme", 0.3).type).toBe("skip-low-confidence");
  });

  it("has vendor field", () => {
    expect(skipLowConfidence("acme", 0.3).vendor).toBe("acme");
  });

  it("has confidence field", () => {
    expect(skipLowConfidence("acme", 0.3).confidence).toBe(0.3);
  });
});

describe("skipExistingInvoice", () => {
  it("has type skip-existing-invoice", () => {
    expect(skipExistingInvoice("acme", "INV-001").type).toBe("skip-existing-invoice");
  });

  it("has vendor field", () => {
    expect(skipExistingInvoice("acme", "INV-001").vendor).toBe("acme");
  });

  it("has invoiceNumber field", () => {
    expect(skipExistingInvoice("acme", "INV-001").invoiceNumber).toBe("INV-001");
  });
});

describe("llmEnabled", () => {
  it("has type llm-enabled", () => {
    expect(llmEnabled().type).toBe("llm-enabled");
  });
});

describe("llmDisabled", () => {
  it("has type llm-disabled", () => {
    expect(llmDisabled().type).toBe("llm-disabled");
  });
});

describe("downloadSummary", () => {
  it("has type download-summary", () => {
    expect(downloadSummary({ total: 5 }).type).toBe("download-summary");
  });

  it("has stats field", () => {
    const stats = { total: 5 };
    expect(downloadSummary(stats).stats).toBe(stats);
  });
});

describe("reprocessStart", () => {
  it("has type reprocess-start", () => {
    expect(reprocessStart("/tmp/receipts").type).toBe("reprocess-start");
  });

  it("has outputDir field", () => {
    expect(reprocessStart("/tmp/receipts").outputDir).toBe("/tmp/receipts");
  });
});

describe("reprocessDryRun", () => {
  it("has type reprocess-dry-run", () => {
    expect(reprocessDryRun("receipt.pdf").type).toBe("reprocess-dry-run");
  });

  it("has filename field", () => {
    expect(reprocessDryRun("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessDryRunBody", () => {
  it("has type reprocess-dry-run-body", () => {
    expect(reprocessDryRunBody("receipt.pdf").type).toBe("reprocess-dry-run-body");
  });

  it("has filename field", () => {
    expect(reprocessDryRunBody("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessUsingBody", () => {
  it("has type reprocess-using-body", () => {
    expect(reprocessUsingBody("receipt.pdf").type).toBe("reprocess-using-body");
  });

  it("has filename field", () => {
    expect(reprocessUsingBody("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessSkipped", () => {
  it("has type reprocess-skipped", () => {
    expect(reprocessSkipped("receipt.pdf", "already up to date").type).toBe("reprocess-skipped");
  });

  it("has filename field", () => {
    expect(reprocessSkipped("receipt.pdf", "already up to date").filename).toBe("receipt.pdf");
  });

  it("has reason field", () => {
    expect(reprocessSkipped("receipt.pdf", "already up to date").reason).toBe("already up to date");
  });
});

describe("reprocessNoData", () => {
  it("has type reprocess-no-data", () => {
    expect(reprocessNoData("receipt.pdf").type).toBe("reprocess-no-data");
  });

  it("has filename field", () => {
    expect(reprocessNoData("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessReclassified", () => {
  it("has type reprocess-reclassified", () => {
    expect(reprocessReclassified("receipt.pdf").type).toBe("reprocess-reclassified");
  });

  it("has filename field", () => {
    expect(reprocessReclassified("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessUpdated", () => {
  it("has type reprocess-updated", () => {
    expect(reprocessUpdated("receipt.pdf").type).toBe("reprocess-updated");
  });

  it("has filename field", () => {
    expect(reprocessUpdated("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessSummary", () => {
  it("has type reprocess-summary", () => {
    expect(reprocessSummary(3, 1, 2, 0).type).toBe("reprocess-summary");
  });

  it("has reprocessed field", () => {
    expect(reprocessSummary(3, 1, 2, 0).reprocessed).toBe(3);
  });

  it("has skipped field", () => {
    expect(reprocessSummary(3, 1, 2, 0).skipped).toBe(1);
  });

  it("has reclassified field", () => {
    expect(reprocessSummary(3, 1, 2, 0).reclassified).toBe(2);
  });

  it("has errors field", () => {
    expect(reprocessSummary(3, 1, 2, 0).errors).toBe(0);
  });
});

describe("mailboxSearchStart", () => {
  it("has type mailbox-search-start", () => {
    expect(mailboxSearchStart("INBOX", 100).type).toBe("mailbox-search-start");
  });

  it("has mailbox field", () => {
    expect(mailboxSearchStart("INBOX", 100).mailbox).toBe("INBOX");
  });

  it("has messageCount field", () => {
    expect(mailboxSearchStart("INBOX", 100).messageCount).toBe(100);
  });
});

describe("mailboxCandidates", () => {
  it("has type mailbox-candidates", () => {
    expect(mailboxCandidates("INBOX", 5).type).toBe("mailbox-candidates");
  });

  it("has mailbox field", () => {
    expect(mailboxCandidates("INBOX", 5).mailbox).toBe("INBOX");
  });

  it("has count field", () => {
    expect(mailboxCandidates("INBOX", 5).count).toBe(5);
  });
});

describe("skipDuplicate", () => {
  it("has type skip-duplicate", () => {
    expect(skipDuplicate("acme-2024-01.pdf").type).toBe("skip-duplicate");
  });

  it("has label field", () => {
    expect(skipDuplicate("acme-2024-01.pdf").label).toBe("acme-2024-01.pdf");
  });
});

describe("dryRunPdf", () => {
  it("has type dry-run-pdf", () => {
    expect(dryRunPdf("receipt.pdf").type).toBe("dry-run-pdf");
  });

  it("has filename field", () => {
    expect(dryRunPdf("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("dryRunJson", () => {
  it("has type dry-run-json", () => {
    expect(dryRunJson("receipt.json").type).toBe("dry-run-json");
  });

  it("has filename field", () => {
    expect(dryRunJson("receipt.json").filename).toBe("receipt.json");
  });
});

describe("dryRunMetadata", () => {
  it("has type dry-run-metadata", () => {
    expect(dryRunMetadata("receipt.txt").type).toBe("dry-run-metadata");
  });

  it("has filename field", () => {
    expect(dryRunMetadata("receipt.txt").filename).toBe("receipt.txt");
  });
});

describe("downloadedPdf", () => {
  it("has type downloaded-pdf", () => {
    expect(downloadedPdf("receipt.pdf", 2048).type).toBe("downloaded-pdf");
  });

  it("has filename field", () => {
    expect(downloadedPdf("receipt.pdf", 2048).filename).toBe("receipt.pdf");
  });

  it("has size field", () => {
    expect(downloadedPdf("receipt.pdf", 2048).size).toBe(2048);
  });
});

describe("wroteMetadata", () => {
  it("has type wrote-metadata", () => {
    expect(wroteMetadata("receipt.json").type).toBe("wrote-metadata");
  });

  it("has filename field", () => {
    expect(wroteMetadata("receipt.json").filename).toBe("receipt.json");
  });
});

describe("usingPdfContent", () => {
  it("has type using-pdf-content", () => {
    expect(usingPdfContent(42).type).toBe("using-pdf-content");
  });

  it("has uid field", () => {
    expect(usingPdfContent(42).uid).toBe(42);
  });
});

describe("doclingFailed", () => {
  const err = new Error("docling not found");

  it("has type docling-failed", () => {
    expect(doclingFailed(err, 42).type).toBe("docling-failed");
  });

  it("has warning severity", () => {
    expect(doclingFailed(err, 42).severity).toBe("warning");
  });

  it("has error field", () => {
    expect(doclingFailed(err, 42).error).toBe(err);
  });

  it("has uid field", () => {
    expect(doclingFailed(err, 42).uid).toBe(42);
  });
});

describe("doclingConversionFailed", () => {
  const err = new Error("subprocess failed");

  it("has type docling-conversion-failed", () => {
    expect(doclingConversionFailed(err, 7, "/tmp/x.pdf").type).toBe("docling-conversion-failed");
  });

  it("has warning severity", () => {
    expect(doclingConversionFailed(err, 7, "/tmp/x.pdf").severity).toBe("warning");
  });

  it("has error field", () => {
    expect(doclingConversionFailed(err, 7, "/tmp/x.pdf").error).toBe(err);
  });

  it("has uid field", () => {
    expect(doclingConversionFailed(err, 7, "/tmp/x.pdf").uid).toBe(7);
  });

  it("has pdfPath field", () => {
    expect(doclingConversionFailed(err, 7, "/tmp/x.pdf").pdfPath).toBe("/tmp/x.pdf");
  });
});

describe("llmNotConfigured", () => {
  const err = new Error("bad api key");

  it("has type llm-not-configured", () => {
    expect(llmNotConfigured(err).type).toBe("llm-not-configured");
  });

  it("has warning severity", () => {
    expect(llmNotConfigured(err).severity).toBe("warning");
  });

  it("has error field", () => {
    expect(llmNotConfigured(err).error).toBe(err);
  });
});

describe("llmExtractionFailed", () => {
  const err = new Error("api timeout");

  it("has type llm-extraction-failed", () => {
    expect(llmExtractionFailed(err).type).toBe("llm-extraction-failed");
  });

  it("has warning severity", () => {
    expect(llmExtractionFailed(err).severity).toBe("warning");
  });

  it("has error field", () => {
    expect(llmExtractionFailed(err).error).toBe(err);
  });
});

describe("searchTermError", () => {
  const err = new Error("server error");

  it("has type search-term-error", () => {
    expect(searchTermError(err, "INBOX").type).toBe("search-term-error");
  });

  it("has warning severity", () => {
    expect(searchTermError(err, "INBOX").severity).toBe("warning");
  });

  it("has error field", () => {
    expect(searchTermError(err, "INBOX").error).toBe(err);
  });

  it("has mailbox field", () => {
    expect(searchTermError(err, "INBOX").mailbox).toBe("INBOX");
  });
});

describe("mailboxFetchError", () => {
  const err = new Error("timeout");

  it("has type mailbox-fetch-error", () => {
    expect(mailboxFetchError(err).type).toBe("mailbox-fetch-error");
  });

  it("has warning severity", () => {
    expect(mailboxFetchError(err).severity).toBe("warning");
  });

  it("has error field", () => {
    expect(mailboxFetchError(err).error).toBe(err);
  });
});

describe("outputTreeError", () => {
  const err = new Error("read failed");

  it("has type output-tree-error", () => {
    expect(outputTreeError(err, "/receipts/2024", "vendor").type).toBe("output-tree-error");
  });

  it("has warning severity", () => {
    expect(outputTreeError(err, "/receipts/2024", "vendor").severity).toBe("warning");
  });

  it("has error field", () => {
    expect(outputTreeError(err, "/receipts/2024", "vendor").error).toBe(err);
  });

  it("has path field", () => {
    expect(outputTreeError(err, "/receipts/2024", "vendor").path).toBe("/receipts/2024");
  });

  it("has level field", () => {
    expect(outputTreeError(err, "/receipts/2024", "vendor").level).toBe("vendor");
  });
});

describe("processError", () => {
  const err = new Error("parse failed");

  it("has type process-error", () => {
    expect(processError(err, 77).type).toBe("process-error");
  });

  it("has error severity", () => {
    expect(processError(err, 77).severity).toBe("error");
  });

  it("has error field", () => {
    expect(processError(err, 77).error).toBe(err);
  });

  it("has uid field", () => {
    expect(processError(err, 77).uid).toBe(77);
  });
});

describe("reprocessDoclingFailed", () => {
  const err = new Error("docling conversion failed");

  it("has type reprocess-docling-failed", () => {
    expect(reprocessDoclingFailed(err, "receipt.pdf").type).toBe("reprocess-docling-failed");
  });

  it("has warning severity", () => {
    expect(reprocessDoclingFailed(err, "receipt.pdf").severity).toBe("warning");
  });

  it("has error field", () => {
    expect(reprocessDoclingFailed(err, "receipt.pdf").error).toBe(err);
  });

  it("has filename field", () => {
    expect(reprocessDoclingFailed(err, "receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("reprocessError", () => {
  const err = new Error("extraction failed");

  it("has type reprocess-error", () => {
    expect(reprocessError(err, "receipt.json").type).toBe("reprocess-error");
  });

  it("has error severity", () => {
    expect(reprocessError(err, "receipt.json").severity).toBe("error");
  });

  it("has error field", () => {
    expect(reprocessError(err, "receipt.json").error).toBe(err);
  });

  it("has filename field", () => {
    expect(reprocessError(err, "receipt.json").filename).toBe("receipt.json");
  });
});
