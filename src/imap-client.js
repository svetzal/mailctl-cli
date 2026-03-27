import { ImapFlow } from "imapflow";
import { getM365AccessToken } from "./m365-auth.js";
import { RECEIPT_SUBJECT_TERMS } from "./receipt-terms.js";
import { buildScanResult } from "./scan-helpers.js";

/**
 * Connect to an IMAP server and return the client.
 * Supports both password-based and OAuth2 (XOAUTH2) authentication.
 *
 * @param {{ host: string, port: number, user: string, pass?: string, oauth2?: { clientId: string, tenantId: string, clientSecret: string }, name?: string }} account
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<ImapFlow>}
 */
export async function connect(account, onProgress = () => {}) {
  let auth;

  if (account.oauth2) {
    const accessToken = await getM365AccessToken(account.oauth2, onProgress);
    auth = { user: account.user, accessToken };
  } else {
    auth = { user: account.user, pass: account.pass };
  }

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth,
    logger: false,
  });

  await client.connect();
  return client;
}

/**
 * Search for receipt-like messages in specified mailboxes.
 * Returns an array of { account, from, subject, date, mailbox, uid }.
 *
 * @param {ImapFlow} client
 * @param {string} accountName
 * @param {string[]} mailboxes - mailbox paths to search (e.g. ["INBOX", "Archive"])
 * @param {object} [opts]
 * @param {Date}   [opts.since] - only messages after this date
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array>}
 */
export async function scanForReceipts(client, accountName, mailboxes, opts = {}, onProgress = () => {}) {
  const results = [];

  // Deduplicate UIDs per mailbox to avoid fetching the same message twice
  for (const mailbox of mailboxes) {
    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch {
      // mailbox doesn't exist on this account, skip
      continue;
    }

    try {
      // @ts-expect-error — imapflow types client.mailbox as false|MailboxObject; ?. handles the false case at runtime
      onProgress({ type: "mailbox-start", mailbox, count: client.mailbox?.exists });
      const allUids = new Set();

      for (const term of RECEIPT_SUBJECT_TERMS) {
        const searchCriteria = {
          subject: term,
        };
        if (opts.since) {
          searchCriteria.since = opts.since;
        }

        let uids;
        try {
          uids = await client.search(searchCriteria, { uid: true });
        } catch (err) {
          onProgress({ type: "search-error", term, error: err });
          continue;
        }

        if (!uids || uids.length === 0) continue;
        for (const uid of uids) allUids.add(uid);
      }

      if (allUids.size === 0) {
        onProgress({ type: "mailbox-empty", mailbox });
        continue;
      }

      onProgress({ type: "mailbox-matches", mailbox, count: allUids.size });

      // Fetch envelopes for all unique UIDs (as comma-separated range string)
      const uidRange = [...allUids].join(",");
      try {
        for await (const msg of client.fetch(uidRange, { envelope: true, uid: true }, { uid: true })) {
          results.push(buildScanResult(accountName, mailbox, msg));
        }
      } catch (err) {
        onProgress({ type: "fetch-error", error: err });
      }
    } finally {
      lock.release();
    }
  }

  return results;
}

/**
 * List all available mailboxes for an account.
 */
export async function listMailboxes(client) {
  const list = await client.list();
  return list.map((mb) => ({
    path: mb.path,
    name: mb.name,
    flags: mb.flags,
    specialUse: mb.specialUse,
  }));
}

export { filterScanMailboxes, filterSearchMailboxes } from "./mailbox-filters.js";

/**
 * Run an async callback for each configured account with a connected IMAP client.
 * Handles connect/logout lifecycle and error reporting.
 * @param {Array} accounts - from loadAccounts()
 * @param {function(import("imapflow").ImapFlow, object): Promise<void>} fn - callback receiving (client, account)
 * @param {function(object): void} [onProgress] - receives structured progress events
 */
export async function forEachAccount(accounts, fn, onProgress = () => {}) {
  for (const account of accounts) {
    let client;
    try {
      client = await connect(account, onProgress);
    } catch (err) {
      onProgress({ type: "connect-error", account: account.name, error: err });
      continue;
    }
    try {
      await fn(client, account);
    } finally {
      await client.logout();
    }
  }
}
