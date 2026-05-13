import { createFormatOutput } from "./cli-helpers.js";

/**
 * @typedef {object} SenderSummary
 * @property {string} address - sender email address
 * @property {string} [name] - display name (optional)
 * @property {number} count - number of emails from this sender
 * @property {string[]} accounts - account names where emails were found
 * @property {string[]} sampleSubjects - example subject lines
 */

/**
 * @param {number} totalCount - total number of receipt emails found
 * @param {SenderSummary[]} senders - aggregated sender list from aggregateBySender()
 * @returns {string}
 */
export function formatScanText(totalCount, senders) {
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
 * @param {number} total - total receipt emails found
 * @param {SenderSummary[]} senders - aggregated sender list
 * @returns {{ total: number, senders: SenderSummary[] }}
 */
export function buildScanJson(total, senders) {
  return { total, senders };
}

/**
 * @param {UnclassifiedSender[]} unclassifiedList
 * @returns {{ unclassified: UnclassifiedSender[] }}
 */
export function buildClassifyJson(unclassifiedList) {
  return { unclassified: unclassifiedList };
}

export const formatScanOutput = createFormatOutput(buildScanJson, formatScanText);

export const formatClassifyOutput = createFormatOutput(buildClassifyJson, formatUnclassifiedText);
