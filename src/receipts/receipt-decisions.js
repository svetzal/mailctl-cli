/**
 * Pure classification and transformation decisions for receipt processing.
 * No I/O — all inputs are plain values, outputs are plain objects.
 */

/** @typedef {import('./receipt-types.js').ReceiptMetadata} ReceiptMetadata */
/** @typedef {import('./receipt-types.js').ReceiptSidecar} ReceiptSidecar */
/** @typedef {import('./receipt-types.js').ReceiptStats} ReceiptStats */
/** @typedef {import('./receipt-types.js').ReceiptPdfAttachment} ReceiptPdfAttachment */
/** @typedef {import('./receipt-types.js').ReceiptMessageEnvelope} ReceiptMessageEnvelope */
/** @typedef {import('./receipt-types.js').ManifestRecord} ManifestRecord */

import { createHash } from "node:crypto";
import { receiptEvents } from "./download-receipts-event-factories.js";

export const MIN_INVOICE_CONFIDENCE = 0.4;

/**
 * Returns true when extraction produced no useful data — no amount, no invoice number, and no PDF.
 * Sidecars for these emails carry no bookkeeping value and are skipped by default.
 *
 * @param {ReceiptMetadata} metadata - extracted receipt metadata
 * @param {ReceiptPdfAttachment[]} pdfAttachments - PDF attachments found in the email
 * @returns {boolean}
 */
export function isEmptyExtraction(metadata, pdfAttachments) {
  return pdfAttachments.length === 0 && metadata.amount == null && metadata.invoice_number == null;
}

/**
 * Classifies a receipt extraction result into one of: skipped, duplicate, skippedEmpty, proceed.
 * Returns a plain decision object — never calls onProgress.
 *
 * @param {ReceiptMetadata} metadata - extracted receipt metadata
 * @param {ReceiptPdfAttachment[]} pdfAttachments - PDF attachments found in the email
 * @param {{ includeEmpty: boolean, existingInvoiceNumbers: Set<string>, minConfidence: number }} opts
 * @returns {{ action: 'skipped'|'duplicate'|'skippedEmpty'|'proceed', event?: string, vendor?: string, confidence?: number, invoice_number?: string }}
 */
export function classifyReceiptExtraction(
  metadata,
  pdfAttachments,
  { includeEmpty, existingInvoiceNumbers, minConfidence },
) {
  if (metadata.is_invoice === false) {
    return {
      action: "skipped",
      event: "skipNonInvoice",
      vendor: metadata.vendor,
      confidence: metadata.confidence || 0,
    };
  }
  if (metadata.confidence != null && metadata.confidence < minConfidence) {
    return { action: "skipped", event: "skipLowConfidence", vendor: metadata.vendor, confidence: metadata.confidence };
  }
  if (metadata.invoice_number && existingInvoiceNumbers.has(metadata.invoice_number)) {
    return {
      action: "duplicate",
      event: "skipExistingInvoice",
      vendor: metadata.vendor,
      invoice_number: metadata.invoice_number,
    };
  }
  if (!includeEmpty && isEmptyExtraction(metadata, pdfAttachments)) {
    return { action: "skippedEmpty", event: "emptyExtractionSkipped" };
  }
  return { action: "proceed" };
}

/**
 * Returns true when the sidecar should be processed (passes all active filters).
 *
 * @param {ReceiptSidecar} sidecar - sidecar JSON data
 * @param {{ vendorFilter: string|null, sinceDate: Date|null }} opts
 * @returns {boolean}
 */
export function sidecarPassesFilters(sidecar, { vendorFilter, sinceDate }) {
  if (vendorFilter && sidecar.vendor) {
    if (!sidecar.vendor.toLowerCase().includes(vendorFilter.toLowerCase())) {
      return false;
    }
  }
  if (sinceDate && sidecar.date) {
    const sidecarDate = new Date(sidecar.date);
    if (!Number.isNaN(sidecarDate.getTime()) && sidecarDate < sinceDate) {
      return false;
    }
  }
  return true;
}

/**
 * Merges fresh LLM extraction metadata with preserved fields from the original sidecar.
 * The timestamp must be injected so this function remains pure.
 *
 * @param {ReceiptMetadata} metadata - fresh extraction result
 * @param {ReceiptSidecar} sidecar - original sidecar with fields to preserve
 * @param {string} reprocessedAt - ISO timestamp injected by the shell
 * @returns {ReceiptSidecar}
 */
export function buildReprocessedSidecar(metadata, sidecar, reprocessedAt) {
  return {
    ...metadata,
    source_account: sidecar.source_account || metadata.source_account,
    email_uid: sidecar.email_uid || metadata.email_uid,
    receipt_file: sidecar.receipt_file || metadata.receipt_file,
    source_body_snippet: sidecar.source_body_snippet || null,
    downloadedAt: sidecar.downloadedAt || null,
    reprocessedAt,
  };
}

/**
 * Classifies a reprocess result into one of: noData, reclassified, update.
 *
 * @param {ReceiptMetadata|null|undefined} metadata - fresh extraction result, or falsy if extraction failed
 * @returns {{ action: 'noData'|'reclassified'|'update' }}
 */
export function classifyReprocessResult(metadata) {
  if (!metadata) {
    return { action: "noData" };
  }
  if (metadata.is_invoice === false) {
    return { action: "reclassified" };
  }
  return { action: "update" };
}

/**
 * Maps a non-proceed classification decision to its corresponding progress event object.
 * Returns null for "proceed" decisions or unknown events.
 *
 * @param {{ action: string, event?: string, vendor?: string, confidence?: number, invoice_number?: string }} decision - result from classifyReceiptExtraction
 * @param {ReceiptMetadata} metadata - extracted receipt metadata
 * @param {ReceiptMessageEnvelope} msg - message envelope
 * @param {Date} emailDate - email date
 * @returns {object|null}
 */
export function receiptDecisionEvent(decision, metadata, msg, emailDate) {
  switch (decision.event) {
    case "skipNonInvoice":
      return receiptEvents.skipNonInvoice(decision.vendor ?? "", decision.confidence ?? 0);
    case "skipLowConfidence":
      return receiptEvents.skipLowConfidence(decision.vendor ?? "", decision.confidence ?? 0);
    case "skipExistingInvoice":
      return receiptEvents.skipExistingInvoice(decision.vendor ?? "", decision.invoice_number ?? "");
    case "emptyExtractionSkipped":
      return receiptEvents.emptyExtractionSkipped(
        metadata.vendor || msg.fromName || msg.fromAddress,
        msg.fromAddress,
        (metadata.date || emailDate).toString(),
      );
    default:
      return null;
  }
}

/**
 * Checks whether batch processing should stop based on --max or --budget constraints.
 * Returns the stop flag and the event to emit (null if not stopping).
 *
 * @param {{ processedCount: number, maxMessages: number|null, startedAt: number, budgetMs: number|null }} opts
 * @param {number} now - current timestamp from performance.now()
 * @returns {{ stop: boolean, event: object|null }}
 */
export function shouldStopProcessing({ processedCount, maxMessages, startedAt, budgetMs }, now) {
  if (maxMessages !== null && processedCount >= maxMessages) {
    return { stop: true, event: receiptEvents.maxReached(maxMessages) };
  }
  if (budgetMs !== null && now - startedAt >= budgetMs) {
    return { stop: true, event: receiptEvents.budgetExceeded(budgetMs) };
  }
  return { stop: false, event: null };
}

/**
 * Pure decision: determines which source to use when reprocessing a sidecar.
 * Returns a discriminated plan with no I/O.
 *
 * @param {{ hasPdf: boolean, hasBodySnippet: boolean, dryRun: boolean }} opts
 * @returns {{ kind: 'pdf' | 'body' | 'dryRunPdf' | 'dryRunBody' | 'skip' }}
 */
export function chooseReprocessSource({ hasPdf, hasBodySnippet, dryRun }) {
  if (hasPdf) {
    return { kind: dryRun ? "dryRunPdf" : "pdf" };
  }
  if (hasBodySnippet) {
    return { kind: dryRun ? "dryRunBody" : "body" };
  }
  return { kind: "skip" };
}

/**
 * Returns an ordered array of filter progress event objects for receipt search results.
 * The caller iterates and emits each one — no direct onProgress call here.
 *
 * @param {{ uniqueCount: number, vendorExcluded: number, subjectExcluded: number, vendor: string|null }} opts
 * @returns {Array<object>}
 */
export function receiptFilterEvents({ uniqueCount, vendorExcluded, subjectExcluded, vendor }) {
  const events = [];
  if (vendorExcluded > 0) {
    events.push(receiptEvents.vendorFilterApplied(uniqueCount, vendorExcluded, vendor));
  }
  if (subjectExcluded > 0) {
    events.push(receiptEvents.subjectExclusions(subjectExcluded));
  }
  events.push(receiptEvents.uniqueReceipts(uniqueCount));
  return events;
}

/**
 * Returns a new stats object with the counter for the given action incremented by 1.
 * Unknown actions return the original stats unchanged.
 *
 * @param {ReceiptStats} stats
 * @param {string} action
 * @returns {ReceiptStats}
 */
export function tallyReceiptAction(stats, action) {
  switch (action) {
    case "downloaded":
      return { ...stats, downloaded: stats.downloaded + 1 };
    case "noPdf":
      return { ...stats, noPdf: stats.noPdf + 1 };
    case "skipped":
      return { ...stats, skipped: stats.skipped + 1 };
    case "skippedEmpty":
      return { ...stats, skippedEmpty: stats.skippedEmpty + 1 };
    case "duplicate":
      return { ...stats, alreadyHave: stats.alreadyHave + 1 };
    case "error":
      return { ...stats, errors: stats.errors + 1 };
    default:
      return stats;
  }
}

/**
 * Pure receipt filtering functions — no I/O, no side effects.
 */

/**
 * @param {ReceiptMessageEnvelope[]} results - array of receipt search result objects
 * @param {{ vendor?: string|null }} opts
 * @param {(vendor: string, fromAddress: string, fromName: string) => boolean} matchesVendorFn
 * @param {Array<RegExp>} subjectExclusions - subject patterns to exclude
 * @returns {{ filtered: ReceiptMessageEnvelope[], vendorExcluded: number, subjectExcluded: number }}
 */
export function applyReceiptFilters(results, opts, matchesVendorFn, subjectExclusions) {
  let filtered = results;
  let vendorExcluded = 0;
  let subjectExcluded = 0;

  if (opts.vendor) {
    const vendorStr = opts.vendor;
    const before = filtered.length;
    filtered = filtered.filter((msg) => matchesVendorFn(vendorStr, msg.fromAddress, msg.fromName));
    vendorExcluded = before - filtered.length;
  }

  const beforeExclusion = filtered.length;
  filtered = filtered.filter((msg) => !subjectExclusions.some((re) => re.test(msg.subject ?? "")));
  subjectExcluded = beforeExclusion - filtered.length;

  return { filtered, vendorExcluded, subjectExcluded };
}

// Short hash prefix stored in the manifest for human readability
const MANIFEST_HASH_PREFIX_LENGTH = 12;

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isValidPdf(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString() === "%PDF-";
}

/**
 * @param {Buffer} buffer
 * @returns {string} SHA-256 hex digest
 */
export function contentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * @param {"no-pdf"|"duplicate"|"downloaded"} status
 * @param {{ filename?: string, hash?: string, date?: Date|string, vendor?: string }} [fields]
 * @returns {ManifestRecord}
 */
export function buildManifestRecord(status, { filename, hash, date, vendor } = {}) {
  if (status === "no-pdf") return { status, date };
  if (status === "duplicate") return { status, hash: (hash ?? "").slice(0, MANIFEST_HASH_PREFIX_LENGTH), date, vendor };
  if (status === "downloaded")
    return { status, filename, hash: (hash ?? "").slice(0, MANIFEST_HASH_PREFIX_LENGTH), date, vendor };
  return { status, date };
}
