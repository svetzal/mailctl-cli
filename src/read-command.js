/**
 * Read command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js read handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */
import { withMessage } from "./find-message.js";

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
  const { simpleParser } = deps;

  const {
    result: parsed,
    account,
    mailbox,
  } = await withMessage(uid, opts, deps, async (client) => {
    try {
      const raw = await client.download(uid, undefined, { uid: true });
      const chunks = [];
      for await (const chunk of raw.content) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      return simpleParser(buf);
    } catch (err) {
      throw new Error(`Could not fetch UID ${uid}: ${err.message}`);
    }
  });

  return { account, uid, mailbox, parsed };
}
