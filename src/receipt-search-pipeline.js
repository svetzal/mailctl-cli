/**
 * Shared receipt search pipeline — per-account mailbox search and dedup.
 * Includes single-mailbox search and per-account orchestration.
 * Used by both download and list-vendors flows.
 */

import { deduplicateByMessageId } from "./dedup.js";
import { filterSearchMailboxes } from "./imap-client.js";
import { BILLING_SENDER_PATTERNS, RECEIPT_SUBJECT_TERMS } from "./receipt-terms.js";

/**
 * Search a single mailbox for receipt/invoice emails.
 * Returns envelope-level results.
 * @param {any} client - connected IMAP client (accepts duck-typed mocks in tests)
 * @param {string} accountName
 * @param {string} mailboxPath
 * @param {Date} since
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array>}
 */
export async function searchMailboxForReceipts(client, accountName, mailboxPath, since, onProgress = () => {}) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return [];
  }

  try {
    const messageCount = client.mailbox?.exists;
    onProgress({ type: "mailbox-search-start", mailbox: mailboxPath, messageCount });
    const allUids = new Set();

    // Subject-based search
    for (const term of RECEIPT_SUBJECT_TERMS) {
      const criteria = { subject: term };
      if (since) criteria.since = since;
      try {
        const uids = await client.search(criteria, { uid: true });
        if (uids) for (const uid of uids) allUids.add(uid);
      } catch (err) {
        onProgress({ type: "search-term-error", mailbox: mailboxPath, term, error: err });
      }
    }

    // Sender-based search
    for (const pattern of BILLING_SENDER_PATTERNS) {
      const criteria = { from: pattern };
      if (since) criteria.since = since;
      try {
        const uids = await client.search(criteria, { uid: true });
        if (uids) for (const uid of uids) allUids.add(uid);
      } catch (err) {
        onProgress({ type: "search-term-error", mailbox: mailboxPath, pattern, error: err });
      }
    }

    if (allUids.size === 0) return [];

    onProgress({ type: "mailbox-candidates", mailbox: mailboxPath, count: allUids.size });

    const results = [];
    const uidRange = [...allUids].join(",");
    try {
      for await (const msg of client.fetch(
        uidRange,
        {
          envelope: true,
          headers: ["message-id"],
          uid: true,
        },
        { uid: true },
      )) {
        const env = msg.envelope;
        const from = env.from?.[0];
        results.push({
          account: accountName,
          mailbox: mailboxPath,
          uid: msg.uid,
          messageId: env.messageId || "",
          date: env.date,
          fromAddress: from?.address?.toLowerCase() || "unknown",
          fromName: from?.name || "",
          subject: env.subject || "",
        });
      }
    } catch (err) {
      onProgress({ type: "mailbox-fetch-error", error: err });
    }

    return results;
  } finally {
    lock.release();
  }
}

/**
 * Search all mailboxes on a single connected account for receipt emails,
 * returning deduplicated results.
 *
 * This is the shared inner loop used by both downloadReceiptEmails and
 * listReceiptVendors. The caller holds the IMAP connection and can perform
 * further operations (e.g. downloading) after the search.
 *
 * @param {object} client - connected IMAP client
 * @param {object} account - account config object (must have .name)
 * @param {Date} since - search cutoff date
 * @param {object} fns
 * @param {Function} fns.listMailboxes - (client) => Promise<Array>
 * @param {Function} fns.searchMailboxForReceipts - (client, accountName, mbPath, since) => Promise<Array>
 * @returns {Promise<Array>} deduplicated receipt results for this account
 */
export async function searchAccountForReceipts(client, account, since, fns) {
  const { listMailboxes, searchMailboxForReceipts } = fns;
  const list = await listMailboxes(client);
  const mailboxes = filterSearchMailboxes(list);
  const results = [];
  for (const mbPath of mailboxes) {
    const found = await searchMailboxForReceipts(client, account.name, mbPath, since);
    results.push(...found);
  }
  return deduplicateByMessageId(results);
}
