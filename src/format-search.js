import { createFormatOutput } from "./cli-helpers.js";

/**
 * @typedef {object} SearchResult
 * @property {string} mailbox - mailbox path where the result was found
 * @property {string|number} uid - message UID
 * @property {string} [messageId] - internal message ID (stripped from JSON output)
 * @property {string|Date} [date] - message date
 * @property {string} [fromName] - sender display name
 * @property {string} [from] - sender email address
 * @property {string} [to] - recipient email address
 * @property {string} [toName] - recipient display name
 * @property {string} [subject] - message subject
 */

/**
 * Each result appears on one line: [mailbox] UID:N date | fromName <from> | subject
 *
 * @param {SearchResult[]} results
 * @returns {string}
 */
export function formatSearchText(results) {
  if (results.length === 0) {
    return "";
  }

  const lines = results.map((r) => {
    const fromPart = `${r.fromName || ""} <${r.from ?? ""}>`;
    const toPart = r.to ? ` → ${r.toName || ""} <${r.to}>` : "";
    return `  [${r.mailbox}] UID:${r.uid} ${r.date ?? ""} | ${fromPart}${toPart} | ${r.subject ?? ""}`;
  });

  return lines.join("\n");
}

/**
 * Strips the internal messageId field (used for dedup) before output.
 *
 * @param {SearchResult[]} results
 * @returns {object[]}
 */
export function buildSearchJson(results) {
  return results.map(({ messageId, ...rest }) => rest);
}

export const formatSearchOutput = createFormatOutput(buildSearchJson, formatSearchText);
