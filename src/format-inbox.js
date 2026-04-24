/**
 * Pure formatting functions for the inbox command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * Format inbox results as human-readable text.
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
 * Build a JSON-ready array for inbox results.
 *
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
 * Format a message date for display.
 * @param {Date} date
 * @returns {string}
 */
function formatMessageDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
