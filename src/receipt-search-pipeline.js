/**
 * Shared receipt search pipeline — per-account mailbox search and dedup.
 * Used by both download and list-vendors flows.
 */
import { filterSearchMailboxes } from "./imap-client.js";
import { deduplicateByMessageId } from "./dedup.js";

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
