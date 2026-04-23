/**
 * Sort command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js sort handler so it can
 * be tested independently.
 */

import { sortReceipts } from "./sorter.js";

/**
 * @typedef {object} SortCommandDeps
 * @property {string|null|undefined} account - account filter (or null/undefined for all)
 */

/**
 * Orchestrate sorting receipt emails into Business/Personal IMAP folders.
 *
 * @param {object} opts - CLI options (months, dryRun)
 * @param {SortCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ moved: number, skipped: number, alreadySorted: number, unclassified: number }>}
 */
export async function sortCommand(opts, deps, onProgress = () => {}) {
  const { account } = deps;

  return await sortReceipts(
    {
      months: parseInt(opts.months ?? "24", 10),
      dryRun: opts.dryRun ?? false,
      account: account || undefined,
    },
    {},
    onProgress,
  );
}
