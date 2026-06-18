/**
 * Shared receipt search pipeline — per-account mailbox search and dedup.
 * Includes single-mailbox search and per-account orchestration.
 * Used by both download and list-vendors flows.
 */

import { deduplicateByMessageId } from "../dedup.js";
import { filterSearchMailboxes } from "../imap-client.js";
import { withMailboxLock } from "../imap-orchestration.js";
import {
  mailboxCandidates,
  mailboxFetchError,
  mailboxSearchStart,
  searchAccount,
  searchTermError,
} from "./download-receipts-event-factories.js";
import { BILLING_SENDER_PATTERNS, RECEIPT_SUBJECT_TERMS } from "./receipt-terms.js";

/**
 * Returns envelope-level results only — no message bodies fetched.
 * @param {any} client - connected IMAP client (accepts duck-typed mocks in tests)
 * @param {string} accountName
 * @param {string} mailboxPath
 * @param {Date} since
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ results: Array, failures: Array<{ mailbox: string, phase: string, term?: string, error: Error }> }>}
 */
export async function searchMailboxForReceipts(client, accountName, mailboxPath, since, onProgress = () => {}) {
  const failures = [];
  const inner = await withMailboxLock(
    client,
    mailboxPath,
    async () => {
      const messageCount = client.mailbox?.exists;
      onProgress(mailboxSearchStart(mailboxPath, messageCount));
      const allUids = new Set();

      // Subject-based search
      for (const term of RECEIPT_SUBJECT_TERMS) {
        const criteria = { subject: term };
        if (since) criteria.since = since;
        try {
          const uids = await client.search(criteria, { uid: true });
          if (uids) for (const uid of uids) allUids.add(uid);
        } catch (err) {
          onProgress(searchTermError(err, mailboxPath));
          failures.push({ mailbox: mailboxPath, phase: "search", term, error: err });
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
          onProgress(searchTermError(err, mailboxPath));
          failures.push({ mailbox: mailboxPath, phase: "search", term: pattern, error: err });
        }
      }

      if (allUids.size === 0) return [];

      onProgress(mailboxCandidates(mailboxPath, allUids.size));

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
        onProgress(mailboxFetchError(err));
        failures.push({ mailbox: mailboxPath, phase: "fetch", error: err });
      }

      return results;
    },
    { onProgress },
  );
  return { results: inner ?? [], failures };
}

/**
 * Shared per-account driver used by downloadReceiptEmails and listReceiptVendors.
 * Iterates accounts via forEachAccount, emits a search-account progress event,
 * runs the full receipt search pipeline, then delegates per-account work to perAccountFn.
 *
 * @param {Array} targetAccounts
 * @param {Date} since - search cutoff date
 * @param {object} fns
 * @param {Function} fns.forEachAccount
 * @param {Function} fns.listMailboxes
 * @param {function(object): void} fns.onProgress
 * @param {function(object, object, Array, Array): Promise<void>} perAccountFn - (client, account, uniqueResults, failures) => Promise<void>
 * @returns {Promise<void>}
 */
export async function forEachReceiptSearchAccount(
  targetAccounts,
  since,
  { forEachAccount, listMailboxes, onProgress },
  perAccountFn,
) {
  await forEachAccount(targetAccounts, async (client, account) => {
    onProgress(searchAccount(account.name, account.user));
    const { results: uniqueResults, failures } = await searchAccountForReceipts(client, account, since, {
      listMailboxes,
      searchMailboxForReceipts: (c, accountName, mbPath, s) =>
        searchMailboxForReceipts(c, accountName, mbPath, s, onProgress),
    });
    await perAccountFn(client, account, uniqueResults, failures);
  });
}

/**
 * Search all mailboxes on a single connected account for receipt emails,
 * returning deduplicated results and accumulated search failures.
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
 * @param {Function} fns.searchMailboxForReceipts - (client, accountName, mbPath, since) => Promise<{ results: Array, failures: Array }>
 * @returns {Promise<{ results: Array, failures: Array }>} deduplicated receipt results and per-mailbox failures for this account
 */
export async function searchAccountForReceipts(client, account, since, fns) {
  const { listMailboxes, searchMailboxForReceipts } = fns;
  const list = await listMailboxes(client);
  const mailboxes = filterSearchMailboxes(list);
  const allResults = [];
  const allFailures = [];
  for (const mbPath of mailboxes) {
    const { results, failures } = await searchMailboxForReceipts(client, account.name, mbPath, since);
    allResults.push(...results);
    allFailures.push(...failures);
  }
  return { results: deduplicateByMessageId(allResults), failures: allFailures };
}
