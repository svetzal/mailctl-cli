/** @typedef {import('./receipt-types.js').ReceiptMetadata} ReceiptMetadata */
/** @typedef {import('./receipt-types.js').ReceiptSidecar} ReceiptSidecar */
/** @typedef {import('./receipt-types.js').LlmContext} LlmContext */

import { resolve } from "node:path";
import {
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
import { extractMetadataWithLLM } from "./llm-receipt-extraction.js";
import { pdfToText } from "./pdf-converter.js";
import {
  buildReprocessedSidecar,
  chooseReprocessSource,
  classifyReprocessResult,
  sidecarPassesFilters,
} from "./receipt-decisions.js";
import { resolveGateways } from "./receipt-gateways.js";
import { collectSidecarFiles } from "./receipt-output-tree.js";

/**
 * I/O shell: resolves extraction text for a sidecar by dispatching on the source-selection plan.
 * Returns `{ kind: 'text', text }` on success or `{ kind: 'terminal', statKey, entry }` on early exit.
 *
 * @param {{ pdfPath: string, jsonFilename: string, sidecar: ReceiptSidecar, hasPdf: boolean, dryRun: boolean, fs: import('../gateways/fs-gateway.js').FileSystemGateway, subprocess: import('../gateways/subprocess-gateway.js').SubprocessGateway }} params
 * @param {function(object): void} onProgress
 * @returns {{ kind: 'text', text: string } | { kind: 'terminal', statKey: string, entry: Record<string, unknown> }}
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
      return { kind: "text", text: sidecar.source_body_snippet ?? "" };
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
 * @param {{ metadata: ReceiptMetadata|null|undefined, sidecar: ReceiptSidecar, jsonPath: string, jsonFilename: string, reprocessedAt: string, fs: import('../gateways/fs-gateway.js').FileSystemGateway }} params
 * @param {function(object): void} onProgress
 * @returns {{ statKey: string, entry: Record<string, unknown> }}
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
  const updated = buildReprocessedSidecar(/** @type {ReceiptMetadata} */ (metadata), sidecar, reprocessedAt);
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
 * @param {{ jsonPath: string, sidecar: ReceiptSidecar, llm: LlmContext, fs: import('../gateways/fs-gateway.js').FileSystemGateway, subprocess: import('../gateways/subprocess-gateway.js').SubprocessGateway, dryRun: boolean }} params
 * @param {function(object): void} onProgress
 * @returns {Promise<{ statKey: string, entry: Record<string, unknown> }>}
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
  const { fs, subprocess, createLlmBroker, openAiKey } = resolveGateways(gateways);

  const outputDir = resolve(opts.outputDir || ".");
  const dryRun = opts.dryRun ?? false;
  const vendorFilter = opts.vendor || null;
  const sinceDate = opts.since || null;

  const llm = createLlmBroker(openAiKey, onProgress);
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
