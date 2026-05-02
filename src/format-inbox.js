import { formatShortDate, isValidDate } from "./format-date.js";

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
      const marker = msg.unread ? "\u25CF" : "\u25CB";
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
 * @param {Date} date
 * @returns {string}
 */
function formatMessageDate(date) {
  if (!isValidDate(date)) return "";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return formatShortDate(date);
}
