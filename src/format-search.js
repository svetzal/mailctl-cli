/**
 * Pure formatting functions for the search command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {object} SearchResult
 * @property {string} mailbox - mailbox path where the result was found
 * @property {string|number} uid - message UID
 * @property {string|Date} [date] - message date
 * @property {string} [fromName] - sender display name
 * @property {string} [from] - sender email address
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

  const lines = results.map((r) =>
    `  [${r.mailbox}] UID:${r.uid} ${r.date ?? ""} | ${r.fromName || ""} <${r.from ?? ""}> | ${r.subject ?? ""}`
  );

  return lines.join("\n");
}
