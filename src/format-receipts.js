// Combined formatter module for all receipts commands (receipts-cli.js consumers).
// Previously split across format-scan, format-sort, format-download, and
// format-import-classifications.

import { createFormatOutput, formatOutput } from "./cli-helpers.js";

// ── format-scan ───────────────────────────────────────────────────────────────

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

/** @type {(json: boolean, totalCount: number, senders: SenderSummary[]) => string} */
export const formatScanOutput = createFormatOutput(buildScanJson, formatScanText);

/** @type {(json: boolean, unclassifiedSenders: UnclassifiedSender[]) => string} */
export const formatClassifyOutput = createFormatOutput(buildClassifyJson, formatUnclassifiedText);

// ── format-sort ───────────────────────────────────────────────────────────────

/**
 * @param {{ moved: number, skipped: number, unclassified: number }} stats
 * @returns {string}
 */
export function formatSortText(stats) {
  return [
    "\n=== Sort Complete ===",
    `Moved:        ${stats.moved}`,
    `Skipped:      ${stats.skipped}`,
    `Unclassified: ${stats.unclassified} (defaulted to personal)`,
  ].join("\n");
}

/** @type {(json: boolean, stats: { moved: number, skipped: number, alreadySorted: number, unclassified: number }) => string} */
export const formatSortOutput = createFormatOutput(
  (stats) => ({
    moved: stats.moved,
    skipped: stats.skipped,
    alreadySorted: stats.alreadySorted,
    unclassified: stats.unclassified,
  }),
  formatSortText,
);

// ── format-download ───────────────────────────────────────────────────────────

/**
 * @param {{ downloaded: number, alreadyHave: number, noPdf: number, skipped: number }} stats
 * @returns {string}
 */
export function formatDownloadText(stats) {
  return [
    "\n=== Download Complete ===",
    `Downloaded:    ${stats.downloaded}`,
    `Already had:   ${stats.alreadyHave}`,
    `No PDF:        ${stats.noPdf}`,
    `Skipped/Error: ${stats.skipped}`,
  ].join("\n");
}

/** @type {(json: boolean, stats: { downloaded: number, alreadyHave: number, noPdf: number, skipped: number }) => string} */
export const formatDownloadOutput = createFormatOutput(
  (stats) => ({
    downloaded: stats.downloaded,
    alreadyHave: stats.alreadyHave,
    noPdf: stats.noPdf,
    skipped: stats.skipped,
  }),
  formatDownloadText,
);

// ── format-import-classifications ─────────────────────────────────────────────

/**
 * @param {boolean} json
 * @param {number} imported
 * @param {string} path
 * @returns {string}
 */
export function formatImportClassificationsOutput(json, imported, path) {
  return formatOutput(json, { imported, path }, `Imported ${imported} classifications to ${path}`);
}
