/**
 * Download-receipts command orchestrator.
 *
 * Extracts the routing logic from the cli.js download-receipts handler so it can
 * be tested independently. Dynamic imports are injected for the heavy sub-modules.
 */
import { parseIntOption, parseSinceOption } from "../parse-options.js";
import { EXTRACT_DEFAULT_MONTHS } from "../receipt-defaults.js";

/**
 * @typedef {object} DownloadReceiptsCommandDeps
 * @property {string|null} account - account filter (or null for all)
 * @property {string|null} [openAiKey] - OpenAI API key from keychain
 * @property {() => Promise<{ listReceiptVendors: Function, reprocessReceipts: Function, downloadReceiptEmails: Function }>} importDownloadReceipts
 * @property {() => Promise<{ getVendorDisplayNames: Function, getVendorDomainMap: Function }>} importVendorMap
 */

/**
 * Routes to one of three operation modes: list vendors, reprocess existing, or download new receipts.
 *
 * @param {object} opts - CLI options (listVendors, reprocess, output, months, since, dryRun, vendor)
 * @param {DownloadReceiptsCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<object>} result object (shape varies by mode)
 */
export async function downloadReceiptsCommand(opts, deps, onProgress = () => {}) {
  const { account, openAiKey, importDownloadReceipts, importVendorMap } = deps;
  const llmGateways = openAiKey != null ? { openAiKey } : {};

  if (opts.listVendors) {
    const { listReceiptVendors } = await importDownloadReceipts();
    const { getVendorDisplayNames, getVendorDomainMap } = await importVendorMap();
    const sinceDate = parseSinceOption(opts.since, null);

    const { vendors, stats } = await listReceiptVendors(
      {
        months: parseIntOption(opts.months, EXTRACT_DEFAULT_MONTHS),
        since: sinceDate || undefined,
        account: account || null,
      },
      {},
      onProgress,
    );

    const knownNames = getVendorDisplayNames();
    const knownDomains = getVendorDomainMap();
    const configVendors = [...new Set([...Object.values(knownNames), ...Object.values(knownDomains)])].sort();

    return { mode: "listVendors", configVendors, recentVendors: vendors, stats };
  }

  if (opts.reprocess) {
    const { reprocessReceipts } = await importDownloadReceipts();
    const sinceDate = parseSinceOption(opts.since, null);

    const result = await reprocessReceipts(
      {
        outputDir: opts.output ?? ".",
        vendor: opts.vendor || null,
        since: sinceDate,
        dryRun: opts.dryRun ?? false,
      },
      llmGateways,
      onProgress,
    );

    // `result` keeps its historical flat shape (reprocessed/skipped/errors) for
    // formatDownloadReceiptsText/buildDownloadReceiptsJson; `stats` is added
    // alongside so the exit-code contract (src/exit-status.js) can read
    // result.stats.errors like every other command result.
    return { mode: "reprocess", ...result, stats: { errors: result.errors } };
  }

  const { downloadReceiptEmails } = await importDownloadReceipts();
  const { stats, records } = await downloadReceiptEmails(
    {
      outputDir: opts.output ?? ".",
      months: parseIntOption(opts.months, EXTRACT_DEFAULT_MONTHS),
      since: opts.since || null,
      account: account || null,
      vendor: opts.vendor || null,
      dryRun: opts.dryRun ?? false,
      includeEmpty: opts.includeEmpty ?? false,
      max: opts.max !== undefined ? parseIntOption(opts.max, 0) : null,
      timeoutMs: opts.timeout !== undefined ? parseIntOption(opts.timeout, 120) * 1000 : undefined,
      budgetMs: opts.budget !== undefined ? parseIntOption(opts.budget, 0) * 1000 : null,
    },
    llmGateways,
    onProgress,
  );

  return { mode: "download", stats, records };
}
