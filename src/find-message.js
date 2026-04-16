/**
 * Shared helper for finding a message by UID across IMAP accounts.
 *
 * The "iterate accounts → detect mailbox → acquire lock → fetch/process →
 * release lock" pattern appears in the read, reply, extract-attachment, thread,
 * and flag commands. This module extracts the common cross-account UID lookup
 * so each orchestrator doesn't repeat the same boilerplate.
 */

import { filterSearchMailboxes } from "./imap-client.js";
import { withMailboxLock } from "./imap-orchestration.js";
import { detectMailbox } from "./mailbox-detect.js";

/**
 * @typedef {object} FoundMessage
 * @property {object} client - connected IMAP client (lock already released)
 * @property {object} account - the account that owns the message
 * @property {string} mailbox - the mailbox path where the UID was found
 */

/**
 * Find a message by UID across accounts and call the provided function with
 * the connected client, account, and detected mailbox.
 *
 * The lock lifecycle is managed internally — `fn` receives the client while the
 * mailbox is locked, and the lock is released in a finally block after `fn` returns.
 *
 * @template T
 * @param {string} uid - message UID to locate
 * @param {object} opts - CLI options (may contain opts.mailbox to skip auto-detection)
 * @param {object} deps
 * @param {object[]} deps.targetAccounts
 * @param {Function} deps.forEachAccount
 * @param {Function} deps.listMailboxes
 * @param {(client: any, account: object, mailbox: string) => Promise<T>} fn
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ result: T, account: object, mailbox: string }>}
 * @throws {Error} when the UID is not found in any account
 */
export async function withMessage(uid, opts, deps, fn, onProgress = () => {}) {
  const { targetAccounts, forEachAccount, listMailboxes } = deps;

  /** @type {{ result: T, account: object, mailbox: string } | null} */
  let outcome = null;

  await forEachAccount(targetAccounts, async (client, acct) => {
    if (outcome) return;

    let mailbox = opts.mailbox;
    if (!mailbox) {
      const allBoxes = await listMailboxes(client);
      const paths = filterSearchMailboxes(allBoxes);
      mailbox = await detectMailbox(client, uid, paths);
      if (!mailbox) return;
    }

    await withMailboxLock(
      client,
      mailbox,
      async () => {
        const result = await fn(client, acct, mailbox);
        outcome = { result, account: acct, mailbox };
      },
      { onProgress },
    );
  });

  if (!outcome) {
    throw new Error(`Could not find UID ${uid} in any account.`);
  }

  return outcome;
}
