import { formatOutput } from "./cli-helpers.js";

/**
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
 * @param {{ moved: number, skipped: number, alreadySorted: number, unclassified: number }} stats
 * @returns {object}
 */
export function buildSortJson(stats) {
  return {
    moved: stats.moved,
    skipped: stats.skipped,
    alreadySorted: stats.alreadySorted,
    unclassified: stats.unclassified,
  };
}

/**
 * @param {boolean} json
 * @param {{ moved: number, skipped: number, alreadySorted: number, unclassified: number }} stats
 * @returns {string}
 */
export function formatSortOutput(json, stats) {
  return formatOutput(json, buildSortJson(stats), formatSortResultText(stats));
}
