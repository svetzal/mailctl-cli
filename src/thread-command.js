/**
 * Thread command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js thread handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */
import { uidNotFoundError } from "./find-message.js";
import { filterSearchMailboxes } from "./imap-client.js";
import { detectMailbox } from "./mailbox-detect.js";
import { parseIntOption } from "./parse-options.js";
import { findThread } from "./thread.js";

/**
 * @typedef {object} ThreadCommandDeps
 * @property {object[]} targetAccounts - accounts to search
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 */

/**
 * @typedef {object} ThreadResult
 * @property {string} account - account name
 * @property {number} threadSize - number of messages in the thread
 * @property {boolean} fallback - whether subject-based fallback was used
 * @property {Array} messages - thread messages
 */

/**
 * Orchestrate finding the thread for a message UID.
 *
 * @param {string} uid - message UID to find the thread for
 * @param {object} opts - CLI options (mailbox, limit, full)
 * @param {ThreadCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<ThreadResult[]>} one result per matched account
 * @throws {Error} when the UID is not found in any mailbox on an account
 */
export async function threadCommand(uid, opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount, listMailboxes } = deps;
  const limit = parseIntOption(opts.limit, 50);

  /** @type {ThreadResult[]} */
  const results = [];

  await forEachAccount(targetAccounts, async (client, acct) => {
    let mailbox = opts.mailbox;
    if (!mailbox) {
      const allBoxes = await listMailboxes(client);
      const paths = filterSearchMailboxes(allBoxes);
      mailbox = await detectMailbox(client, uid, paths);
      if (!mailbox) {
        return;
      }
    }

    // Get searchable mailboxes for cross-mailbox thread discovery
    const allBoxes = await listMailboxes(client);
    const searchPaths = filterSearchMailboxes(allBoxes);

    const { messages, fallback } = await findThread(client, acct.name, mailbox, uid, searchPaths, {
      limit,
      full: opts.full ?? false,
      onProgress,
    });

    results.push({
      account: acct.name,
      threadSize: messages.length,
      fallback,
      messages,
    });
  });

  if (results.length === 0) {
    throw uidNotFoundError(uid);
  }

  return results;
}
