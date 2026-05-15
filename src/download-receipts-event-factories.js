/**
 * Event factories for download-receipts progress events emitted by
 * src/download-receipts.js, src/receipt-search-pipeline.js,
 * src/receipt-output-tree.js, src/pdf-converter.js, and src/llm-receipt-extraction.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

// From download-receipts.js and listReceiptVendors
/** @type {((name: string, user: string) => { type: "search-account" } & Record<string, any>) & { type: "search-account" }} */
export const searchAccount = defineEvent("search-account", "name", "user");
/** @type {((matchCount: number, excludedCount: number, vendor: string | null) => { type: "vendor-filter-applied" } & Record<string, any>) & { type: "vendor-filter-applied" }} */
export const vendorFilterApplied = defineEvent("vendor-filter-applied", "matchCount", "excludedCount", "vendor");
/** @type {((count: number) => { type: "subject-exclusions" } & Record<string, any>) & { type: "subject-exclusions" }} */
export const subjectExclusions = defineEvent("subject-exclusions", "count");
/** @type {((count: number) => { type: "unique-receipts" } & Record<string, any>) & { type: "unique-receipts" }} */
export const uniqueReceipts = defineEvent("unique-receipts", "count");
/** @type {((vendor: string, confidence: number) => { type: "skip-non-invoice" } & Record<string, any>) & { type: "skip-non-invoice" }} */
export const skipNonInvoice = defineEvent("skip-non-invoice", "vendor", "confidence");
/** @type {((vendor: string, confidence: number) => { type: "skip-low-confidence" } & Record<string, any>) & { type: "skip-low-confidence" }} */
export const skipLowConfidence = defineEvent("skip-low-confidence", "vendor", "confidence");
/** @type {((vendor: string, invoiceNumber: string) => { type: "skip-existing-invoice" } & Record<string, any>) & { type: "skip-existing-invoice" }} */
export const skipExistingInvoice = defineEvent("skip-existing-invoice", "vendor", "invoiceNumber");
/** @type {(() => { type: "llm-enabled" }) & { type: "llm-enabled" }} */
export const llmEnabled = defineEvent("llm-enabled");
/** @type {(() => { type: "llm-disabled" }) & { type: "llm-disabled" }} */
export const llmDisabled = defineEvent("llm-disabled");
/** @type {((stats: object) => { type: "download-summary" } & Record<string, any>) & { type: "download-summary" }} */
export const downloadSummary = defineEvent("download-summary", "stats");

// From download-receipts.js (reprocess flow)
/** @type {((outputDir: string) => { type: "reprocess-start" } & Record<string, any>) & { type: "reprocess-start" }} */
export const reprocessStart = defineEvent("reprocess-start", "outputDir");
/** @type {((filename: string | undefined) => { type: "reprocess-dry-run" } & Record<string, any>) & { type: "reprocess-dry-run" }} */
export const reprocessDryRun = defineEvent("reprocess-dry-run", "filename");
/** @type {((filename: string | undefined) => { type: "reprocess-dry-run-body" } & Record<string, any>) & { type: "reprocess-dry-run-body" }} */
export const reprocessDryRunBody = defineEvent("reprocess-dry-run-body", "filename");
/** @type {((filename: string | undefined) => { type: "reprocess-using-body" } & Record<string, any>) & { type: "reprocess-using-body" }} */
export const reprocessUsingBody = defineEvent("reprocess-using-body", "filename");
/** @type {((filename: string | undefined, reason: string) => { type: "reprocess-skipped" } & Record<string, any>) & { type: "reprocess-skipped" }} */
export const reprocessSkipped = defineEvent("reprocess-skipped", "filename", "reason");
/** @type {((filename: string | undefined) => { type: "reprocess-no-data" } & Record<string, any>) & { type: "reprocess-no-data" }} */
export const reprocessNoData = defineEvent("reprocess-no-data", "filename");
/** @type {((filename: string | undefined) => { type: "reprocess-reclassified" } & Record<string, any>) & { type: "reprocess-reclassified" }} */
export const reprocessReclassified = defineEvent("reprocess-reclassified", "filename");
/** @type {((filename: string | undefined) => { type: "reprocess-updated" } & Record<string, any>) & { type: "reprocess-updated" }} */
export const reprocessUpdated = defineEvent("reprocess-updated", "filename");
/** @type {((reprocessed: number, skipped: number, reclassified: number, errors: number) => { type: "reprocess-summary" } & Record<string, any>) & { type: "reprocess-summary" }} */
export const reprocessSummary = defineEvent("reprocess-summary", "reprocessed", "skipped", "reclassified", "errors");

// From receipt-search-pipeline.js
/** @type {((mailbox: string, messageCount: number) => { type: "mailbox-search-start" } & Record<string, any>) & { type: "mailbox-search-start" }} */
export const mailboxSearchStart = defineEvent("mailbox-search-start", "mailbox", "messageCount");
/** @type {((mailbox: string, count: number) => { type: "mailbox-candidates" } & Record<string, any>) & { type: "mailbox-candidates" }} */
export const mailboxCandidates = defineEvent("mailbox-candidates", "mailbox", "count");

// From receipt-output-tree.js
/** @type {((label: string) => { type: "skip-duplicate" } & Record<string, any>) & { type: "skip-duplicate" }} */
export const skipDuplicate = defineEvent("skip-duplicate", "label");
/** @type {((filename: string) => { type: "dry-run-pdf" } & Record<string, any>) & { type: "dry-run-pdf" }} */
export const dryRunPdf = defineEvent("dry-run-pdf", "filename");
/** @type {((filename: string) => { type: "dry-run-json" } & Record<string, any>) & { type: "dry-run-json" }} */
export const dryRunJson = defineEvent("dry-run-json", "filename");
/** @type {((filename: string) => { type: "dry-run-metadata" } & Record<string, any>) & { type: "dry-run-metadata" }} */
export const dryRunMetadata = defineEvent("dry-run-metadata", "filename");
/** @type {((filename: string, size: number) => { type: "downloaded-pdf" } & Record<string, any>) & { type: "downloaded-pdf" }} */
export const downloadedPdf = defineEvent("downloaded-pdf", "filename", "size");
/** @type {((filename: string) => { type: "wrote-metadata" } & Record<string, any>) & { type: "wrote-metadata" }} */
export const wroteMetadata = defineEvent("wrote-metadata", "filename");

// From pdf-converter.js
/** @type {((uid: string | number) => { type: "using-pdf-content" } & Record<string, any>) & { type: "using-pdf-content" }} */
export const usingPdfContent = defineEvent("using-pdf-content", "uid");
/** @type {((error: Error, uid: string | number) => { type: "docling-failed", severity: string, error: Error } & Record<string, any>) & { type: "docling-failed" }} */
export const doclingFailed = defineErrorEvent("docling-failed", "warning", "uid");
/** @type {((error: Error, uid: string | number, pdfPath: string) => { type: "docling-conversion-failed", severity: string, error: Error } & Record<string, any>) & { type: "docling-conversion-failed" }} */
export const doclingConversionFailed = defineErrorEvent("docling-conversion-failed", "warning", "uid", "pdfPath");

// From llm-receipt-extraction.js
/** @type {((error: Error) => { type: "llm-not-configured", severity: string, error: Error }) & { type: "llm-not-configured" }} */
export const llmNotConfigured = defineErrorEvent("llm-not-configured", "warning");
/** @type {((error: Error) => { type: "llm-extraction-failed", severity: string, error: Error }) & { type: "llm-extraction-failed" }} */
export const llmExtractionFailed = defineErrorEvent("llm-extraction-failed", "warning");

// From receipt-search-pipeline.js
/** @type {((error: Error, mailbox: string) => { type: "search-term-error", severity: string, error: Error } & Record<string, any>) & { type: "search-term-error" }} */
export const searchTermError = defineErrorEvent("search-term-error", "warning", "mailbox");
/** @type {((error: Error) => { type: "mailbox-fetch-error", severity: string, error: Error }) & { type: "mailbox-fetch-error" }} */
export const mailboxFetchError = defineErrorEvent("mailbox-fetch-error", "warning");

// From download-receipts.js
/** @type {((error: Error, path: string, level: string) => { type: "output-tree-error", severity: string, error: Error } & Record<string, any>) & { type: "output-tree-error" }} */
export const outputTreeError = defineErrorEvent("output-tree-error", "warning", "path", "level");
/** @type {((error: Error, uid: string | number) => { type: "process-error", severity: string, error: Error } & Record<string, any>) & { type: "process-error" }} */
export const processError = defineErrorEvent("process-error", "error", "uid");
/** @type {((error: Error, filename: string | undefined) => { type: "reprocess-docling-failed", severity: string, error: Error } & Record<string, any>) & { type: "reprocess-docling-failed" }} */
export const reprocessDoclingFailed = defineErrorEvent("reprocess-docling-failed", "warning", "filename");
/** @type {((error: Error, filename: string | undefined) => { type: "reprocess-error", severity: string, error: Error } & Record<string, any>) & { type: "reprocess-error" }} */
export const reprocessError = defineErrorEvent("reprocess-error", "error", "filename");
