/**
 * Pure formatting functions for the search command.
 * No I/O — same inputs always produce the same outputs.
 */

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
 * Format an array of search results as a human-readable string.
 * Each result appears on one line: [mailbox] UID:N date | fromName <from> | subject
 *
 * @param {SearchResult[]} results
 * @returns {string}
 */
export function formatSearchResultsText(results) {
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
 * Build a JSON-ready array of search results, stripping the internal messageId field.
 *
 * @param {SearchResult[]} results
 * @returns {object[]}
 */
export function buildSearchJson(results) {
  return results.map(({ messageId, ...rest }) => rest);
}
