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
