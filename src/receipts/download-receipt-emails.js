/** @typedef {import('./receipt-types.js').ReceiptMetadata} ReceiptMetadata */
/** @typedef {import('./receipt-types.js').ReceiptStats} ReceiptStats */
/** @typedef {import('./receipt-types.js').ReceiptRunState} ReceiptRunState */
/** @typedef {import('./receipt-types.js').ReceiptMessageEnvelope} ReceiptMessageEnvelope */
/** @typedef {import('./receipt-types.js').ReceiptProcessContext} ReceiptProcessContext */
/** @typedef {import('./receipt-types.js').ReceiptRun} ReceiptRun */
/** @typedef {import('./receipt-types.js').LlmContext} LlmContext */

import { resolve } from "node:path";
import { resolveAccounts } from "../cli-helpers.js";
import { forEachMailboxGroup, groupByMailbox } from "../imap-orchestration.js";
import { monthsAgo } from "../parse-date.js";
import { rethrowIfProgrammerError } from "../programmer-error.js";
import { EXTRACT_DEFAULT_MONTHS } from "../receipt-defaults.js";
import { matchesVendor } from "../vendor-map.js";
import { withTimeout } from "../with-timeout.js";
import {
  llmDisabled,
  llmEnabled,
  messageStart,
  messageTimeout,
  processError,
} from "./download-receipts-event-factories.js";
import {
  applyReceiptFilters,
  receiptFilterEvents,
  shouldStopProcessing,
  tallyReceiptAction,
} from "./receipt-decisions.js";
import { DEFAULT_PER_MESSAGE_TIMEOUT_MS, resolveGateways } from "./receipt-gateways.js";
import { createReceiptRun, createReceiptWriteContext } from "./receipt-run.js";
import { forEachReceiptSearchAccount } from "./receipt-search-pipeline.js";
import { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";

/**
 * Normalizes raw CLI opts into a resolved config object.
 * Does not touch `startedAt` (wall-clock) or `targetAccounts` (needs loadAccounts gateway).
 * @param {object} opts
 * @returns {{ dryRun: boolean, includeEmpty: boolean, months: number, outputDir: string, accountFilter: string|null, maxMessages: number|null, perMessageTimeoutMs: number, budgetMs: number|null, since: Date }}
 */
export function resolveDownloadReceiptsOptions(opts) {
  const dryRun = opts.dryRun ?? false;
  const includeEmpty = opts.includeEmpty ?? false;
  const months = opts.months ?? EXTRACT_DEFAULT_MONTHS;
  const outputDir = resolve(opts.outputDir || ".");
  const accountFilter = opts.account || null;
  const maxMessages = opts.max ?? null;
  const perMessageTimeoutMs = opts.timeoutMs ?? DEFAULT_PER_MESSAGE_TIMEOUT_MS;
  const budgetMs = opts.budgetMs ?? null;
  const since = opts.since ? new Date(opts.since) : monthsAgo(months);
  return { dryRun, includeEmpty, months, outputDir, accountFilter, maxMessages, perMessageTimeoutMs, budgetMs, since };
}

/**
 * Process a single receipt message with timeout handling.
 * Returns a discriminated outcome so the caller folds results without nested branching.
 *
 * @param {{ client: object, msg: ReceiptMessageEnvelope, context: ReceiptProcessContext, perMessageTimeoutMs: number, processMessage: function }} params
 * @param {function(object): void} onProgress
 * @returns {Promise<{ outcome: 'success'|'timedOut'|'error', action?: string, metadata?: ReceiptMetadata }>}
 */
async function processOneReceiptMessage({ client, msg, context, perMessageTimeoutMs, processMessage }, onProgress) {
  try {
    const { action, metadata } = await withTimeout(
      () => processMessage(client, msg, context),
      perMessageTimeoutMs,
      `UID ${msg.uid} (${msg.fromName || msg.fromAddress})`,
    );
    return { outcome: "success", action, metadata };
  } catch (err) {
    rethrowIfProgrammerError(err);
    if (/** @type {any} */ (err).code === "ETIMEDOUT") {
      onProgress(messageTimeout(msg.uid, perMessageTimeoutMs));
      return { outcome: "timedOut" };
    }
    onProgress(processError(err, msg.uid));
    return { outcome: "error" };
  }
}

/**
 * Builds a ReceiptProcessContext for a specific account from a ReceiptRun.
 *
 * @param {string} accountName
 * @param {ReceiptRun} run
 * @returns {ReceiptProcessContext}
 */
function toProcessContext(accountName, run) {
  const { outputDir, dryRun, includeEmpty, existingInvoiceNumbers, existingHashes, usedPaths, fs, subprocess } =
    run.writeContext;
  return {
    accountName,
    outputDir,
    dryRun,
    includeEmpty,
    llm: run.llm,
    existingInvoiceNumbers,
    existingHashes,
    usedPaths,
    fs,
    subprocess,
    onProgress: run.onProgress,
  };
}

/**
 * Filters search results, emits filter events, and bumps found/searchFailures on runState.
 *
 * @param {ReceiptMessageEnvelope[]} searchResults
 * @param {unknown[]} accountSearchFailures
 * @param {ReceiptRun} run
 * @returns {ReceiptMessageEnvelope[]}
 */
function selectAccountReceipts(searchResults, accountSearchFailures, run) {
  run.runState.stats.searchFailures = (run.runState.stats.searchFailures ?? 0) + accountSearchFailures.length;
  const opts = { vendor: run.vendorFilter };
  const {
    filtered: unique,
    vendorExcluded,
    subjectExcluded,
  } = applyReceiptFilters(searchResults, opts, matchesVendor, RECEIPT_SUBJECT_EXCLUSIONS);
  receiptFilterEvents({
    uniqueCount: unique.length,
    vendorExcluded,
    subjectExcluded,
    vendor: run.vendorFilter,
  }).forEach(run.onProgress);
  run.runState.stats.found += unique.length;
  return unique;
}

/**
 * Processes a mailbox batch, folding results into shared runState.
 *
 * @param {object} client - IMAP client
 * @param {ReceiptMessageEnvelope[]} messages - messages to process in this batch
 * @param {ReceiptProcessContext} context - per-account process context
 * @param {ReceiptRun} run
 * @param {number} total - total messages in this account batch (for progress display)
 * @returns {Promise<void>}
 */
async function processReceiptMessageGroup(client, messages, context, run, total) {
  const { perMessageTimeoutMs, maxMessages, startedAt, budgetMs } = run.limits;
  for (const msg of messages) {
    if (run.runState.stopped) break;
    run.runState.processedCount++;
    run.onProgress(
      messageStart(run.runState.processedCount, total, msg.fromName || msg.fromAddress, msg.subject || ""),
    );
    const result = await processOneReceiptMessage(
      { client, msg, context, perMessageTimeoutMs, processMessage: run.processMessage },
      run.onProgress,
    );
    if (result.outcome === "timedOut") {
      run.runState.stats.timedOut = (run.runState.stats.timedOut ?? 0) + 1;
    } else if (result.outcome === "error") {
      run.runState.stats.errors++;
    } else {
      const action = /** @type {string} */ (result.action);
      run.runState.stats = tallyReceiptAction(run.runState.stats, action);
      if (action === "downloaded" || action === "noPdf") {
        run.runState.records.push(/** @type {ReceiptMetadata} */ (result.metadata));
      }
    }
    const stop = shouldStopProcessing(
      { processedCount: run.runState.processedCount, maxMessages, startedAt, budgetMs },
      performance.now(),
    );
    if (stop.stop) {
      run.onProgress(stop.event);
      run.runState.stopped = true;
      break;
    }
  }
}

/**
 * Per-account handler for forEachReceiptSearchAccount.
 * Filters, groups by mailbox, and processes each message batch.
 *
 * @param {object} client - IMAP client
 * @param {{ name: string }} account - account descriptor
 * @param {ReceiptMessageEnvelope[]} searchResults - raw search results from the pipeline
 * @param {unknown[]} accountSearchFailures - search errors from the pipeline
 * @param {ReceiptRun} run
 * @returns {Promise<void>}
 */
async function processAccountReceipts(client, account, searchResults, accountSearchFailures, run) {
  const unique = selectAccountReceipts(searchResults, accountSearchFailures, run);
  const context = toProcessContext(account.name, run);
  const byMailbox = groupByMailbox(/** @type {{ mailbox: string }[]} */ (unique));
  await forEachMailboxGroup(client, byMailbox, (_mailbox, messages) =>
    processReceiptMessageGroup(client, messages, context, run, unique.length),
  );
}

/**
 * Announces whether LLM extraction is enabled for this run.
 * @param {LlmContext|null} llm
 * @param {function(object): void} onProgress
 */
function announceLlm(llm, onProgress) {
  onProgress(llm ? llmEnabled() : llmDisabled());
}

/**
 * @param {object} [opts]
 * @param {string}  [opts.outputDir="."] - root output directory
 * @param {number}  [opts.months=12] - how far back to search
 * @param {string}  [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {string}  [opts.vendor] - filter to a specific vendor (substring match)
 * @param {boolean} [opts.dryRun=false] - show what would be done
 * @param {boolean} [opts.includeEmpty=false] - also write sidecars when LLM extraction is empty
 * @param {number|null} [opts.max] - stop after processing this many messages (null = unlimited)
 * @param {number}  [opts.timeoutMs] - per-message timeout in milliseconds (default: 120000)
 * @param {number|null} [opts.budgetMs] - overall wall-clock budget in milliseconds (null = unlimited)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ stats: ReceiptStats, records: ReceiptMetadata[] }>}
 */
export async function downloadReceiptEmails(opts = {}, gateways = {}, onProgress = () => {}) {
  const merged = resolveGateways(gateways);
  const resolvedOpts = resolveDownloadReceiptsOptions(opts);
  const { outputDir, since, accountFilter } = resolvedOpts;
  const startedAt = performance.now();
  const targetAccounts = resolveAccounts(accountFilter, merged.loadAccounts);

  const writeContext = createReceiptWriteContext(
    {
      outputDir,
      dryRun: resolvedOpts.dryRun,
      includeEmpty: resolvedOpts.includeEmpty,
      fs: merged.fs,
      subprocess: merged.subprocess,
    },
    onProgress,
  );
  const llm = merged.createLlmBroker(merged.openAiKey, onProgress);
  announceLlm(llm, onProgress);
  const run = createReceiptRun({
    resolvedOpts,
    writeContext,
    llm,
    processMessage: merged.processMessage,
    startedAt,
    vendorFilter: opts.vendor ?? null,
    onProgress,
  });
  run.runState.stats.indexErrors = writeContext.indexErrors;

  await forEachReceiptSearchAccount(
    targetAccounts,
    since,
    { forEachAccount: merged.forEachAccount, listMailboxes: merged.listMailboxes, onProgress },
    (client, account, searchResults, accountSearchFailures) =>
      processAccountReceipts(client, account, searchResults, accountSearchFailures, run),
  );

  return { stats: run.runState.stats, records: run.runState.records };
}
