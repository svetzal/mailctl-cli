/**
 * Pure formatting functions for the download command final results.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * Format download command final results as human-readable text.
 *
 * @param {{ downloaded: number, alreadyHave: number, noPdf: number, skipped: number }} stats
 * @returns {string}
 */
export function formatDownloadResultText(stats) {
  return [
    "\n=== Download Complete ===",
    `Downloaded:    ${stats.downloaded}`,
    `Already had:   ${stats.alreadyHave}`,
    `No PDF:        ${stats.noPdf}`,
    `Skipped/Error: ${stats.skipped}`,
  ].join("\n");
}

/**
 * Build a JSON-ready object for a download result.
 *
 * @param {{ downloaded: number, alreadyHave: number, noPdf: number, skipped: number }} stats
 * @returns {{ downloaded: number, alreadyHave: number, noPdf: number, skipped: number }}
 */
export function buildDownloadJson(stats) {
  return stats;
}
