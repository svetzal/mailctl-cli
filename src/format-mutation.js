// Combined formatter module for mutating mail commands (mutation-cli.js consumers).
// Previously split across format-move, format-flag, and format-reply.

import { createFormatOutput, formatOutput } from "./cli-helpers.js";

// ── format-move ───────────────────────────────────────────────────────────────

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
  return `\nSummary: ${stats.moved} moved, ${stats.failed} failed, ${stats.skipped} skipped`;
}

/** @type {(json: boolean, stats: MoveStats, results: object[]) => string} */
export const formatMoveOutput = createFormatOutput((stats, results) => ({ ...stats, results }), formatMoveText);

// ── format-flag ───────────────────────────────────────────────────────────────

/**
 * @typedef {import("./commands/flag-command.js").FlagResult} FlagResult
 * @typedef {import("./commands/flag-command.js").FlagStats} FlagStats
 */

/**
 * @param {FlagStats} stats
 * @param {FlagResult[]} results - array of per-account flag results
 * @returns {string}
 */
export function formatFlagText(stats, results) {
  const lines = [];

  for (const flagResult of results) {
    if (flagResult.status === "failed") {
      lines.push(`Error (${flagResult.account}): ${flagResult.error}`);
      continue;
    }
    const uidRange = (flagResult.uids ?? []).join(",");
    const parts = [...(flagResult.added ?? []).map((f) => `+${f}`), ...(flagResult.removed ?? []).map((f) => `-${f}`)];
    const label = (flagResult.uids ?? []).length === 1 ? `UID ${uidRange}` : `UIDs ${uidRange}`;

    if (flagResult.dryRun) {
      lines.push(`[DRY RUN] Would flag ${label}: ${parts.join(" ")}`);
    } else {
      lines.push(`Flagged ${label}: ${parts.join(" ")}`);
    }
  }

  lines.push(`\nSummary: ${stats.flagged} flagged, ${stats.failed} failed, ${stats.skipped} skipped`);
  return lines.join("\n");
}

/**
 * @param {FlagStats} stats
 * @param {FlagResult[]} results
 * @returns {object}
 */
export function buildFlagJson(stats, results) {
  return { ...stats, results };
}

/** @type {(json: boolean, stats: FlagStats, results: FlagResult[]) => string} */
export const formatFlagOutput = createFormatOutput(buildFlagJson, formatFlagText);

// ── format-reply ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} ReplyMessage
 * @property {string} from - sender address
 * @property {string} to - recipient address
 * @property {string} [cc] - CC addresses (optional)
 * @property {string} subject - email subject
 * @property {string} text - email body text
 * @property {string} inReplyTo - In-Reply-To header value
 * @property {string} references - References header value
 */

/**
 * @typedef {object} ReplySentResult
 * @property {boolean} sent - always true for sent results
 * @property {string} messageId - the sent message's Message-ID
 * @property {string[]} accepted - accepted recipient addresses
 * @property {ReplyMessage} message - the composed message
 */

/**
 * @param {ReplyMessage} message - the composed reply message
 * @returns {string}
 */
export function formatReplyDryRunText(message) {
  const lines = [];
  lines.push("--- Dry Run: Composed Reply ---");
  lines.push(`From: ${message.from}`);
  lines.push(`To: ${message.to}`);
  if (message.cc) lines.push(`CC: ${message.cc}`);
  lines.push(`Subject: ${message.subject}`);
  lines.push(`In-Reply-To: ${message.inReplyTo}`);
  lines.push(`References: ${message.references}`);
  lines.push(`\n${message.text}`);
  return lines.join("\n");
}

/**
 * @param {ReplySentResult} result - the sent reply result
 * @returns {string}
 */
export function formatReplySentText(result) {
  return `Reply sent to ${result.message.to} (Message-ID: ${result.messageId})`;
}

/**
 * @param {ReplyMessage} message
 * @returns {{ dryRun: true, message: ReplyMessage }}
 */
export function buildReplyDryRunJson(message) {
  return { dryRun: true, message };
}

/**
 * @param {ReplySentResult} result
 * @returns {{ sent: boolean, messageId: string, accepted: string[] }}
 */
export function buildReplySentJson(result) {
  return { sent: result.sent, messageId: result.messageId, accepted: result.accepted };
}

/**
 * @param {boolean} json
 * @param {{ dryRun?: boolean, message?: ReplyMessage } | ReplySentResult} result
 * @returns {string}
 */
export function formatReplyOutput(json, result) {
  if ("dryRun" in result) {
    const { message } = /** @type {{ dryRun: boolean, message: ReplyMessage }} */ (result);
    return formatOutput(json, buildReplyDryRunJson(message), formatReplyDryRunText(message));
  }
  return formatOutput(
    json,
    buildReplySentJson(/** @type {ReplySentResult} */ (result)),
    formatReplySentText(/** @type {ReplySentResult} */ (result)),
  );
}
