/**
 * Scan command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js scan handler so it can
 * be tested independently. All I/O is injected via deps.
 */
import { scanAllAccounts, aggregateBySender } from "./scanner.js";
import { ensureDataDir, saveScanResults } from "./scan-data.js";

/**
 * @typedef {object} ScanCommandDeps
 * @property {string|null} account - account filter (or null for all)
 * @property {string} dataDir - path to the data directory
 * @property {object} fsGateway - FileSystemGateway instance
 */

/**
 * Orchestrate scanning for receipt-like emails across accounts.
 *
 * @param {object} opts - CLI options (months, allMailboxes, output)
 * @param {ScanCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ total: number, senders: Array, rawPath: string, summaryPath: string }>}
 */
export async function scanCommand(opts, deps, onProgress = () => {}) {
  const { account, dataDir, fsGateway } = deps;

  const results = await scanAllAccounts({
    months: parseInt(opts.months ?? "12", 10),
    allMailboxes: opts.allMailboxes ?? false,
    account: account || null,
  }, {}, onProgress);

  const senders = aggregateBySender(results);

  ensureDataDir(dataDir, fsGateway);
  const { rawPath, summaryPath } = saveScanResults(dataDir, {
    scanResults: results,
    senders,
    rawPath: opts.output || undefined,
  }, fsGateway);

  return { total: results.length, senders, rawPath, summaryPath };
}
