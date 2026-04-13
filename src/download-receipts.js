import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { simpleParser } from "mailparser";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { resolveAccounts } from "./cli-helpers.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import { SubprocessGateway } from "./gateways/subprocess-gateway.js";
import { htmlToText } from "./html-to-text.js";
import { forEachAccount as _forEachAccount, listMailboxes as _listMailboxes } from "./imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "./imap-orchestration.js";
import {
  createLlmBroker,
  extractMetadataWithLLM,
  extractReceiptMetadata,
  sanitizeForAgentOutput,
} from "./llm-receipt-extraction.js";
import { pdfToText, resolveExtractionText } from "./pdf-converter.js";
import { applyReceiptFilters } from "./receipt-filters.js";
import {
  collectSidecarFiles,
  loadExistingHashes,
  loadExistingInvoiceNumbers,
  writeReceiptOutput,
} from "./receipt-output-tree.js";
import { searchAccountForReceipts, searchMailboxForReceipts } from "./receipt-search-pipeline.js";
import { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";
import { matchesVendor } from "./vendor-map.js";

export { RECEIPT_EXTRACTION_SCHEMA } from "./llm-receipt-extraction.js";
export { searchMailboxForReceipts } from "./receipt-search-pipeline.js";
export { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";

/**
 * Process a single receipt email: download, parse, extract metadata,
 * check dedup, and write output files.
 * @param {object} client - connected IMAP client
 * @param {object} msg - envelope result with uid, from, subject, date, mailbox, accountName
 * @param {object} context
 * @param {string} context.accountName
 * @param {string} context.outputDir
 * @param {boolean} context.dryRun
 * @param {{ broker: any }|null} context.llm
 * @param {Set<string>} context.existingInvoiceNumbers
 * @param {Set<string>} context.existingHashes
 * @param {Set<string>} context.usedPaths
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} context.fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} context.subprocess
 * @param {function(object): void} [context.onProgress] - receives structured progress events
 * @returns {Promise<{ action: 'downloaded'|'noPdf'|'skipped'|'duplicate'|'error', metadata?: object }>}
 */
async function processReceiptMessage(client, msg, context) {
  const {
    accountName,
    outputDir,
    dryRun,
    llm,
    existingInvoiceNumbers,
    existingHashes,
    usedPaths,
    fs,
    subprocess,
    onProgress = () => {},
  } = context;

  try {
    // Download and parse the full message
    const raw = await client.download(String(msg.uid), undefined, { uid: true });
    const chunks = [];
    for await (const chunk of raw.content) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    const parsed = await simpleParser(buf);

    const bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");
    const emailDate = parsed.date || msg.date || new Date();

    // Find PDF attachments early — needed to decide extraction source
    const pdfAttachments = (parsed.attachments || []).filter(
      (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
    );

    const extractionText = resolveExtractionText(pdfAttachments, bodyText, msg.uid, fs, subprocess, onProgress);
    const metadata = await extractReceiptMetadata(
      llm,
      extractionText,
      parsed.subject || msg.subject,
      msg.fromAddress,
      msg.fromName,
      emailDate,
      onProgress,
    );

    metadata.source_account = accountName.toLowerCase();
    metadata.email_uid = msg.uid;
    metadata.source_body_snippet = sanitizeForAgentOutput(bodyText.length > 2000 ? bodyText.slice(0, 2000) : bodyText);

    // Check LLM classification — skip non-invoices
    if (metadata.is_invoice === false) {
      onProgress({ type: "skip-non-invoice", vendor: metadata.vendor, confidence: metadata.confidence || 0 });
      return { action: "skipped" };
    }
    if (metadata.confidence !== null && metadata.confidence < 0.4) {
      onProgress({ type: "skip-low-confidence", vendor: metadata.vendor, confidence: metadata.confidence });
      return { action: "skipped" };
    }

    // Invoice number dedup
    if (metadata.invoice_number && existingInvoiceNumbers.has(metadata.invoice_number)) {
      onProgress({ type: "skip-existing-invoice", vendor: metadata.vendor, invoiceNumber: metadata.invoice_number });
      return { action: "duplicate" };
    }

    const result = writeReceiptOutput({
      metadata,
      pdfAttachments,
      msg,
      bodyText,
      parsed,
      emailDate,
      outputDir,
      dryRun,
      existingHashes,
      usedPaths,
      fs,
      onProgress,
    });

    if (result.action === "downloaded" && metadata.invoice_number) {
      existingInvoiceNumbers.add(metadata.invoice_number);
    }
    if (result.action === "downloaded" && pdfAttachments.length > 0) {
      const contentHash = createHash("sha256").update(pdfAttachments[0].content).digest("hex");
      existingHashes.add(contentHash);
    }

    return result;
  } catch (err) {
    onProgress({ type: "process-error", uid: msg.uid, error: err });
    return { action: "error" };
  }
}

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
 * Download receipt PDFs and create JSON sidecar metadata files.
 * @param {object} [opts]
 * @param {string}  [opts.outputDir="."] - root output directory
 * @param {number}  [opts.months=12] - how far back to search
 * @param {string}  [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {string}  [opts.vendor] - filter to a specific vendor (substring match)
 * @param {boolean} [opts.dryRun=false] - show what would be done
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
  const months = opts.months ?? 12;
  const outputDir = resolve(opts.outputDir || ".");
  const accountFilter = opts.account || null;

  const since = opts.since
    ? new Date(opts.since)
    : (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return d;
      })();

  const targetAccounts = resolveAccounts(accountFilter, loadAccounts);

  const existingInvoiceNumbers = loadExistingInvoiceNumbers(outputDir, fs);
  const existingHashes = loadExistingHashes(outputDir, fs);
  const usedPaths = new Set();

  const stats = { found: 0, downloaded: 0, noPdf: 0, skipped: 0, alreadyHave: 0, errors: 0 };
  const records = [];

  // Initialize LLM broker for receipt data extraction (null if no API key available)
  const llm = _createLlmBroker(openAiKey, onProgress);
  if (llm) {
    onProgress({ type: "llm-enabled" });
  } else {
    onProgress({ type: "llm-disabled" });
  }

  await forEachAccount(targetAccounts, async (client, account) => {
    onProgress({ type: "search-account", name: account.name, user: account.user });

    // Phase 1: discover receipt emails across all mailboxes
    const searchResults = await searchAccountForReceipts(client, account, since, {
      listMailboxes,
      searchMailboxForReceipts: (client, accountName, mbPath, since) =>
        searchMailboxForReceipts(client, accountName, mbPath, since, onProgress),
    });
    const {
      filtered: unique,
      vendorExcluded,
      subjectExcluded,
    } = applyReceiptFilters(searchResults, opts, matchesVendor, RECEIPT_SUBJECT_EXCLUSIONS);

    if (vendorExcluded > 0) {
      onProgress({
        type: "vendor-filter-applied",
        matchCount: unique.length,
        excludedCount: vendorExcluded,
        vendor: opts.vendor || null,
      });
    }
    if (subjectExcluded > 0) {
      onProgress({ type: "subject-exclusions", count: subjectExcluded });
    }
    onProgress({ type: "unique-receipts", count: unique.length });
    stats.found += unique.length;

    // Phase 2: process each email (grouped by mailbox for IMAP efficiency)
    const byMailbox = groupByMailbox(unique);
    await forEachMailboxGroup(client, byMailbox, async (_mailbox, messages) => {
      for (const msg of messages) {
        const context = {
          accountName: account.name,
          outputDir,
          dryRun,
          llm,
          existingInvoiceNumbers,
          existingHashes,
          usedPaths,
          fs,
          subprocess,
          onProgress,
        };
        const { action, metadata } = await processReceiptMessage(client, msg, context);
        if (action === "downloaded") {
          stats.downloaded++;
          records.push(/** @type {object} */ (metadata));
        } else if (action === "noPdf") {
          stats.noPdf++;
          records.push(/** @type {object} */ (metadata));
        } else if (action === "skipped") {
          stats.skipped++;
        } else if (action === "duplicate") {
          stats.alreadyHave++;
        } else if (action === "error") {
          stats.errors++;
        }
      }
    });
  });

  onProgress({ type: "download-summary", stats });

  return { stats, records };
}

/**
 * List vendors found in receipt emails across accounts.
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

  const since = opts.since
    ? opts.since
    : (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return d;
      })();

  const targetAccounts = resolveAccounts(accountFilter, loadAccounts);

  /** @type {Map<string, { vendor: string, address: string, count: number }>} */
  const vendorCounts = new Map();

  await forEachAccount(targetAccounts, async (client, account) => {
    onProgress({ type: "search-account", name: account.name, user: account.user });

    const unique = await searchAccountForReceipts(client, account, since, {
      listMailboxes,
      searchMailboxForReceipts: (client, accountName, mbPath, since) =>
        searchMailboxForReceipts(client, accountName, mbPath, since, onProgress),
    });

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
  });

  return [...vendorCounts.values()].sort((a, b) => b.count - a.count);
}

/**
 * Reprocess existing receipt files — re-run LLM extraction on downloaded PDFs.
 * @param {object} opts
 * @param {string} opts.outputDir - directory containing receipts
 * @param {string} [opts.vendor] - filter to specific vendor
 * @param {Date} [opts.since] - only reprocess files newer than this date
 * @param {boolean} [opts.dryRun]
 * @param {object} [gateways] - injectable dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
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

  onProgress({ type: "reprocess-start", outputDir });

  const sidecars = collectSidecarFiles(outputDir, fs, (err, ctx) =>
    onProgress({ type: "process-error", uid: ctx.path, error: err }),
  );
  const stats = { reprocessed: 0, skipped: 0, errors: 0, reclassified: 0 };
  const results = [];

  for (const { jsonPath, sidecar } of sidecars) {
    const baseName = jsonPath.replace(/\.json$/, "");
    const pdfPath = `${baseName}.pdf`;
    const jsonFilename = jsonPath.split("/").pop();

    // Filter by vendor
    if (vendorFilter && sidecar.vendor) {
      if (!sidecar.vendor.toLowerCase().includes(vendorFilter.toLowerCase())) {
        continue;
      }
    }

    // Filter by since date
    if (sinceDate && sidecar.date) {
      const sidecarDate = new Date(sidecar.date);
      if (!Number.isNaN(sidecarDate.getTime()) && sidecarDate < sinceDate) {
        continue;
      }
    }

    // Check if a corresponding PDF exists
    const hasPdf = fs.exists(pdfPath);

    let extractionText = null;

    if (hasPdf) {
      if (dryRun) {
        onProgress({ type: "reprocess-dry-run", filename: jsonFilename });
        stats.reprocessed++;
        results.push({ file: jsonFilename, status: "dry-run" });
        continue;
      }
      const pdfMarkdown = pdfToText(pdfPath, fs, subprocess);
      if (pdfMarkdown) {
        extractionText = pdfMarkdown;
      } else {
        onProgress({ type: "reprocess-docling-failed", filename: jsonFilename });
        stats.errors++;
        results.push({ file: jsonFilename, status: "error", reason: "docling conversion failed" });
        continue;
      }
    } else if (sidecar.source_body_snippet) {
      if (dryRun) {
        onProgress({ type: "reprocess-dry-run-body", filename: jsonFilename });
        stats.reprocessed++;
        results.push({ file: jsonFilename, status: "dry-run" });
        continue;
      }
      extractionText = sidecar.source_body_snippet;
      onProgress({ type: "reprocess-using-body", filename: jsonFilename });
    } else {
      onProgress({ type: "reprocess-skipped", filename: jsonFilename, reason: "no PDF and no body snippet" });
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

      if (!metadata) {
        onProgress({ type: "reprocess-no-data", filename: jsonFilename });
        stats.errors++;
        results.push({ file: jsonFilename, status: "error", reason: "LLM extraction failed" });
        continue;
      }

      if (metadata.is_invoice === false) {
        onProgress({ type: "reprocess-reclassified", filename: jsonFilename });
        fs.rm(jsonPath, { force: true });
        stats.reclassified++;
        results.push({ file: jsonFilename, status: "reclassified", reason: "non-invoice" });
        continue;
      }

      // Preserve fields from the original sidecar that aren't part of extraction
      const updated = {
        ...metadata,
        source_account: sidecar.source_account || metadata.source_account,
        email_uid: sidecar.email_uid || metadata.email_uid,
        receipt_file: sidecar.receipt_file || metadata.receipt_file,
        source_body_snippet: sidecar.source_body_snippet || null,
        downloadedAt: sidecar.downloadedAt || null,
        reprocessedAt: new Date().toISOString(),
      };

      fs.writeFile(jsonPath, JSON.stringify(updated, null, 2));
      onProgress({ type: "reprocess-updated", filename: jsonFilename });
      stats.reprocessed++;
      results.push({ file: jsonFilename, status: "reprocessed" });
    } catch (err) {
      onProgress({ type: "reprocess-error", filename: jsonFilename, error: err });
      stats.errors++;
      results.push({ file: jsonFilename, status: "error", reason: err.message });
    }
  }

  onProgress({
    type: "reprocess-summary",
    reprocessed: stats.reprocessed,
    skipped: stats.skipped,
    reclassified: stats.reclassified,
    errors: stats.errors,
  });

  return { ...stats, results };
}
