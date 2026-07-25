import { createFormatOutput } from "../cli-helpers.js";

/**
 * @typedef {{ vendor: string, count: number }} VendorEntry
 */

/**
 * @typedef {{ mode: "listVendors", configVendors: string[], recentVendors: VendorEntry[] }
 *   | { mode: "reprocess", reprocessed: number, skipped: number, errors: number }
 *   | { mode: "download", stats: { found: number, downloaded: number, noPdf: number, skipped?: number, skippedEmpty?: number, alreadyHave: number, errors: number, timedOut?: number, searchFailures?: number }, records?: object[] }
 * } DownloadReceiptsResult
 */

/**
 * @param {DownloadReceiptsResult} result - result object from downloadReceiptsCommand
 * @param {{ since?: string, months?: string }} opts - CLI options (since, months)
 * @returns {string}
 */
export function formatDownloadReceiptsText(result, opts) {
  if (result.mode === "listVendors") {
    const lines = [];
    if (result.configVendors.length > 0) {
      lines.push("Known vendors (from config):");
      lines.push(`  ${result.configVendors.join(", ")}`);
      lines.push("");
    }
    if (result.recentVendors.length > 0) {
      const monthLabel = opts.since ? `since ${opts.since}` : `last ${opts.months} months`;
      lines.push(`Recent vendors (${monthLabel}):`);
      for (const v of result.recentVendors) {
        lines.push(`  ${v.vendor} (${v.count} receipt${v.count === 1 ? "" : "s"})`);
      }
    } else {
      lines.push("No receipt vendors found in the search period.");
    }
    return lines.join("\n");
  }

  if (result.mode === "reprocess") {
    return [
      "\n=== Reprocess Complete ===",
      `Reprocessed:   ${result.reprocessed}`,
      `Skipped:       ${result.skipped}`,
      `Errors:        ${result.errors}`,
    ].join("\n");
  }

  const lines = [
    "\n=== Download Receipts Complete ===",
    `Found:         ${result.stats.found}`,
    `Downloaded:    ${result.stats.downloaded}`,
    `No PDF:        ${result.stats.noPdf}`,
    `Skipped:       ${result.stats.skipped ?? 0}`,
    `Empty:         ${result.stats.skippedEmpty ?? 0}`,
    `Already have:  ${result.stats.alreadyHave}`,
    `Errors:        ${result.stats.errors}`,
    `Timed out:     ${result.stats.timedOut ?? 0}`,
  ];
  if ((result.stats.searchFailures ?? 0) > 0) {
    lines.push(
      `⚠ ${result.stats.searchFailures} mailbox search${result.stats.searchFailures === 1 ? "" : "es"} failed — results may be incomplete`,
    );
  }
  return lines.join("\n");
}

/**
 * Handles the three operating modes: listVendors, reprocess, and download.
 *
 * @param {DownloadReceiptsResult} result
 * @param {{ since?: string, months?: string }} [_opts]
 * @returns {object}
 */
export function buildDownloadReceiptsJson(result, _opts) {
  if (result.mode === "listVendors") {
    return { configVendors: result.configVendors, recentVendors: result.recentVendors };
  }
  if (result.mode === "reprocess") {
    const { mode, ...rest } = result;
    return rest;
  }
  return { stats: result.stats, records: result.records };
}

/** @type {(json: boolean, result: DownloadReceiptsResult, opts: { since?: string, months?: string }) => string} */
export const formatDownloadReceiptsOutput = createFormatOutput(buildDownloadReceiptsJson, formatDownloadReceiptsText);
