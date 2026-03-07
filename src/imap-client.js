import { ImapFlow } from "imapflow";
import { getM365AccessToken } from "./m365-auth.js";

/**
 * Connect to an IMAP server and return the client.
 * Supports both password-based and OAuth2 (XOAUTH2) authentication.
 *
 * @param {{ host: string, port: number, user: string, pass?: string, oauth2?: { clientId: string, tenantId: string, clientSecret: string }, name?: string }} account
 * @returns {Promise<ImapFlow>}
 */
export async function connect(account) {
  let auth;

  if (account.oauth2) {
    const accessToken = await getM365AccessToken(account.oauth2);
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
 * @returns {Promise<Array>}
 */
export async function scanForReceipts(client, accountName, mailboxes, opts = {}) {
  const results = [];

  const RECEIPT_SUBJECTS = [
    "receipt",
    "order confirmation",
    "payment confirmation",
    "your order",
    "invoice",
    "purchase confirmation",
    "billing statement",
    "transaction",
    "payment received",
    "subscription confirmation",
    "renewal confirmation",
    "thank you for your purchase",
    "your payment",
    "order shipped",        // often contains order total
  ];

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
      console.error(`   📂 ${mailbox} (${client.mailbox && client.mailbox.exists} messages)`);
      const allUids = new Set();

      for (const term of RECEIPT_SUBJECTS) {
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
          console.error(`      ⚠️  Search for "${term}" failed: ${err.message}`);
          continue;
        }

        if (!uids || uids.length === 0) continue;
        for (const uid of uids) allUids.add(uid);
      }

      if (allUids.size === 0) {
        console.error(`      (no matches)`);
        continue;
      }

      console.error(`      🎯 ${allUids.size} unique messages to fetch`);

      // Fetch envelopes for all unique UIDs (as comma-separated range string)
      const uidRange = [...allUids].join(",");
      try {
        for await (const msg of client.fetch(uidRange, { envelope: true, uid: true }, { uid: true })) {
          const env = msg.envelope;
          const from = env.from?.[0];
          const fromAddr = from ? `${from.name || ""} <${from.address}>`.trim() : "unknown";

          results.push({
            account: accountName,
            from: fromAddr,
            address: from?.address?.toLowerCase() || "unknown",
            name: from?.name || "",
            subject: env.subject || "",
            date: env.date,
            mailbox,
            uid: msg.uid,
          });
        }
      } catch (err) {
        console.error(`      ⚠️  Fetch failed: ${err.message}`);
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

/** Special-use flags for mailboxes that should be excluded from scanning. */
const EXCLUDED_SPECIAL_USE = new Set(["\\Junk", "\\Trash", "\\Drafts"]);

/** Special-use flags excluded from search by default (less restrictive than scan). */
const SEARCH_EXCLUDED_SPECIAL_USE = new Set(["\\Junk", "\\Drafts"]);

/**
 * Filter mailboxes to those suitable for scanning.
 * Excludes Junk, Trash, Drafts, Apple Mail internal folders, and Notes.
 * @param {Array} mailboxes - from listMailboxes()
 * @param {object} [opts]
 * @param {string[]} [opts.excludePaths] - additional path prefixes to exclude
 * @param {boolean} [opts.excludeSent] - also exclude Sent folders
 * @returns {string[]} filtered mailbox paths
 */
export function filterScanMailboxes(mailboxes, opts = {}) {
  const excludePaths = opts.excludePaths || [];
  return mailboxes
    .filter((mb) => {
      if (mb.specialUse && EXCLUDED_SPECIAL_USE.has(mb.specialUse)) return false;
      if (opts.excludeSent && mb.specialUse === "\\Sent") return false;
      if (mb.path.startsWith("_")) return false;
      if (mb.path === "Notes") return false;
      for (const prefix of excludePaths) {
        if (mb.path.startsWith(prefix)) return false;
      }
      return true;
    })
    .map((mb) => mb.path);
}

/**
 * Filter mailboxes suitable for searching.
 * Less restrictive than scan — includes Trash, Sent, Archive, and custom folders.
 * Excludes only Junk, Drafts, Apple Mail internal folders, and Notes by default.
 * @param {Array} mailboxes - from listMailboxes()
 * @param {object} [opts]
 * @param {string[]} [opts.excludePaths] - additional path prefixes to exclude
 * @returns {string[]} filtered mailbox paths
 */
export function filterSearchMailboxes(mailboxes, opts = {}) {
  const excludePaths = opts.excludePaths || [];
  return mailboxes
    .filter((mb) => {
      if (mb.specialUse && SEARCH_EXCLUDED_SPECIAL_USE.has(mb.specialUse)) return false;
      if (mb.path.startsWith("_")) return false;
      if (mb.path === "Notes") return false;
      for (const prefix of excludePaths) {
        if (mb.path === prefix || mb.path.startsWith(prefix + "/")) return false;
      }
      return true;
    })
    .map((mb) => mb.path);
}

/**
 * Run an async callback for each configured account with a connected IMAP client.
 * Handles connect/logout lifecycle and error reporting.
 * @param {Array} accounts - from loadAccounts()
 * @param {function(import("imapflow").ImapFlow, object): Promise<void>} fn - callback receiving (client, account)
 */
export async function forEachAccount(accounts, fn) {
  for (const account of accounts) {
    let client;
    try {
      client = await connect(account);
    } catch (err) {
      console.error(`   ❌ Failed to connect to ${account.name}: ${err.message}`);
      continue;
    }
    try {
      await fn(client, account);
    } finally {
      await client.logout();
    }
  }
}
