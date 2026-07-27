/**
 * Shared receipt search pipeline — per-account mailbox search and dedup.
 * Includes single-mailbox search and per-account orchestration.
 * Used by both download and list-vendors flows.
 */

import { deduplicateByMessageId } from "../dedup.js";
import { filterSearchMailboxes } from "../imap-client.js";
import { receiptEvents } from "./download-receipts-event-factories.js";
import { buildReceiptSearchCriteria, searchMailboxForReceiptRecords } from "./receipt-mailbox-search.js";

/**
 * Returns envelope-level results only — no message bodies fetched.
 * @param {import("../imap-types.js").ImapClient} client - connected IMAP client
 * @param {string} accountName
 * @param {string} mailboxPath
 * @param {Date} since
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ results: Array, failures: Array<{ mailbox: string, phase: string, term?: string, error: Error }> }>}
 */
export async function searchMailboxForReceipts(client, accountName, mailboxPath, since, onProgress = () => {}) {
  /** @param {{ uid: number, envelope: { messageId?: string, date?: Date, from?: Array<{address?: string, name?: string}>, subject?: string } }} msg */
  function buildRecord(msg) {
    const env = msg.envelope;
    const from = env.from?.[0];
    return {
      account: accountName,
      mailbox: mailboxPath,
      uid: msg.uid,
      messageId: env.messageId || "",
      date: env.date,
      fromAddress: from?.address?.toLowerCase() || "unknown",
      fromName: from?.name || "",
      subject: env.subject || "",
    };
  }

  return searchMailboxForReceiptRecords(client, mailboxPath, {
    criteria: buildReceiptSearchCriteria({ since, includeSenders: true }),
    fetchQuery: { envelope: true, headers: ["message-id"], uid: true },
    buildRecord,
    events: {
      start: receiptEvents.mailboxSearchStart,
      candidates: receiptEvents.mailboxCandidates,
      searchError: (err) => receiptEvents.searchTermError(err, mailboxPath),
      fetchError: receiptEvents.mailboxFetchError,
    },
    onProgress,
  });
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
    onProgress(receiptEvents.searchAccount(account.name, account.user));
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
