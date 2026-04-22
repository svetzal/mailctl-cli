/**
 * Pure renderer for download-receipts progress events.
 * No I/O — returns a string (or null for unknown event types).
 */
import { formatKB } from "./format-bytes.js";
import { createEventRenderer } from "./render-shared-events.js";

export const renderDownloadReceiptsEvent = createEventRenderer({
  "llm-enabled": () => "Using LLM (gpt-5-mini) for receipt data extraction",
  "llm-disabled": () => "OPENAI_API_KEY not set — using pattern-based extraction",
  "llm-not-configured": (e) => `   Warning: Could not initialize LLM broker: ${e.error.message}`,
  "search-account": (e) => `\nSearching ${e.name} (${e.user})...`,
  "mailbox-search-start": (e) => `   ${e.mailbox} (${e.messageCount} messages)...`,
  "mailbox-candidates": (e) => `      ${e.count} candidates`,
  "mailbox-fetch-error": (e) => `      Fetch failed: ${e.error.message}`,
  "search-term-error": (e) => `   Search error in ${e.mailbox}: ${e.error.message}`,
  "vendor-filter-applied": (e) =>
    `   Filtered to ${e.matchCount} of ${e.matchCount + e.excludedCount} messages matching vendor "${e.vendor}"`,
  "subject-exclusions": (e) => `   Excluded ${e.count} non-invoice subjects`,
  "unique-receipts": (e) => `   ${e.count} unique receipt emails`,
  "using-pdf-content": (e) => `      Using PDF content for extraction (UID ${e.uid})`,
  "docling-failed": (e) => `      Docling failed for UID ${e.uid}: ${e.error.message}`,
  "llm-extraction-failed": (e) => `   LLM extraction failed: ${e.error.message}`,
  "skip-non-invoice": (e) =>
    `   Skipping ${e.vendor} — classified as non-invoice (confidence: ${(e.confidence || 0).toFixed(2)})`,
  "skip-low-confidence": (e) => `   Skipping ${e.vendor} — low confidence ${e.confidence.toFixed(2)}`,
  "skip-existing-invoice": (e) => `   Skipping ${e.vendor} ${e.invoiceNumber} — already exists`,
  "skip-duplicate": (e) => `   Skipping ${e.label} — duplicate content`,
  "dry-run-pdf": (e) => `   [DRY RUN] ${e.filename}`,
  "dry-run-json": (e) => `   [DRY RUN] ${e.filename}`,
  "downloaded-pdf": (e) => `   Downloaded: ${e.filename} (${formatKB(e.size)})`,
  "dry-run-metadata": (e) => `   [DRY RUN] ${e.filename} (no PDF)`,
  "wrote-metadata": (e) => `   Wrote metadata: ${e.filename} (no PDF)`,
  "process-error": (e) => `   Error processing UID ${e.uid}: ${e.error.message}`,
  "download-summary": (e) => {
    const s = e.stats;
    return [
      `\n=== Download Complete ===`,
      `Found:       ${s.found}`,
      `Downloaded:  ${s.downloaded}`,
      `No PDF:      ${s.noPdf}`,
      `Skipped:     ${s.skipped} (non-invoice or low confidence)`,
      `Duplicates:  ${s.alreadyHave}`,
      `Errors:      ${s.errors}`,
    ].join("\n");
  },
  "reprocess-start": (e) => `Reprocessing receipts in ${e.outputDir}...`,
  "reprocess-dry-run": (e) => `  [DRY RUN] ${e.filename} — would reprocess`,
  "reprocess-docling-failed": (e) => `  ❌ ${e.filename} — docling conversion failed`,
  "reprocess-dry-run-body": (e) => `  [DRY RUN] ${e.filename} — would reprocess (body snippet)`,
  "reprocess-using-body": (e) => `      Using stored body snippet for extraction (${e.filename})`,
  "reprocess-skipped": (e) => `  ⏭️  ${e.filename} — no PDF and no body snippet, skipped`,
  "reprocess-no-data": (e) => `  ❌ ${e.filename} — LLM extraction returned no data`,
  "reprocess-reclassified": (e) => `  🗑️  ${e.filename} — reclassified as non-invoice, removing`,
  "reprocess-updated": (e) => `  ✅ ${e.filename} — updated metadata`,
  "reprocess-error": (e) => `  ❌ ${e.filename} — extraction failed: ${e.error.message}`,
  "reprocess-summary": (e) =>
    `\nReprocessed: ${e.reprocessed}, Skipped: ${e.skipped}, Reclassified: ${e.reclassified}, Errors: ${e.errors}`,
});
