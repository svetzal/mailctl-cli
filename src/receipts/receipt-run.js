/** @typedef {import('./receipt-types.js').ReceiptMetadata} ReceiptMetadata */
/** @typedef {import('./receipt-types.js').ReceiptStats} ReceiptStats */
/** @typedef {import('./receipt-types.js').ReceiptRunState} ReceiptRunState */
/** @typedef {import('./receipt-types.js').ReceiptWriteContext} ReceiptWriteContext */
/** @typedef {import('./receipt-types.js').ReceiptRunLimits} ReceiptRunLimits */
/** @typedef {import('./receipt-types.js').ReceiptRun} ReceiptRun */
/** @typedef {import('./receipt-types.js').LlmContext} LlmContext */

import { outputTreeError } from "./download-receipts-event-factories.js";
import { loadExistingHashes, loadExistingInvoiceNumbers } from "./receipt-output-tree.js";

/**
 * Returns a fresh run-state object with all counters zeroed.
 * @returns {ReceiptRunState}
 */
export function createReceiptRunState() {
  return {
    stats: {
      found: 0,
      downloaded: 0,
      noPdf: 0,
      skipped: 0,
      skippedEmpty: 0,
      alreadyHave: 0,
      errors: 0,
      timedOut: 0,
      searchFailures: 0,
      indexErrors: 0,
    },
    records: /** @type {ReceiptMetadata[]} */ ([]),
    processedCount: 0,
    stopped: false,
  };
}

/**
 * Loads dedup indexes and seeds an empty usedPaths set for a new write context.
 *
 * @param {{ outputDir: string, dryRun: boolean, includeEmpty: boolean, fs: import('../gateways/fs-gateway.js').FileSystemGateway, subprocess: import('../gateways/subprocess-gateway.js').SubprocessGateway }} params
 * @param {function(object): void} onProgress
 * @returns {ReceiptWriteContext}
 */
export function createReceiptWriteContext({ outputDir, dryRun, includeEmpty, fs, subprocess }, onProgress) {
  let indexErrors = 0;
  const onIndexError = (err, ctx) => {
    indexErrors++;
    onProgress(outputTreeError(err, ctx.path, ctx.level));
  };
  const existingInvoiceNumbers = loadExistingInvoiceNumbers(outputDir, fs, onIndexError);
  const existingHashes = loadExistingHashes(outputDir, fs, onIndexError);
  const usedPaths = new Set();
  return {
    outputDir,
    dryRun,
    includeEmpty,
    existingInvoiceNumbers,
    existingHashes,
    usedPaths,
    fs,
    subprocess,
    indexErrors,
  };
}

/**
 * Assembles a ReceiptRun from its resolved parts.
 *
 * @param {{ resolvedOpts: { maxMessages: number|null, perMessageTimeoutMs: number, budgetMs: number|null }, writeContext: ReceiptWriteContext, llm: LlmContext|null, processMessage: function, startedAt: number, vendorFilter: string|null, onProgress: function(object): void }} params
 * @returns {ReceiptRun}
 */
export function createReceiptRun({
  resolvedOpts,
  writeContext,
  llm,
  processMessage,
  startedAt,
  vendorFilter,
  onProgress,
}) {
  const { maxMessages, perMessageTimeoutMs, budgetMs } = resolvedOpts;
  return {
    writeContext,
    limits: { startedAt, maxMessages, budgetMs, perMessageTimeoutMs },
    llm,
    runState: createReceiptRunState(),
    vendorFilter: vendorFilter ?? null,
    processMessage,
    onProgress,
  };
}
