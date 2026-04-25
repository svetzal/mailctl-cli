/**
 * Download command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js download handler so it can
 * be tested independently. All I/O is injected via deps.
 */

import { downloadReceipts as _downloadReceipts } from "./downloader.js";
import { parseIntOption } from "./parse-options.js";

/**
 * @typedef {object} DownloadCommandDeps
 * @property {string|null|undefined} account - account filter (or null/undefined for all)
 * @property {Function} [downloadReceipts] - injectable override for testing
 */

/**
 * Orchestrate downloading business receipt PDF attachments.
 *
 * @param {object} opts - CLI options (months, dryRun, output)
 * @param {DownloadCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ downloaded: number, skipped: number, noPdf: number, alreadyHave: number }>}
 */
export async function downloadCommand(opts, deps, onProgress = () => {}) {
  const { account, downloadReceipts = _downloadReceipts } = deps;

  return await downloadReceipts(
    {
      months: parseIntOption(opts.months, 24),
      dryRun: opts.dryRun ?? false,
      outputDir: opts.output,
      account: account || undefined,
    },
    {},
    onProgress,
  );
}
