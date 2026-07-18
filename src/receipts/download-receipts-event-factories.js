/**
 * Event factories for download-receipts progress events emitted by
 * src/download-receipts.js, src/receipt-search-pipeline.js,
 * src/receipt-output-tree.js, src/pdf-converter.js, and src/llm-receipt-extraction.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
 */

/** @typedef {import('./receipt-types.js').ReceiptStats} ReceiptStats */

// Per-message flow events
/**
 * @typedef {object} MessageStartEvent
 * @property {'message-start'} type
 * @property {number} index
 * @property {number} total
 * @property {string} vendor
 * @property {string} subject
 */
/**
 * @typedef {object} MessageTimeoutEvent
 * @property {'message-timeout'} type
 * @property {number} uid
 * @property {number} ms
 */
/**
 * @typedef {object} MaxReachedEvent
 * @property {'max-reached'} type
 * @property {number} max
 */
/**
 * @typedef {object} BudgetExceededEvent
 * @property {'budget-exceeded'} type
 * @property {number} ms
 */

// Account and filter events
/**
 * @typedef {object} SearchAccountEvent
 * @property {'search-account'} type
 * @property {string} name
 * @property {string} user
 */
/**
 * @typedef {object} VendorFilterAppliedEvent
 * @property {'vendor-filter-applied'} type
 * @property {number} matchCount
 * @property {number} excludedCount
 * @property {string} vendor
 */
/**
 * @typedef {object} SubjectExclusionsEvent
 * @property {'subject-exclusions'} type
 * @property {number} count
 */
/**
 * @typedef {object} UniqueReceiptsEvent
 * @property {'unique-receipts'} type
 * @property {number} count
 */

// Skip decision events
/**
 * @typedef {object} SkipNonInvoiceEvent
 * @property {'skip-non-invoice'} type
 * @property {string} vendor
 * @property {number} confidence
 */
/**
 * @typedef {object} SkipLowConfidenceEvent
 * @property {'skip-low-confidence'} type
 * @property {string} vendor
 * @property {number} confidence
 */
/**
 * @typedef {object} SkipExistingInvoiceEvent
 * @property {'skip-existing-invoice'} type
 * @property {string} vendor
 * @property {string} invoiceNumber
 */
/**
 * @typedef {object} EmptyExtractionSkippedEvent
 * @property {'empty-extraction-skipped'} type
 * @property {string} vendor
 * @property {string} sourceEmail
 * @property {Date} date
 */

// LLM state events
/**
 * @typedef {object} LlmEnabledEvent
 * @property {'llm-enabled'} type
 */
/**
 * @typedef {object} LlmDisabledEvent
 * @property {'llm-disabled'} type
 */

// Summary event
/**
 * @typedef {object} DownloadSummaryEvent
 * @property {'download-summary'} type
 * @property {ReceiptStats} stats
 */

// Reprocess flow events
/**
 * @typedef {object} ReprocessStartEvent
 * @property {'reprocess-start'} type
 * @property {string} outputDir
 */
/**
 * @typedef {object} ReprocessDryRunEvent
 * @property {'reprocess-dry-run'} type
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessDryRunBodyEvent
 * @property {'reprocess-dry-run-body'} type
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessUsingBodyEvent
 * @property {'reprocess-using-body'} type
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessSkippedEvent
 * @property {'reprocess-skipped'} type
 * @property {string} filename
 * @property {string} reason
 */
/**
 * @typedef {object} ReprocessNoDataEvent
 * @property {'reprocess-no-data'} type
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessReclassifiedEvent
 * @property {'reprocess-reclassified'} type
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessUpdatedEvent
 * @property {'reprocess-updated'} type
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessSummaryEvent
 * @property {'reprocess-summary'} type
 * @property {number} reprocessed
 * @property {number} skipped
 * @property {number} reclassified
 * @property {number} errors
 */

// Receipt search pipeline events
/**
 * @typedef {object} MailboxSearchStartEvent
 * @property {'mailbox-search-start'} type
 * @property {string} mailbox
 * @property {number} messageCount
 */
/**
 * @typedef {object} MailboxCandidatesEvent
 * @property {'mailbox-candidates'} type
 * @property {string} mailbox
 * @property {number} count
 */

// Receipt output tree events
/**
 * @typedef {object} SkipDuplicateEvent
 * @property {'skip-duplicate'} type
 * @property {string} label
 */
/**
 * @typedef {object} DryRunPdfEvent
 * @property {'dry-run-pdf'} type
 * @property {string} filename
 */
/**
 * @typedef {object} DryRunJsonEvent
 * @property {'dry-run-json'} type
 * @property {string} filename
 */
/**
 * @typedef {object} DryRunMetadataEvent
 * @property {'dry-run-metadata'} type
 * @property {string} filename
 */
/**
 * @typedef {object} DownloadedPdfEvent
 * @property {'downloaded-pdf'} type
 * @property {string} filename
 * @property {number} size
 */
/**
 * @typedef {object} WroteMetadataEvent
 * @property {'wrote-metadata'} type
 * @property {string} filename
 */

// PDF converter events
/**
 * @typedef {object} UsingPdfContentEvent
 * @property {'using-pdf-content'} type
 * @property {number} uid
 */
/**
 * @typedef {object} DoclingFailedEvent
 * @property {'docling-failed'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {number} uid
 */
/**
 * @typedef {object} DoclingConversionFailedEvent
 * @property {'docling-conversion-failed'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {number} uid
 * @property {string} pdfPath
 */

// LLM extraction events
/**
 * @typedef {object} LlmNotConfiguredEvent
 * @property {'llm-not-configured'} type
 * @property {'warning'} severity
 * @property {Error} error
 */
/**
 * @typedef {object} LlmExtractionFailedEvent
 * @property {'llm-extraction-failed'} type
 * @property {'warning'} severity
 * @property {Error} error
 */

// Search error events
/**
 * @typedef {object} SearchTermErrorEvent
 * @property {'search-term-error'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} mailbox
 */
/**
 * @typedef {object} MailboxFetchErrorEvent
 * @property {'mailbox-fetch-error'} type
 * @property {'warning'} severity
 * @property {Error} error
 */

// Process error events
/**
 * @typedef {object} OutputTreeErrorEvent
 * @property {'output-tree-error'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} path
 * @property {string} level
 */
/**
 * @typedef {object} ProcessErrorEvent
 * @property {'process-error'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {number} uid
 */
/**
 * @typedef {object} ReprocessDoclingFailedEvent
 * @property {'reprocess-docling-failed'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} filename
 */
/**
 * @typedef {object} ReprocessErrorEvent
 * @property {'reprocess-error'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {string} filename
 */

/**
 * @typedef {MessageStartEvent | MessageTimeoutEvent | MaxReachedEvent | BudgetExceededEvent
 *   | SearchAccountEvent | VendorFilterAppliedEvent | SubjectExclusionsEvent | UniqueReceiptsEvent
 *   | SkipNonInvoiceEvent | SkipLowConfidenceEvent | SkipExistingInvoiceEvent | EmptyExtractionSkippedEvent
 *   | LlmEnabledEvent | LlmDisabledEvent | DownloadSummaryEvent
 *   | ReprocessStartEvent | ReprocessDryRunEvent | ReprocessDryRunBodyEvent | ReprocessUsingBodyEvent
 *   | ReprocessSkippedEvent | ReprocessNoDataEvent | ReprocessReclassifiedEvent | ReprocessUpdatedEvent | ReprocessSummaryEvent
 *   | MailboxSearchStartEvent | MailboxCandidatesEvent
 *   | SkipDuplicateEvent | DryRunPdfEvent | DryRunJsonEvent | DryRunMetadataEvent | DownloadedPdfEvent | WroteMetadataEvent
 *   | UsingPdfContentEvent | DoclingFailedEvent | DoclingConversionFailedEvent
 *   | LlmNotConfiguredEvent | LlmExtractionFailedEvent
 *   | SearchTermErrorEvent | MailboxFetchErrorEvent
 *   | OutputTreeErrorEvent | ProcessErrorEvent | ReprocessDoclingFailedEvent | ReprocessErrorEvent} DownloadReceiptsEvent
 */

import { defineCommandEventTable } from "../command-event-table.js";
import { formatKB } from "../format-date.js";

const TABLE = {
  // From download-receipts.js — per-message progress and flow control
  messageStart: {
    params: ["index", "total", "vendor", "subject"],
    render: (e) => `[${e.index}/${e.total}] ${e.vendor} — ${e.subject}`,
  },
  messageTimeout: {
    params: ["uid", "ms"],
    render: (e) => `   ⚠ Timed out after ${e.ms}ms (UID ${e.uid}) — skipping`,
  },
  maxReached: {
    params: ["max"],
    render: (e) => `\nStopped after ${e.max} messages (--max limit reached)`,
  },
  budgetExceeded: {
    params: ["ms"],
    render: (e) => `\nStopped: wall-clock budget of ${Math.round(e.ms / 1000)}s exceeded`,
  },

  // From download-receipts.js and listReceiptVendors
  searchAccount: {
    params: ["name", "user"],
    render: (e) => `\nSearching ${e.name} (${e.user})...`,
  },
  vendorFilterApplied: {
    params: ["matchCount", "excludedCount", "vendor"],
    render: (e) =>
      `   Filtered to ${e.matchCount} of ${e.matchCount + e.excludedCount} messages matching vendor "${e.vendor}"`,
  },
  subjectExclusions: {
    params: ["count"],
    render: (e) => `   Excluded ${e.count} non-invoice subjects`,
  },
  uniqueReceipts: {
    params: ["count"],
    render: (e) => `   ${e.count} unique receipt emails`,
  },
  skipNonInvoice: {
    params: ["vendor", "confidence"],
    render: (e) =>
      `   Skipping ${e.vendor} — classified as non-invoice (confidence: ${(e.confidence || 0).toFixed(2)})`,
  },
  skipLowConfidence: {
    params: ["vendor", "confidence"],
    render: (e) => `   Skipping ${e.vendor} — low confidence ${e.confidence.toFixed(2)}`,
  },
  skipExistingInvoice: {
    params: ["vendor", "invoiceNumber"],
    render: (e) => `   Skipping ${e.vendor} ${e.invoiceNumber} — already exists`,
  },
  emptyExtractionSkipped: {
    params: ["vendor", "sourceEmail", "date"],
    render: (e) => `   Skipping ${e.vendor || e.sourceEmail} — empty extraction (no amount, no invoice number, no PDF)`,
  },
  llmEnabled: {
    render: () => "Using LLM (gpt-5-mini) for receipt data extraction",
  },
  llmDisabled: {
    render: () => "OPENAI_API_KEY not set — using pattern-based extraction",
  },
  downloadSummary: {
    params: ["stats"],
    render: (e) => {
      const s = e.stats;
      const lines = [
        `\n=== Download Complete ===`,
        `Found:       ${s.found}`,
        `Downloaded:  ${s.downloaded}`,
        `No PDF:      ${s.noPdf}`,
        `Skipped:     ${s.skipped} (non-invoice or low confidence)`,
        `Empty:       ${s.skippedEmpty ?? 0} (no amount, no invoice number, no PDF)`,
        `Duplicates:  ${s.alreadyHave}`,
        `Errors:      ${s.errors}`,
        `Timed out:   ${s.timedOut ?? 0}`,
      ];
      if ((s.searchFailures ?? 0) > 0) {
        lines.push(
          `⚠ ${s.searchFailures} mailbox search${s.searchFailures === 1 ? "" : "es"} failed — results may be incomplete`,
        );
      }
      return lines.join("\n");
    },
  },

  // From download-receipts.js (reprocess flow)
  reprocessStart: {
    params: ["outputDir"],
    render: (e) => `Reprocessing receipts in ${e.outputDir}...`,
  },
  reprocessDryRun: {
    params: ["filename"],
    render: (e) => `  [DRY RUN] ${e.filename} — would reprocess`,
  },
  reprocessDryRunBody: {
    params: ["filename"],
    render: (e) => `  [DRY RUN] ${e.filename} — would reprocess (body snippet)`,
  },
  reprocessUsingBody: {
    params: ["filename"],
    render: (e) => `      Using stored body snippet for extraction (${e.filename})`,
  },
  reprocessSkipped: {
    params: ["filename", "reason"],
    render: (e) => `  ⏭️  ${e.filename} — ${e.reason}, skipped`,
  },
  reprocessNoData: {
    params: ["filename"],
    render: (e) => `  ❌ ${e.filename} — LLM extraction returned no data`,
  },
  reprocessReclassified: {
    params: ["filename"],
    render: (e) => `  🗑️  ${e.filename} — reclassified as non-invoice, removing`,
  },
  reprocessUpdated: {
    params: ["filename"],
    render: (e) => `  ✅ ${e.filename} — updated metadata`,
  },
  reprocessSummary: {
    params: ["reprocessed", "skipped", "reclassified", "errors"],
    render: (e) =>
      `\nReprocessed: ${e.reprocessed}, Skipped: ${e.skipped}, Reclassified: ${e.reclassified}, Errors: ${e.errors}`,
  },

  // From receipt-search-pipeline.js
  mailboxSearchStart: {
    params: ["mailbox", "messageCount"],
    render: (e) => `   ${e.mailbox} (${e.messageCount} messages)...`,
  },
  mailboxCandidates: {
    params: ["mailbox", "count"],
    render: (e) => `      ${e.count} candidates`,
  },

  // From receipt-output-tree.js
  skipDuplicate: {
    params: ["label"],
    render: (e) => `   Skipping ${e.label} — duplicate content`,
  },
  dryRunPdf: {
    params: ["filename"],
    render: (e) => `   [DRY RUN] ${e.filename}`,
  },
  dryRunJson: {
    params: ["filename"],
    render: (e) => `   [DRY RUN] ${e.filename}`,
  },
  dryRunMetadata: {
    params: ["filename"],
    render: (e) => `   [DRY RUN] ${e.filename} (no PDF)`,
  },
  downloadedPdf: {
    params: ["filename", "size"],
    render: (e) => `   Downloaded: ${e.filename} (${formatKB(e.size)})`,
  },
  wroteMetadata: {
    params: ["filename"],
    render: (e) => `   Wrote metadata: ${e.filename} (no PDF)`,
  },

  // From pdf-converter.js
  usingPdfContent: {
    params: ["uid"],
    render: (e) => `      Using PDF content for extraction (UID ${e.uid})`,
  },
  doclingFailed: {
    severity: "warning",
    params: ["uid"],
    render: (e) => `      Docling failed for UID ${e.uid}: ${e.error.message}`,
  },
  doclingConversionFailed: {
    severity: "warning",
    params: ["uid", "pdfPath"],
  },

  // From llm-receipt-extraction.js
  llmNotConfigured: {
    severity: "warning",
    render: (e) => `   Warning: Could not initialize LLM broker: ${e.error.message}`,
  },
  llmExtractionFailed: {
    severity: "warning",
    render: (e) => `   LLM extraction failed: ${e.error.message}`,
  },

  // From receipt-search-pipeline.js
  searchTermError: {
    severity: "warning",
    params: ["mailbox"],
    render: (e) => `   Search error in ${e.mailbox}: ${e.error.message}`,
  },
  mailboxFetchError: {
    severity: "warning",
    render: (e) => `      Fetch failed: ${e.error.message}`,
  },

  // From download-receipts.js
  outputTreeError: {
    severity: "warning",
    params: ["path", "level"],
  },
  processError: {
    severity: "error",
    params: ["uid"],
    render: (e) => `   Error processing UID ${e.uid}: ${e.error.message}`,
  },
  reprocessDoclingFailed: {
    severity: "warning",
    params: ["filename"],
    render: (e) => `  ❌ ${e.filename} — docling conversion failed`,
  },
  reprocessError: {
    severity: "error",
    params: ["filename"],
    render: (e) => `  ❌ ${e.filename} — extraction failed: ${e.error.message}`,
  },
};

const { factories, renderEvent } = defineCommandEventTable(TABLE);

export const {
  messageStart,
  messageTimeout,
  maxReached,
  budgetExceeded,
  searchAccount,
  vendorFilterApplied,
  subjectExclusions,
  uniqueReceipts,
  skipNonInvoice,
  skipLowConfidence,
  skipExistingInvoice,
  emptyExtractionSkipped,
  llmEnabled,
  llmDisabled,
  downloadSummary,
  reprocessStart,
  reprocessDryRun,
  reprocessDryRunBody,
  reprocessUsingBody,
  reprocessSkipped,
  reprocessNoData,
  reprocessReclassified,
  reprocessUpdated,
  reprocessSummary,
  mailboxSearchStart,
  mailboxCandidates,
  skipDuplicate,
  dryRunPdf,
  dryRunJson,
  dryRunMetadata,
  downloadedPdf,
  wroteMetadata,
  usingPdfContent,
  doclingFailed,
  doclingConversionFailed,
  llmNotConfigured,
  llmExtractionFailed,
  searchTermError,
  mailboxFetchError,
  outputTreeError,
  processError,
  reprocessDoclingFailed,
  reprocessError,
} = factories;

export const renderDownloadReceiptsEvent = renderEvent;
