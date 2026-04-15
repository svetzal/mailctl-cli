/**
 * Pure formatting functions for the move command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {object} MoveStats
 * @property {number} moved - number of messages successfully moved
 * @property {number} failed - number of messages that failed to move
 * @property {number} skipped - number of messages skipped (e.g. dry-run)
 */

/**
 * Format the move command result summary as a human-readable string.
 *
 * @param {MoveStats} stats
 * @returns {string}
 */
export function formatMoveResultText(stats) {
  return `\nSummary: ${stats.moved} moved, ${stats.failed} failed, ${stats.skipped} skipped (dry-run)`;
}

/**
 * Build a JSON-ready object for a move result.
 *
 * @param {MoveStats} stats
 * @param {object[]} results
 * @returns {object}
 */
export function buildMoveJson(stats, results) {
  return { ...stats, results };
}
