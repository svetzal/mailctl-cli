/**
 * Pure formatting functions for the sort command final results.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * Format sort command final results as human-readable text.
 *
 * @param {{ moved: number, skipped: number, unclassified: number }} stats
 * @returns {string}
 */
export function formatSortResultText(stats) {
  return [
    "\n=== Sort Complete ===",
    `Moved:        ${stats.moved}`,
    `Skipped:      ${stats.skipped}`,
    `Unclassified: ${stats.unclassified} (defaulted to personal)`,
  ].join("\n");
}

/**
 * Build a JSON-ready object for a sort result.
 *
 * @param {{ moved: number, skipped: number, unclassified: number }} stats
 * @returns {{ moved: number, skipped: number, unclassified: number }}
 */
export function buildSortJson(stats) {
  return stats;
}
