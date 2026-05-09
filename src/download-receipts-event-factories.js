/**
 * Event factories for download-receipts progress events emitted by
 * src/download-receipts.js, src/receipt-search-pipeline.js,
 * src/receipt-output-tree.js, src/pdf-converter.js, and src/llm-receipt-extraction.js.
 */

// From download-receipts.js and listReceiptVendors
export const searchAccount = (name, user) => ({ type: "search-account", name, user });
export const vendorFilterApplied = (matchCount, excludedCount, vendor) => ({
  type: "vendor-filter-applied",
  matchCount,
  excludedCount,
  vendor,
});
export const subjectExclusions = (count) => ({ type: "subject-exclusions", count });
export const uniqueReceipts = (count) => ({ type: "unique-receipts", count });
export const skipNonInvoice = (vendor, confidence) => ({ type: "skip-non-invoice", vendor, confidence });
export const skipLowConfidence = (vendor, confidence) => ({ type: "skip-low-confidence", vendor, confidence });
export const skipExistingInvoice = (vendor, invoiceNumber) => ({
  type: "skip-existing-invoice",
  vendor,
  invoiceNumber,
});
export const llmEnabled = () => ({ type: "llm-enabled" });
export const llmDisabled = () => ({ type: "llm-disabled" });
export const downloadSummary = (stats) => ({ type: "download-summary", stats });

// From download-receipts.js (reprocess flow)
export const reprocessStart = (outputDir) => ({ type: "reprocess-start", outputDir });
export const reprocessDryRun = (filename) => ({ type: "reprocess-dry-run", filename });
export const reprocessDryRunBody = (filename) => ({ type: "reprocess-dry-run-body", filename });
export const reprocessUsingBody = (filename) => ({ type: "reprocess-using-body", filename });
export const reprocessSkipped = (filename, reason) => ({ type: "reprocess-skipped", filename, reason });
export const reprocessNoData = (filename) => ({ type: "reprocess-no-data", filename });
export const reprocessReclassified = (filename) => ({ type: "reprocess-reclassified", filename });
export const reprocessUpdated = (filename) => ({ type: "reprocess-updated", filename });
export const reprocessSummary = (reprocessed, skipped, reclassified, errors) => ({
  type: "reprocess-summary",
  reprocessed,
  skipped,
  reclassified,
  errors,
});

// From receipt-search-pipeline.js
export const mailboxSearchStart = (mailbox, messageCount) => ({ type: "mailbox-search-start", mailbox, messageCount });
export const mailboxCandidates = (mailbox, count) => ({ type: "mailbox-candidates", mailbox, count });

// From receipt-output-tree.js
export const skipDuplicate = (label) => ({ type: "skip-duplicate", label });
export const dryRunPdf = (filename) => ({ type: "dry-run-pdf", filename });
export const dryRunJson = (filename) => ({ type: "dry-run-json", filename });
export const dryRunMetadata = (filename) => ({ type: "dry-run-metadata", filename });
export const downloadedPdf = (filename, size) => ({ type: "downloaded-pdf", filename, size });
export const wroteMetadata = (filename) => ({ type: "wrote-metadata", filename });

// From pdf-converter.js
export const usingPdfContent = (uid) => ({ type: "using-pdf-content", uid });
