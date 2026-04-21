/**
 * Pure renderer for download-receipts progress events.
 * No I/O — returns a string (or null for unknown event types).
 */
import { formatKB } from "./format-bytes.js";
import { renderSharedEvent } from "./render-shared-events.js";

/**
 * Render a download-receipts progress event as a human-readable string.
 *
 * @param {object} event
 * @returns {string | null}
 */
export function renderDownloadReceiptsEvent(event) {
  switch (event.type) {
    case "llm-enabled":
      return "Using LLM (gpt-5-mini) for receipt data extraction";
    case "llm-disabled":
      return "OPENAI_API_KEY not set — using pattern-based extraction";
    case "llm-not-configured":
      return `   Warning: Could not initialize LLM broker: ${event.error.message}`;
    case "search-account":
      return `\nSearching ${event.name} (${event.user})...`;
    case "mailbox-search-start":
      return `   ${event.mailbox} (${event.messageCount} messages)...`;
    case "mailbox-candidates":
      return `      ${event.count} candidates`;
    case "mailbox-fetch-error":
      return `      Fetch failed: ${event.error.message}`;
    case "search-term-error":
      return `   Search error in ${event.mailbox}: ${event.error.message}`;
    case "vendor-filter-applied":
      return `   Filtered to ${event.matchCount} of ${event.matchCount + event.excludedCount} messages matching vendor "${event.vendor}"`;
    case "subject-exclusions":
      return `   Excluded ${event.count} non-invoice subjects`;
    case "unique-receipts":
      return `   ${event.count} unique receipt emails`;
    case "using-pdf-content":
      return `      Using PDF content for extraction (UID ${event.uid})`;
    case "docling-failed":
      return `      Docling failed for UID ${event.uid}: ${event.error.message}`;
    case "llm-extraction-failed":
      return `   LLM extraction failed: ${event.error.message}`;
    case "skip-non-invoice":
      return `   Skipping ${event.vendor} — classified as non-invoice (confidence: ${(event.confidence || 0).toFixed(2)})`;
    case "skip-low-confidence":
      return `   Skipping ${event.vendor} — low confidence ${(event.confidence).toFixed(2)}`;
    case "skip-existing-invoice":
      return `   Skipping ${event.vendor} ${event.invoiceNumber} — already exists`;
    case "skip-duplicate":
      return `   Skipping ${event.label} — duplicate content`;
    case "dry-run-pdf":
      return `   [DRY RUN] ${event.filename}`;
    case "dry-run-json":
      return `   [DRY RUN] ${event.filename}`;
    case "downloaded-pdf":
      return `   Downloaded: ${event.filename} (${formatKB(event.size)})`;
    case "dry-run-metadata":
      return `   [DRY RUN] ${event.filename} (no PDF)`;
    case "wrote-metadata":
      return `   Wrote metadata: ${event.filename} (no PDF)`;
    case "process-error":
      return `   Error processing UID ${event.uid}: ${event.error.message}`;
    case "download-summary": {
      const s = event.stats;
      return [
        `\n=== Download Complete ===`,
        `Found:       ${s.found}`,
        `Downloaded:  ${s.downloaded}`,
        `No PDF:      ${s.noPdf}`,
        `Skipped:     ${s.skipped} (non-invoice or low confidence)`,
        `Duplicates:  ${s.alreadyHave}`,
        `Errors:      ${s.errors}`,
      ].join("\n");
    }
    case "reprocess-start":
      return `Reprocessing receipts in ${event.outputDir}...`;
    case "reprocess-dry-run":
      return `  [DRY RUN] ${event.filename} — would reprocess`;
    case "reprocess-docling-failed":
      return `  ❌ ${event.filename} — docling conversion failed`;
    case "reprocess-dry-run-body":
      return `  [DRY RUN] ${event.filename} — would reprocess (body snippet)`;
    case "reprocess-using-body":
      return `      Using stored body snippet for extraction (${event.filename})`;
    case "reprocess-skipped":
      return `  ⏭️  ${event.filename} — no PDF and no body snippet, skipped`;
    case "reprocess-no-data":
      return `  ❌ ${event.filename} — LLM extraction returned no data`;
    case "reprocess-reclassified":
      return `  🗑️  ${event.filename} — reclassified as non-invoice, removing`;
    case "reprocess-updated":
      return `  ✅ ${event.filename} — updated metadata`;
    case "reprocess-error":
      return `  ❌ ${event.filename} — extraction failed: ${event.error.message}`;
    case "reprocess-summary":
      return `\nReprocessed: ${event.reprocessed}, Skipped: ${event.skipped}, Reclassified: ${event.reclassified}, Errors: ${event.errors}`;
    default:
      return renderSharedEvent(event);
  }
}
