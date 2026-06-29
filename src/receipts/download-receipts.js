import { resolve } from "node:path";
import { loadAccounts as _loadAccounts } from "../accounts.js";
import { resolveAccounts } from "../cli-helpers.js";
import { FileSystemGateway } from "../gateways/fs-gateway.js";
import { SubprocessGateway } from "../gateways/subprocess-gateway.js";
import { forEachAccount as _forEachAccount, listMailboxes as _listMailboxes } from "../imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "../imap-orchestration.js";
import { monthsAgo } from "../parse-date.js";
import { matchesVendor } from "../vendor-map.js";
import { withTimeout } from "../with-timeout.js";
import {
  downloadSummary,
  llmDisabled,
  llmEnabled,
  messageStart,
  messageTimeout,
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
} from "./download-receipts-event-factories.js";
import { createLlmBroker, extractMetadataWithLLM } from "./llm-receipt-extraction.js";
import { pdfToText } from "./pdf-converter.js";
import { processReceiptMessage } from "./process-receipt-message.js";
import {
  applyReceiptFilters,
  buildReprocessedSidecar,
  chooseReprocessSource,
  classifyReprocessResult,
  receiptFilterEvents,
  shouldStopProcessing,
  sidecarPassesFilters,
  tallyReceiptAction,
} from "./receipt-decisions.js";
import { collectSidecarFiles, loadExistingHashes, loadExistingInvoiceNumbers } from "./receipt-output-tree.js";
import { forEachReceiptSearchAccount } from "./receipt-search-pipeline.js";
import { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";

export { RECEIPT_EXTRACTION_SCHEMA } from "./llm-receipt-extraction.js";
export { searchMailboxForReceipts } from "./receipt-search-pipeline.js";
export { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";

/** Singleton gateway instances used in production. */
const _defaultFs = new FileSystemGateway();
const _defaultSubprocess = new SubprocessGateway();

/** Default per-message timeout: 2 minutes. */
const DEFAULT_PER_MESSAGE_TIMEOUT_MS = 120_000;

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
  processMessage: processReceiptMessage,
  openAiKey: /** @type {string|null} */ (null),
};

/**
 * Process a single receipt message with timeout handling.
 * Returns a discriminated outcome so the caller folds results without nested branching.
 *
 * @param {{ client: any, msg: object, context: object, perMessageTimeoutMs: number, processMessage: function }} params
 * @param {function(object): void} onProgress
 * @returns {Promise<{ outcome: 'success'|'timedOut'|'error', action?: string, metadata?: object }>}
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
    if (/** @type {any} */ (err).code === "ETIMEDOUT") {
      onProgress(messageTimeout(msg.uid, perMessageTimeoutMs));
      return { outcome: "timedOut" };
    }
    onProgress(processError(err, msg.uid));
    return { outcome: "error" };
  }
}

/**
 * Processes a mailbox batch, folding results into shared runState.
 * Separates per-message loop logic from the account-level orchestrator.
 *
 * @param {object} client - IMAP client
 * @param {Array} messages - messages to process in this batch
 * @param {{ stats: object, records: Array, processedCount: number, stopped: boolean }} runState
 * @param {{ context: object, perMessageTimeoutMs: number, processMessage: function, maxMessages: number|null, startedAt: number, budgetMs: number|null, total: number }} deps
 * @param {function(object): void} onProgress
 * @returns {Promise<void>}
 */
async function processReceiptMessageGroup(client, messages, runState, deps, onProgress) {
  const { context, perMessageTimeoutMs, processMessage, maxMessages, startedAt, budgetMs, total } = deps;
  for (const msg of messages) {
    if (runState.stopped) break;
    runState.processedCount++;
    onProgress(messageStart(runState.processedCount, total, msg.fromName || msg.fromAddress, msg.subject || ""));
    const result = await processOneReceiptMessage(
      { client, msg, context, perMessageTimeoutMs, processMessage },
      onProgress,
    );
    if (result.outcome === "timedOut") {
      runState.stats.timedOut++;
    } else if (result.outcome === "error") {
      runState.stats.errors++;
    } else {
      const action = /** @type {string} */ (result.action);
      runState.stats = tallyReceiptAction(runState.stats, action);
      if (action === "downloaded" || action === "noPdf") {
        runState.records.push(/** @type {object} */ (result.metadata));
      }
    }
    const stop = shouldStopProcessing(
      { processedCount: runState.processedCount, maxMessages, startedAt, budgetMs },
      performance.now(),
    );
    if (stop.stop) {
      onProgress(stop.event);
      runState.stopped = true;
      break;
    }
  }
}

/**
 * Normalizes raw CLI opts into a resolved config object.
 * Does not touch `startedAt` (wall-clock) or `targetAccounts` (needs loadAccounts gateway).
 * @param {object} opts
 * @returns {{ dryRun: boolean, includeEmpty: boolean, months: number, outputDir: string, accountFilter: string|null, maxMessages: number|null, perMessageTimeoutMs: number, budgetMs: number|null, since: Date }}
 */
export function resolveDownloadReceiptsOptions(opts) {
  const dryRun = opts.dryRun ?? false;
  const includeEmpty = opts.includeEmpty ?? false;
  const months = opts.months ?? 12;
  const outputDir = resolve(opts.outputDir || ".");
  const accountFilter = opts.account || null;
  const maxMessages = opts.max ?? null;
  const perMessageTimeoutMs = opts.timeoutMs ?? DEFAULT_PER_MESSAGE_TIMEOUT_MS;
  const budgetMs = opts.budgetMs ?? null;
  const since = opts.since ? new Date(opts.since) : monthsAgo(months);
  return { dryRun, includeEmpty, months, outputDir, accountFilter, maxMessages, perMessageTimeoutMs, budgetMs, since };
}

/**
 * Returns a fresh run-state object with all counters zeroed.
 * @returns {{ stats: object, records: Array, processedCount: number, stopped: boolean }}
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
    },
    records: /** @type {Array} */ ([]),
    processedCount: 0,
    stopped: false,
  };
}

/**
 * Per-account handler for forEachReceiptSearchAccount.
 * Filters, groups by mailbox, and processes each message batch.
 *
 * @param {object} client - IMAP client
 * @param {object} account - account descriptor
 * @param {Array} searchResults - raw search results from the pipeline
 * @param {Array} accountSearchFailures - search errors from the pipeline
 * @param {{ runState: object, opts: object, resolvedOpts: object, llm: object, gateways: object, onProgress: function(object): void }} ctx
 * @returns {Promise<void>}
 */
async function processAccountReceipts(client, account, searchResults, accountSearchFailures, ctx) {
  const { runState, opts, resolvedOpts, llm, gateways, onProgress } = ctx;
  const { outputDir, dryRun, includeEmpty, perMessageTimeoutMs, maxMessages, budgetMs } = resolvedOpts;
  const { fs, subprocess, processMessage: _processMessage } = gateways;

  runState.stats.searchFailures += accountSearchFailures.length;
  const {
    filtered: unique,
    vendorExcluded,
    subjectExcluded,
  } = applyReceiptFilters(searchResults, opts, matchesVendor, RECEIPT_SUBJECT_EXCLUSIONS);
  receiptFilterEvents({
    uniqueCount: unique.length,
    vendorExcluded,
    subjectExcluded,
    vendor: opts.vendor || null,
  }).forEach(onProgress);
  runState.stats.found += unique.length;

  const byMailbox = groupByMailbox(unique);
  const context = {
    accountName: account.name,
    outputDir,
    dryRun,
    includeEmpty,
    llm,
    existingInvoiceNumbers: gateways.existingInvoiceNumbers,
    existingHashes: gateways.existingHashes,
    usedPaths: gateways.usedPaths,
    fs,
    subprocess,
    onProgress,
  };
  const deps = {
    context,
    perMessageTimeoutMs,
    processMessage: _processMessage,
    maxMessages,
    startedAt: gateways.startedAt,
    budgetMs,
    total: unique.length,
  };
  await forEachMailboxGroup(client, byMailbox, (_mailbox, messages) =>
    processReceiptMessageGroup(client, messages, runState, deps, onProgress),
  );
}

/**
 * @param {object} [opts]
 * @param {string}  [opts.outputDir="."] - root output directory
 * @param {number}  [opts.months=12] - how far back to search
 * @param {string}  [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {string}  [opts.vendor] - filter to a specific vendor (substring match)
 * @param {boolean} [opts.dryRun=false] - show what would be done
 * @param {boolean} [opts.includeEmpty=false] - also write sidecars when LLM extraction is empty (no amount, no invoice number, no PDF)
 * @param {number|null} [opts.max] - stop after processing this many messages (null = unlimited)
 * @param {number}  [opts.timeoutMs] - per-message timeout in milliseconds (default: 120000)
 * @param {number|null} [opts.budgetMs] - overall wall-clock budget in milliseconds (null = unlimited)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ stats: object, records: Array }>}
 */
export async function downloadReceiptEmails(opts = {}, gateways = {}, onProgress = () => {}) {
  const merged = { ...defaultGateways, ...gateways };
  const {
    fs,
    subprocess,
    loadAccounts,
    forEachAccount,
    listMailboxes,
    createLlmBroker: _createLlmBroker,
    processMessage: _processMessage,
    openAiKey,
  } = merged;

  const resolvedOpts = resolveDownloadReceiptsOptions(opts);
  const { outputDir, since, accountFilter } = resolvedOpts;
  const startedAt = performance.now();
  const targetAccounts = resolveAccounts(accountFilter, loadAccounts);

  const existingInvoiceNumbers = loadExistingInvoiceNumbers(outputDir, fs, (err, ctx) =>
    onProgress(outputTreeError(err, ctx.path, ctx.level)),
  );
  const existingHashes = loadExistingHashes(outputDir, fs, (err, ctx) =>
    onProgress(outputTreeError(err, ctx.path, ctx.level)),
  );
  const usedPaths = new Set();

  const runState = createReceiptRunState();

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
    (client, account, searchResults, accountSearchFailures) =>
      processAccountReceipts(client, account, searchResults, accountSearchFailures, {
        runState,
        opts,
        resolvedOpts,
        llm,
        gateways: {
          fs,
          subprocess,
          processMessage: _processMessage,
          existingInvoiceNumbers,
          existingHashes,
          usedPaths,
          startedAt,
        },
        onProgress,
      }),
  );

  onProgress(downloadSummary(runState.stats));

  return { stats: runState.stats, records: runState.records };
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
 * I/O shell: resolves extraction text for a sidecar by dispatching on the source-selection plan.
 * Returns `{ kind: 'text', text }` on success or `{ kind: 'terminal', statKey, entry }` on early exit.
 *
 * @param {{ pdfPath: string, jsonFilename: string, sidecar: object, hasPdf: boolean, dryRun: boolean, fs: object, subprocess: object }} params
 * @param {function(object): void} onProgress
 * @returns {{ kind: 'text', text: string } | { kind: 'terminal', statKey: string, entry: object }}
 */
function resolveReprocessSource({ pdfPath, jsonFilename, sidecar, hasPdf, dryRun, fs, subprocess }, onProgress) {
  const choice = chooseReprocessSource({ hasPdf, hasBodySnippet: Boolean(sidecar.source_body_snippet), dryRun });
  switch (choice.kind) {
    case "dryRunPdf":
      onProgress(reprocessDryRun(jsonFilename));
      return { kind: "terminal", statKey: "reprocessed", entry: { file: jsonFilename, status: "dry-run" } };
    case "pdf": {
      const text = pdfToText(pdfPath, fs, subprocess);
      if (text) return { kind: "text", text };
      onProgress(reprocessDoclingFailed(new Error("docling conversion failed"), jsonFilename));
      return {
        kind: "terminal",
        statKey: "errors",
        entry: { file: jsonFilename, status: "error", reason: "docling conversion failed" },
      };
    }
    case "dryRunBody":
      onProgress(reprocessDryRunBody(jsonFilename));
      return { kind: "terminal", statKey: "reprocessed", entry: { file: jsonFilename, status: "dry-run" } };
    case "body":
      onProgress(reprocessUsingBody(jsonFilename));
      return { kind: "text", text: sidecar.source_body_snippet };
    default:
      onProgress(reprocessSkipped(jsonFilename, "no PDF and no body snippet"));
      return {
        kind: "terminal",
        statKey: "skipped",
        entry: { file: jsonFilename, status: "skipped", reason: "no PDF and no body snippet" },
      };
  }
}

/**
 * I/O shell: persists or removes a reprocessed sidecar based on classifyReprocessResult.
 * The caller must inject reprocessedAt so this function has no wall-clock dependency.
 *
 * @param {{ metadata: object, sidecar: object, jsonPath: string, jsonFilename: string, reprocessedAt: string, fs: object }} params
 * @param {function(object): void} onProgress
 * @returns {{ statKey: string, entry: object }}
 */
function persistReprocessedSidecar({ metadata, sidecar, jsonPath, jsonFilename, reprocessedAt, fs }, onProgress) {
  const decision = classifyReprocessResult(metadata);
  if (decision.action === "noData") {
    onProgress(reprocessNoData(jsonFilename));
    return { statKey: "errors", entry: { file: jsonFilename, status: "error", reason: "LLM extraction failed" } };
  }
  if (decision.action === "reclassified") {
    onProgress(reprocessReclassified(jsonFilename));
    fs.rm(jsonPath, { force: true });
    return { statKey: "reclassified", entry: { file: jsonFilename, status: "reclassified", reason: "non-invoice" } };
  }
  const updated = buildReprocessedSidecar(metadata, sidecar, reprocessedAt);
  try {
    fs.writeFile(jsonPath, JSON.stringify(updated, null, 2));
  } catch (err) {
    onProgress(reprocessError(err, jsonFilename));
    return { statKey: "errors", entry: { file: jsonFilename, status: "error", reason: err.message, phase: "write" } };
  }
  onProgress(reprocessUpdated(jsonFilename));
  return { statKey: "reprocessed", entry: { file: jsonFilename, status: "reprocessed" } };
}

/**
 * Process a single sidecar file during reprocessing.
 * Returns a stat key and result entry so the orchestrator can fold without branching.
 *
 * @param {{ jsonPath: string, sidecar: object, llm: object, fs: object, subprocess: object, dryRun: boolean }} params
 * @param {function(object): void} onProgress
 * @returns {Promise<{ statKey: string, entry: object }>}
 */
async function reprocessOneSidecar({ jsonPath, sidecar, llm, fs, subprocess, dryRun }, onProgress) {
  const baseName = jsonPath.replace(/\.json$/, "");
  const pdfPath = `${baseName}.pdf`;
  const jsonFilename = /** @type {string} */ (jsonPath.split("/").pop());

  const sourceResult = resolveReprocessSource(
    { pdfPath, jsonFilename, sidecar, hasPdf: fs.exists(pdfPath), dryRun, fs, subprocess },
    onProgress,
  );
  if (sourceResult.kind === "terminal") return { statKey: sourceResult.statKey, entry: sourceResult.entry };

  let metadata;
  try {
    metadata = await extractMetadataWithLLM(
      llm.broker,
      sourceResult.text,
      sidecar.subject || "",
      sidecar.source_email || "",
      sidecar.vendor || "",
      sidecar.date ? new Date(sidecar.date) : new Date(),
    );
  } catch (err) {
    onProgress(reprocessError(err, jsonFilename));
    return { statKey: "errors", entry: { file: jsonFilename, status: "error", reason: err.message, phase: "llm" } };
  }

  return persistReprocessedSidecar(
    { metadata, sidecar, jsonPath, jsonFilename, reprocessedAt: new Date().toISOString(), fs },
    onProgress,
  );
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
    if (!sidecarPassesFilters(sidecar, { vendorFilter, sinceDate })) continue;
    const { statKey, entry } = await reprocessOneSidecar(
      { jsonPath, sidecar, llm, fs, subprocess, dryRun },
      onProgress,
    );
    stats[statKey]++;
    results.push(entry);
  }

  onProgress(reprocessSummary(stats.reprocessed, stats.skipped, stats.reclassified, stats.errors));

  return { ...stats, results };
}
