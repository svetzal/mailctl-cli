/**
 * Pure formatting functions for scan and classify commands.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {object} SenderSummary
 * @property {string} address - sender email address
 * @property {string} [name] - display name (optional)
 * @property {number} count - number of emails from this sender
 * @property {string[]} accounts - account names where emails were found
 * @property {string[]} sampleSubjects - example subject lines
 */

/**
 * Format a human-readable scan summary from an aggregated sender list.
 *
 * @param {SenderSummary[]} senders - aggregated sender list from aggregateBySender()
 * @param {number} totalCount - total number of receipt emails found
 * @returns {string}
 */
export function formatScanSummaryText(senders, totalCount) {
  const lines = [];
  lines.push("\n=== Receipt Senders Found ===\n");
  lines.push(`Total: ${totalCount} receipt emails from ${senders.length} unique senders\n`);

  for (const s of senders) {
    const accts = s.accounts.join(", ");
    lines.push(`${s.name || s.address} (${s.count} emails)`);
    lines.push(`   Address:  ${s.address}`);
    lines.push(`   Accounts: ${accts}`);
    lines.push(`   Example:  ${s.sampleSubjects[0] || "N/A"}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * @typedef {object} UnclassifiedSender
 * @property {string} address - sender email address
 * @property {string} [name] - display name (optional)
 * @property {number} count - number of emails from this sender
 * @property {string[]} accounts - account names
 * @property {string} example - example subject line
 * @property {null} classification - always null (unclassified)
 */

/**
 * Format a human-readable list of unclassified senders.
 *
 * @param {UnclassifiedSender[]} unclassifiedSenders
 * @returns {string}
 */
export function formatUnclassifiedText(unclassifiedSenders) {
  if (unclassifiedSenders.length === 0) {
    return "All senders are classified!";
  }

  const lines = [];
  lines.push(JSON.stringify(unclassifiedSenders, null, 2));
  lines.push(`\n${unclassifiedSenders.length} senders need classification.`);
  lines.push(`   Edit the output and set "classification" to "business" or "personal".`);
  lines.push(`   Then import with: mailctl import-classifications <file>`);

  return lines.join("\n");
}

/**
 * Build a JSON-ready object for a scan result.
 *
 * @param {number} total - total receipt emails found
 * @param {SenderSummary[]} senders - aggregated sender list
 * @returns {{ total: number, senders: SenderSummary[] }}
 */
export function buildScanJson(total, senders) {
  return { total, senders };
}

/**
 * Build a JSON-ready object for a classify result.
 *
 * @param {UnclassifiedSender[]} unclassifiedList
 * @returns {{ unclassified: UnclassifiedSender[] }}
 */
export function buildClassifyJson(unclassifiedList) {
  return { unclassified: unclassifiedList };
}
