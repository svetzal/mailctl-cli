import { createFormatOutput } from "./cli-helpers.js";

/**
 * @typedef {object} MoveStats
 * @property {number} moved - number of messages successfully moved
 * @property {number} failed - number of messages that failed to move
 * @property {number} skipped - number of messages skipped (e.g. dry-run)
 */

/**
 * @param {MoveStats} stats
 * @param {object[]} [_results]
 * @returns {string}
 */
export function formatMoveText(stats, _results) {
  return `\nSummary: ${stats.moved} moved, ${stats.failed} failed, ${stats.skipped} skipped (dry-run)`;
}

/**
 * @param {MoveStats} stats
 * @param {object[]} results
 * @returns {object}
 */
export function buildMoveJson(stats, results) {
  return { ...stats, results };
}

export const formatMoveOutput = createFormatOutput(buildMoveJson, formatMoveText);
