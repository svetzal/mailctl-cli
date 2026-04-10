/**
 * Inbox overview — fetch recent messages from INBOX with read/unread status.
 */

import { sanitizeForAgentOutput } from "./content-sanitizer.js";

/**
 * Fetch recent inbox messages for a connected IMAP client.
 * @param {any} client - connected IMAP client
 * @param {string} accountName
 * @param {object} opts
 * @param {number} opts.limit
 * @param {Date} [opts.since]
 * @param {boolean} [opts.unreadOnly]
 * @param {function(object): void} [opts.onProgress] - receives structured progress events
 * @returns {Promise<Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>>}
 */
export async function fetchInbox(client, accountName, opts) {
  const { limit, since, unreadOnly } = opts;
  const onProgress = opts.onProgress || (() => {});
  const mailbox = "INBOX";

  let lock;
  try {
    lock = await client.getMailboxLock(mailbox);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox, error: err });
    return [];
  }

  try {
    /** @type {Record<string, any>} */
    const criteria = {};
    if (since) criteria.since = since;
    if (unreadOnly) criteria.seen = false;

    // If no criteria, search for all messages
    const hasAnyCriteria = Object.keys(criteria).length > 0;
    let uids;
    try {
      uids = hasAnyCriteria
        ? await client.search(criteria, { uid: true })
        : await client.search({ all: true }, { uid: true });
    } catch (err) {
      // Search failed — return empty results
      onProgress({ type: "search-failed", mailbox, error: err });
      return [];
    }

    if (!uids || uids.length === 0) return [];

    // Take the last N (most recent by UID)
    const recent = uids.slice(-limit);
    const uidRange = recent.join(",");

    const results = [];
    for await (const msg of client.fetch(uidRange, { envelope: true, flags: true, uid: true }, { uid: true })) {
      const env = msg.envelope;
      const from = env.from?.[0];
      const flags = msg.flags ? [...msg.flags] : [];
      const seen = flags.includes("\\Seen");

      results.push({
        account: accountName,
        uid: msg.uid,
        date: env.date,
        from: from?.address || "",
        fromName: sanitizeForAgentOutput(from?.name || ""),
        subject: sanitizeForAgentOutput(env.subject || ""),
        unread: !seen,
        mailbox,
      });
    }

    // Sort by date, newest first
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return results;
  } finally {
    lock.release();
  }
}

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
