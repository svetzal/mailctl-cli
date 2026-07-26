import { ImapFlow } from "imapflow";
import { connectError } from "./auth-event-factories.js";
import { getM365AccessToken } from "./m365-auth.js";
import { buildReceiptSearchCriteria, searchMailboxForReceiptRecords } from "./receipts/receipt-mailbox-search.js";
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
 * @param {import("./imap-types.js").ImapClient} client
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

  // Scan is subject-only (includeSenders: false): its results feed sender
  // classification (scan → sort/download), not receipt download, so the
  // broader sender-pattern search that searchMailboxForReceipts performs
  // would only add noise here.
  const criteria = buildReceiptSearchCriteria({ since: opts.since, includeSenders: false });

  for (const mailbox of mailboxes) {
    const { results: mailboxResults, failures: mailboxFailures } = await searchMailboxForReceiptRecords(
      client,
      mailbox,
      {
        criteria,
        fetchQuery: { envelope: true, uid: true },
        buildRecord: (msg) => buildScanResult(accountName, mailbox, msg),
        events: {
          start: mailboxStart,
          empty: mailboxEmpty,
          candidates: mailboxMatches,
          searchError,
          fetchError,
        },
        onProgress,
      },
    );
    results.push(...mailboxResults);
    failures.push(...mailboxFailures);
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
 * @param {typeof connect} [connectFn] - injectable for testing; defaults to connect
 * @returns {Promise<{accountFailures: Array<{account: string, error: string}>}>} per-account connect failures; empty when every account connected
 */
export async function forEachAccount(accounts, fn, onProgress = () => {}, connectFn = connect) {
  /** @type {Array<{account: string, error: string}>} */
  const accountFailures = [];
  for (const account of accounts) {
    let client;
    try {
      client = await connectFn(account, onProgress);
    } catch (err) {
      onProgress(connectError(err, account.name));
      accountFailures.push({ account: account.name, error: /** @type {Error} */ (err).message });
      continue;
    }
    try {
      await fn(client, account);
    } finally {
      await client.logout();
    }
  }
  return { accountFailures };
}
