/**
 * Read command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js read handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */
import { filterSearchMailboxes } from "./imap-client.js";
import { detectMailbox } from "./mailbox-detect.js";

/**
 * @typedef {object} ReadCommandDeps
 * @property {object[]} targetAccounts - accounts to search
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 * @property {Function} simpleParser - mailparser simpleParser function
 */

/**
 * Orchestrate fetching and parsing an email by UID.
 *
 * Searches across accounts to find the UID, downloads the raw message,
 * and parses it. Returns the parsed email with account/mailbox context.
 *
 * @param {string} uid - message UID to read
 * @param {object} opts - CLI options (mailbox, maxBody, raw, headers)
 * @param {ReadCommandDeps} deps - injected dependencies
 * @returns {Promise<{ account: object, uid: string, mailbox: string, parsed: object }>}
 * @throws {Error} when the UID is not found in any account
 */
export async function readCommand(uid, opts, deps) {
  const { targetAccounts, forEachAccount, listMailboxes, simpleParser } = deps;

  /** @type {{ account: object, uid: string, mailbox: string, parsed: object } | null} */
  let found = null;

  await forEachAccount(targetAccounts, async (client, acct) => {
    if (found) return;

    let mailbox = opts.mailbox;
    if (!mailbox) {
      const allBoxes = await listMailboxes(client);
      const paths = filterSearchMailboxes(allBoxes);
      mailbox = await detectMailbox(client, uid, paths);
      if (!mailbox) return;
    }

    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch {
      return;
    }

    try {
      const raw = await client.download(uid, undefined, { uid: true });
      const chunks = [];
      for await (const chunk of raw.content) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const parsed = await simpleParser(buf);
      found = { account: acct, uid, mailbox, parsed };
    } catch (err) {
      throw new Error(`Could not fetch UID ${uid}: ${err.message}`);
    } finally {
      lock.release();
    }
  });

  if (!found) {
    throw new Error(`UID ${uid} not found in any mailbox.`);
  }

  return found;
}
