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
