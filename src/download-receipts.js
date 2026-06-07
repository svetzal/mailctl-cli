import { resolve } from "node:path";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { resolveAccounts } from "./cli-helpers.js";
import {
  downloadSummary,
  llmDisabled,
  llmEnabled,
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
  subjectExclusions,
  uniqueReceipts,
  vendorFilterApplied,
} from "./download-receipts-event-factories.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import { SubprocessGateway } from "./gateways/subprocess-gateway.js";
import { forEachAccount as _forEachAccount, listMailboxes as _listMailboxes } from "./imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "./imap-orchestration.js";
import { createLlmBroker, extractMetadataWithLLM } from "./llm-receipt-extraction.js";
import { monthsAgo } from "./parse-date.js";
import { pdfToText } from "./pdf-converter.js";
import { processReceiptMessage } from "./process-receipt-message.js";
import {
  buildReprocessedSidecar,
  classifyReprocessResult,
  sidecarPassesFilters,
  tallyReceiptAction,
} from "./receipt-decisions.js";
import { applyReceiptFilters } from "./receipt-filters.js";
import { collectSidecarFiles, loadExistingHashes, loadExistingInvoiceNumbers } from "./receipt-output-tree.js";
import { forEachReceiptSearchAccount } from "./receipt-search-pipeline.js";
import { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";
import { matchesVendor } from "./vendor-map.js";

export { RECEIPT_EXTRACTION_SCHEMA } from "./llm-receipt-extraction.js";
export { searchMailboxForReceipts } from "./receipt-search-pipeline.js";
export { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";

/** Singleton gateway instances used in production. */
const _defaultFs = new FileSystemGateway();
const _defaultSubprocess = new SubprocessGateway();

/**
 * Default production gateways. Tests override individual keys.
 */
const defaultGateways = {
  fs: _defaultFs,
  subprocess: _defaultSubprocess,
  loadAccounts: _loadAccounts,
  forEachAccount: _forEachAccount,
  listMailboxes: _listMailboxes,
  createLlmBroker,
  openAiKey: /** @type {string|null} */ (null),
};

/**
 * @param {object} [opts]
 * @param {string}  [opts.outputDir="."] - root output directory
 * @param {number}  [opts.months=12] - how far back to search
 * @param {string}  [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {string}  [opts.vendor] - filter to a specific vendor (substring match)
 * @param {boolean} [opts.dryRun=false] - show what would be done
 * @param {boolean} [opts.includeEmpty=false] - also write sidecars when LLM extraction is empty (no amount, no invoice number, no PDF)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ stats: object, records: Array }>}
 */
export async function downloadReceiptEmails(opts = {}, gateways = {}, onProgress = () => {}) {
  const {
    fs,
    subprocess,
    loadAccounts,
    forEachAccount,
    listMailboxes,
    createLlmBroker: _createLlmBroker,
    openAiKey,
  } = { ...defaultGateways, ...gateways };

  const dryRun = opts.dryRun ?? false;
  const includeEmpty = opts.includeEmpty ?? false;
  const months = opts.months ?? 12;
  const outputDir = resolve(opts.outputDir || ".");
  const accountFilter = opts.account || null;

  const since = opts.since ? new Date(opts.since) : monthsAgo(months);

  const targetAccounts = resolveAccounts(accountFilter, loadAccounts);

  const existingInvoiceNumbers = loadExistingInvoiceNumbers(outputDir, fs, (err, ctx) =>
    onProgress(outputTreeError(err, ctx.path, ctx.level)),
  );
  const existingHashes = loadExistingHashes(outputDir, fs, (err, ctx) =>
    onProgress(outputTreeError(err, ctx.path, ctx.level)),
  );
  const usedPaths = new Set();

  let stats = { found: 0, downloaded: 0, noPdf: 0, skipped: 0, skippedEmpty: 0, alreadyHave: 0, errors: 0 };
  const records = [];

  // Initialize LLM broker for receipt data extraction (null if no API key available)
  const llm = _createLlmBroker(openAiKey, onProgress);
  if (llm) {
    onProgress(llmEnabled());
  } else {
    onProgress(llmDisabled());
  }

  await forEachReceiptSearchAccount(
    targetAccounts,
    since,
    { forEachAccount, listMailboxes, onProgress },
    async (client, account, searchResults) => {
      const {
        filtered: unique,
        vendorExcluded,
        subjectExcluded,
      } = applyReceiptFilters(searchResults, opts, matchesVendor, RECEIPT_SUBJECT_EXCLUSIONS);

      if (vendorExcluded > 0) {
        onProgress(vendorFilterApplied(unique.length, vendorExcluded, opts.vendor || null));
      }
      if (subjectExcluded > 0) {
        onProgress(subjectExclusions(subjectExcluded));
      }
      onProgress(uniqueReceipts(unique.length));
      stats.found += unique.length;

      // Phase 2: process each email (grouped by mailbox for IMAP efficiency)
      const byMailbox = groupByMailbox(unique);
      await forEachMailboxGroup(client, byMailbox, async (_mailbox, messages) => {
        for (const msg of messages) {
          const context = {
            accountName: account.name,
            outputDir,
            dryRun,
            includeEmpty,
            llm,
            existingInvoiceNumbers,
            existingHashes,
            usedPaths,
            fs,
            subprocess,
            onProgress,
          };
          const { action, metadata } = await processReceiptMessage(client, msg, context);
          stats = tallyReceiptAction(stats, action);
          if (action === "downloaded" || action === "noPdf") {
            records.push(/** @type {object} */ (metadata));
          }
        }
      });
    },
  );

  onProgress(downloadSummary(stats));

  return { stats, records };
}

/**
 * Returns an array of { vendor, count } sorted by count descending.
 * @param {object} [opts]
 * @param {number}  [opts.months=3] - how far back to search
 * @param {Date}    [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array<{ vendor: string, address: string, count: number }>>}
 */
export async function listReceiptVendors(opts = {}, gateways = {}, onProgress = () => {}) {
  const { loadAccounts, forEachAccount, listMailboxes } = { ...defaultGateways, ...gateways };

  const months = opts.months ?? 3;
  const accountFilter = opts.account || null;

  const since = opts.since ? opts.since : monthsAgo(months);

  const targetAccounts = resolveAccounts(accountFilter, loadAccounts);

  /** @type {Map<string, { vendor: string, address: string, count: number }>} */
  const vendorCounts = new Map();

  await forEachReceiptSearchAccount(
    targetAccounts,
    since,
    { forEachAccount, listMailboxes, onProgress },
    async (_client, _account, unique) => {
      for (const msg of unique) {
        const key = msg.fromAddress;
        const existing = vendorCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          vendorCounts.set(key, {
            vendor: msg.fromName || msg.fromAddress,
            address: msg.fromAddress,
            count: 1,
          });
        }
      }
    },
  );

  return [...vendorCounts.values()].sort((a, b) => b.count - a.count);
}

/**
 * @param {object} opts
 * @param {string} opts.outputDir - directory containing receipts
 * @param {string} [opts.vendor] - filter to specific vendor
 * @param {Date} [opts.since] - only reprocess files newer than this date
 * @param {boolean} [opts.dryRun]
 * @param {object} [gateways] - injectable dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @throws {Error} when OPENAI_API_KEY is not available
 * @returns {Promise<{reprocessed: number, skipped: number, errors: number, reclassified: number, results: Array}>}
 */
export async function reprocessReceipts(opts, gateways = {}, onProgress = () => {}) {
  const { fs, subprocess, createLlmBroker: _createLlmBroker, openAiKey } = { ...defaultGateways, ...gateways };

  const outputDir = resolve(opts.outputDir || ".");
  const dryRun = opts.dryRun ?? false;
  const vendorFilter = opts.vendor || null;
  const sinceDate = opts.since || null;

  const llm = _createLlmBroker(openAiKey, onProgress);
  if (!llm) {
    throw new Error("OPENAI_API_KEY not set — LLM extraction is required for reprocessing.");
  }

  onProgress(reprocessStart(outputDir));

  const sidecars = collectSidecarFiles(outputDir, fs, (err, ctx) => onProgress(processError(err, ctx.path)));
  const stats = { reprocessed: 0, skipped: 0, errors: 0, reclassified: 0 };
  const results = [];

  for (const { jsonPath, sidecar } of sidecars) {
    const baseName = jsonPath.replace(/\.json$/, "");
    const pdfPath = `${baseName}.pdf`;
    const jsonFilename = jsonPath.split("/").pop();

    if (!sidecarPassesFilters(sidecar, { vendorFilter, sinceDate })) {
      continue;
    }

    // Check if a corresponding PDF exists
    const hasPdf = fs.exists(pdfPath);

    let extractionText = null;

    if (hasPdf) {
      if (dryRun) {
        onProgress(reprocessDryRun(jsonFilename));
        stats.reprocessed++;
        results.push({ file: jsonFilename, status: "dry-run" });
        continue;
      }
      const pdfMarkdown = pdfToText(pdfPath, fs, subprocess);
      if (pdfMarkdown) {
        extractionText = pdfMarkdown;
      } else {
        onProgress(reprocessDoclingFailed(new Error("docling conversion failed"), jsonFilename));
        stats.errors++;
        results.push({ file: jsonFilename, status: "error", reason: "docling conversion failed" });
        continue;
      }
    } else if (sidecar.source_body_snippet) {
      if (dryRun) {
        onProgress(reprocessDryRunBody(jsonFilename));
        stats.reprocessed++;
        results.push({ file: jsonFilename, status: "dry-run" });
        continue;
      }
      extractionText = sidecar.source_body_snippet;
      onProgress(reprocessUsingBody(jsonFilename));
    } else {
      onProgress(reprocessSkipped(jsonFilename, "no PDF and no body snippet"));
      stats.skipped++;
      results.push({ file: jsonFilename, status: "skipped", reason: "no PDF and no body snippet" });
      continue;
    }

    // Re-run extraction
    try {
      const metadata = await extractMetadataWithLLM(
        llm.broker,
        extractionText,
        sidecar.subject || "",
        sidecar.source_email || "",
        sidecar.vendor || "",
        sidecar.date ? new Date(sidecar.date) : new Date(),
      );

      const reprocessDecision = classifyReprocessResult(metadata);

      if (reprocessDecision.action === "noData") {
        onProgress(reprocessNoData(jsonFilename));
        stats.errors++;
        results.push({ file: jsonFilename, status: "error", reason: "LLM extraction failed" });
        continue;
      }

      if (reprocessDecision.action === "reclassified") {
        onProgress(reprocessReclassified(jsonFilename));
        fs.rm(jsonPath, { force: true });
        stats.reclassified++;
        results.push({ file: jsonFilename, status: "reclassified", reason: "non-invoice" });
        continue;
      }

      const reprocessedAt = new Date().toISOString();
      const updated = buildReprocessedSidecar(metadata, sidecar, reprocessedAt);

      fs.writeFile(jsonPath, JSON.stringify(updated, null, 2));
      onProgress(reprocessUpdated(jsonFilename));
      stats.reprocessed++;
      results.push({ file: jsonFilename, status: "reprocessed" });
    } catch (err) {
      onProgress(reprocessError(err, jsonFilename));
      stats.errors++;
      results.push({ file: jsonFilename, status: "error", reason: err.message });
    }
  }

  onProgress(reprocessSummary(stats.reprocessed, stats.skipped, stats.reclassified, stats.errors));

  return { ...stats, results };
}
