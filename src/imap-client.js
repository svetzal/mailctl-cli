import { ImapFlow } from "imapflow";
import { connectError } from "./auth-event-factories.js";
import { withMailboxLock } from "./imap-orchestration.js";
import { getM365AccessToken } from "./m365-auth.js";
import { RECEIPT_SUBJECT_TERMS } from "./receipts/receipt-terms.js";
import { buildScanResult } from "./scan-helpers.js";
import { fetchError, mailboxEmpty, mailboxMatches, mailboxStart, searchError } from "./shared-event-factories.js";

/**
 * Supports both password-based and OAuth2 (XOAUTH2) authentication.
 *
 * @param {{ host: string, port: number, user: string, pass?: string, oauth2?: { clientId: string, tenantId: string, clientSecret: string }, name?: string }} account
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @param {typeof ImapFlow} [clientConstructor] - injectable for testing; defaults to ImapFlow
 * @param {typeof getM365AccessToken} [getAccessToken] - injectable for testing; defaults to getM365AccessToken
 * @returns {Promise<ImapFlow>}
 */
export async function connect(
  account,
  onProgress = () => {},
  clientConstructor = ImapFlow,
  getAccessToken = getM365AccessToken,
) {
  let auth;

  if (account.oauth2) {
    const accessToken = await getAccessToken(account.oauth2, onProgress);
    auth = { user: account.user, accessToken };
  } else {
    auth = { user: account.user, pass: account.pass };
  }

  // Generous inactivity-based socket timeout — keeps the connection from hanging
  // silently on a stalled network, without aborting legitimately slow searches
  // (imapflow resets the timer on each received chunk, so a large-mailbox search
  // that keeps data flowing will not hit this limit).
  const SOCKET_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  const client = new clientConstructor({
    host: account.host,
    port: account.port,
    secure: true,
    auth,
    logger: false,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  await client.connect();
  return client;
}

/**
 * @param {ImapFlow} client
 * @param {string} accountName
 * @param {string[]} mailboxes - mailbox paths to search (e.g. ["INBOX", "Archive"])
 * @param {object} [opts]
 * @param {Date}   [opts.since] - only messages after this date
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ results: Array, failures: Array<{ mailbox: string, phase: string, term?: string, error: Error }> }>}
 */
export async function scanForReceipts(client, accountName, mailboxes, opts = {}, onProgress = () => {}) {
  const results = [];
  const failures = [];

  // Deduplicate UIDs per mailbox to avoid fetching the same message twice
  for (const mailbox of mailboxes) {
    const perMailbox = await withMailboxLock(
      client,
      mailbox,
      async () => {
        const mailboxResults = [];
        // @ts-expect-error — imapflow types client.mailbox as false|MailboxObject; ?. handles the false case at runtime
        onProgress(mailboxStart(mailbox, client.mailbox?.exists));
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
            onProgress(searchError(err, term));
            failures.push({ mailbox, phase: "search", term, error: err });
            continue;
          }

          if (!uids || uids.length === 0) continue;
          for (const uid of uids) allUids.add(uid);
        }

        if (allUids.size === 0) {
          onProgress(mailboxEmpty(mailbox));
          return mailboxResults;
        }

        onProgress(mailboxMatches(mailbox, allUids.size));

        // Fetch envelopes for all unique UIDs (as comma-separated range string)
        const uidRange = [...allUids].join(",");
        try {
          for await (const msg of client.fetch(uidRange, { envelope: true, uid: true }, { uid: true })) {
            mailboxResults.push(buildScanResult(accountName, mailbox, msg));
          }
        } catch (err) {
          onProgress(fetchError(err));
          failures.push({ mailbox, phase: "fetch", error: err });
        }

        return mailboxResults;
      },
      { onProgress },
    );
    if (perMailbox) results.push(...perMailbox);
  }

  return { results, failures };
}

/**
 * @param {import("imapflow").ImapFlow} client
 * @returns {Promise<Array<{path: string, name: string, flags: any, specialUse: any}>>}
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
 * @returns {Promise<void>}
 */
export async function forEachAccount(accounts, fn, onProgress = () => {}) {
  for (const account of accounts) {
    let client;
    try {
      client = await connect(account, onProgress);
    } catch (err) {
      onProgress(connectError(err, account.name));
      continue;
    }
    try {
      await fn(client, account);
    } finally {
      await client.logout();
    }
  }
}
