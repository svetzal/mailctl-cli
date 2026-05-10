/**
 * Event factories for download-receipts progress events emitted by
 * src/download-receipts.js, src/receipt-search-pipeline.js,
 * src/receipt-output-tree.js, src/pdf-converter.js, and src/llm-receipt-extraction.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

// From download-receipts.js and listReceiptVendors
export const searchAccount = defineEvent("search-account", "name", "user");
export const vendorFilterApplied = defineEvent("vendor-filter-applied", "matchCount", "excludedCount", "vendor");
export const subjectExclusions = defineEvent("subject-exclusions", "count");
export const uniqueReceipts = defineEvent("unique-receipts", "count");
export const skipNonInvoice = defineEvent("skip-non-invoice", "vendor", "confidence");
export const skipLowConfidence = defineEvent("skip-low-confidence", "vendor", "confidence");
export const skipExistingInvoice = defineEvent("skip-existing-invoice", "vendor", "invoiceNumber");
export const llmEnabled = defineEvent("llm-enabled");
export const llmDisabled = defineEvent("llm-disabled");
export const downloadSummary = defineEvent("download-summary", "stats");

// From download-receipts.js (reprocess flow)
export const reprocessStart = defineEvent("reprocess-start", "outputDir");
export const reprocessDryRun = defineEvent("reprocess-dry-run", "filename");
export const reprocessDryRunBody = defineEvent("reprocess-dry-run-body", "filename");
export const reprocessUsingBody = defineEvent("reprocess-using-body", "filename");
export const reprocessSkipped = defineEvent("reprocess-skipped", "filename", "reason");
export const reprocessNoData = defineEvent("reprocess-no-data", "filename");
export const reprocessReclassified = defineEvent("reprocess-reclassified", "filename");
export const reprocessUpdated = defineEvent("reprocess-updated", "filename");
export const reprocessSummary = defineEvent("reprocess-summary", "reprocessed", "skipped", "reclassified", "errors");

// From receipt-search-pipeline.js
export const mailboxSearchStart = defineEvent("mailbox-search-start", "mailbox", "messageCount");
export const mailboxCandidates = defineEvent("mailbox-candidates", "mailbox", "count");

// From receipt-output-tree.js
export const skipDuplicate = defineEvent("skip-duplicate", "label");
export const dryRunPdf = defineEvent("dry-run-pdf", "filename");
export const dryRunJson = defineEvent("dry-run-json", "filename");
export const dryRunMetadata = defineEvent("dry-run-metadata", "filename");
export const downloadedPdf = defineEvent("downloaded-pdf", "filename", "size");
export const wroteMetadata = defineEvent("wrote-metadata", "filename");

// From pdf-converter.js
export const usingPdfContent = defineEvent("using-pdf-content", "uid");
export const doclingFailed = defineErrorEvent("docling-failed", "warning", "uid");
export const doclingConversionFailed = defineErrorEvent("docling-conversion-failed", "warning", "uid", "pdfPath");

// From llm-receipt-extraction.js
export const llmNotConfigured = defineErrorEvent("llm-not-configured", "warning");
export const llmExtractionFailed = defineErrorEvent("llm-extraction-failed", "warning");

// From receipt-search-pipeline.js
export const searchTermError = defineErrorEvent("search-term-error", "warning", "mailbox");
export const mailboxFetchError = defineErrorEvent("mailbox-fetch-error", "warning");

// From download-receipts.js
export const outputTreeError = defineErrorEvent("output-tree-error", "warning", "path", "level");
export const processError = defineErrorEvent("process-error", "error", "uid");
export const reprocessDoclingFailed = defineErrorEvent("reprocess-docling-failed", "warning", "filename");
export const reprocessError = defineErrorEvent("reprocess-error", "error", "filename");
