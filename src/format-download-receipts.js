/**
 * Pure formatting functions for the download-receipts command final results.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {{ vendor: string, count: number }} VendorEntry
 */

/**
 * @typedef {{ mode: "listVendors", configVendors: string[], recentVendors: VendorEntry[] }
 *   | { mode: "reprocess", reprocessed: number, skipped: number, errors: number }
 *   | { mode: "download", stats: { found: number, downloaded: number, noPdf: number, alreadyHave: number, errors: number } }
 * } DownloadReceiptsResult
 */

/**
 * Format download-receipts command final results as human-readable text.
 *
 * @param {DownloadReceiptsResult} result - result object from downloadReceiptsCommand
 * @param {{ since?: string, months?: string }} opts - CLI options (since, months)
 * @returns {string}
 */
export function formatDownloadReceiptsResultText(result, opts) {
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

  return [
    "\n=== Download Receipts Complete ===",
    `Found:         ${result.stats.found}`,
    `Downloaded:    ${result.stats.downloaded}`,
    `No PDF:        ${result.stats.noPdf}`,
    `Already have:  ${result.stats.alreadyHave}`,
    `Errors:        ${result.stats.errors}`,
  ].join("\n");
}
