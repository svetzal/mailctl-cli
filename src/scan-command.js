/**
 * Scan command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js scan handler so it can
 * be tested independently. All I/O is injected via deps.
 */

import { parseIntOption } from "./parse-options.js";
import { ensureDataDir, saveScanResults } from "./scan-data.js";
import { aggregateBySender, scanAllAccounts } from "./scanner.js";

/**
 * @typedef {object} ScanCommandDeps
 * @property {string|null|undefined} account - account filter (or null/undefined for all)
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

  const results = await scanAllAccounts(
    {
      months: parseIntOption(opts.months, 12),
      allMailboxes: opts.allMailboxes ?? false,
      account: account || undefined,
    },
    {},
    onProgress,
  );

  const senders = aggregateBySender(results);

  ensureDataDir(dataDir, fsGateway);
  const { rawPath, summaryPath } = saveScanResults(
    dataDir,
    {
      scanResults: results,
      senders,
      rawPath: opts.output || undefined,
    },
    fsGateway,
  );

  return { total: results.length, senders, rawPath, summaryPath };
}
