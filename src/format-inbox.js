import { formatOutput } from "./cli-helpers.js";
import { formatMessageDate } from "./format-date.js";

/**
 * @param {Map<string, Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>>} resultsByAccount
 * @returns {string}
 */
export function formatInboxText(resultsByAccount) {
  const lines = [];

  for (const [accountName, messages] of resultsByAccount) {
    const unreadCount = messages.filter((m) => m.unread).length;
    const unreadLabel = unreadCount > 0 ? ` (${unreadCount} unread)` : "";
    lines.push(`=== ${accountName}${unreadLabel} ===`);

    if (messages.length === 0) {
      lines.push("  (no messages)");
    }

    for (const msg of messages) {
      const marker = msg.unread ? "●" : "○";
      const dateStr = formatMessageDate(msg.date);
      const sender = msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from;
      lines.push(`  ${marker} UID:${msg.uid}  ${dateStr}  ${sender}`);
      lines.push(`    ${msg.subject}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * @param {Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>} allResults
 * @returns {object[]}
 */
export function buildInboxJson(allResults) {
  return allResults.map((msg) => ({
    account: msg.account,
    uid: msg.uid,
    date: msg.date instanceof Date ? msg.date.toISOString() : msg.date,
    from: msg.from,
    fromName: msg.fromName,
    subject: msg.subject,
    unread: msg.unread,
    mailbox: msg.mailbox,
  }));
}

/**
 * @param {boolean} json
 * @param {Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>} allResults
 * @param {Map<string, Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>>} resultsByAccount
 * @returns {string}
 */
export function formatInboxOutput(json, allResults, resultsByAccount) {
  return formatOutput(json, buildInboxJson(allResults), formatInboxText(resultsByAccount));
}
