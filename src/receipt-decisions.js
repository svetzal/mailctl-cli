/**
 * Pure classification and transformation decisions for receipt processing.
 * No I/O — all inputs are plain values, outputs are plain objects.
 */

import {
  budgetExceeded,
  emptyExtractionSkipped,
  maxReached,
  skipExistingInvoice,
  skipLowConfidence,
  skipNonInvoice,
} from "./download-receipts-event-factories.js";

export const MIN_INVOICE_CONFIDENCE = 0.4;

/**
 * Returns true when extraction produced no useful data — no amount, no invoice number, and no PDF.
 * Sidecars for these emails carry no bookkeeping value and are skipped by default.
 *
 * @param {object} metadata - extracted receipt metadata
 * @param {Array} pdfAttachments - PDF attachments found in the email
 * @returns {boolean}
 */
export function isEmptyExtraction(metadata, pdfAttachments) {
  return pdfAttachments.length === 0 && metadata.amount == null && metadata.invoice_number == null;
}

/**
 * Classifies a receipt extraction result into one of: skipped, duplicate, skippedEmpty, proceed.
 * Returns a plain decision object — never calls onProgress.
 *
 * @param {object} metadata - extracted receipt metadata
 * @param {Array} pdfAttachments - PDF attachments found in the email
 * @param {object} opts
 * @param {boolean} opts.includeEmpty - when true, skippedEmpty is never returned
 * @param {Set<string>} opts.existingInvoiceNumbers - already-seen invoice numbers
 * @param {number} opts.minConfidence - minimum confidence threshold
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
  if (metadata.confidence !== null && metadata.confidence < minConfidence) {
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
 * @param {object} sidecar - sidecar JSON data
 * @param {object} opts
 * @param {string|null} opts.vendorFilter - substring match on sidecar.vendor (case-insensitive); null = no filter
 * @param {Date|null} opts.sinceDate - exclude sidecars older than this date; null = no filter
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
 * @param {object} metadata - fresh extraction result
 * @param {object} sidecar - original sidecar with fields to preserve
 * @param {string} reprocessedAt - ISO timestamp injected by the shell
 * @returns {object}
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
 * @param {object|null|undefined} metadata - fresh extraction result, or falsy if extraction failed
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
 * @param {object} decision - result from classifyReceiptExtraction
 * @param {object} metadata - extracted receipt metadata
 * @param {object} msg - message envelope with fromName, fromAddress
 * @param {Date} emailDate - email date
 * @returns {object|null}
 */
export function receiptDecisionEvent(decision, metadata, msg, emailDate) {
  switch (decision.event) {
    case "skipNonInvoice":
      return skipNonInvoice(decision.vendor ?? "", decision.confidence ?? 0);
    case "skipLowConfidence":
      return skipLowConfidence(decision.vendor ?? "", decision.confidence ?? 0);
    case "skipExistingInvoice":
      return skipExistingInvoice(decision.vendor ?? "", decision.invoice_number ?? "");
    case "emptyExtractionSkipped":
      return emptyExtractionSkipped(
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
    return { stop: true, event: maxReached(maxMessages) };
  }
  if (budgetMs !== null && now - startedAt >= budgetMs) {
    return { stop: true, event: budgetExceeded(budgetMs) };
  }
  return { stop: false, event: null };
}

/**
 * Returns a new stats object with the counter for the given action incremented by 1.
 * Unknown actions return the original stats unchanged.
 *
 * @param {object} stats
 * @param {string} action
 * @returns {object}
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
