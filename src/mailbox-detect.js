import { debug } from "./debug.js";

/**
 * Find which mailbox contains a given UID.
 * Tries INBOX first, then scans all provided mailbox paths.
 *
 * @param {any} client - connected IMAP client
 * @param {number|string} uid - message UID to find
 * @param {string[]} mailboxPaths - mailbox paths to search (already filtered)
 * @returns {Promise<string|null>} mailbox path or null if not found
 */
export async function detectMailbox(client, uid, mailboxPaths) {
  const uidStr = String(uid);

  // Fast path: try INBOX first
  const inboxFound = await searchMailboxForUid(client, "INBOX", uidStr);
  if (inboxFound) return "INBOX";

  // Scan remaining mailboxes
  for (const path of mailboxPaths) {
    if (path === "INBOX") continue;
    const found = await searchMailboxForUid(client, path, uidStr);
    if (found) return path;
  }

  return null;
}

/**
 * Check if a UID exists in a specific mailbox.
 *
 * @param {any} client - connected IMAP client
 * @param {string} mailboxPath - mailbox to check
 * @param {string} uid - UID to search for
 * @returns {Promise<boolean>}
 */
async function searchMailboxForUid(client, mailboxPath, uid) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    debug("mailbox-detect", "mailbox lock failed, skipping", err);
    return false;
  }

  try {
    const found = await client.search({ uid }, { uid: true });
    return found && found.length > 0;
  } catch (err) {
    // Search failed — return empty results
    debug("mailbox-detect", "search failed, returning empty", err);
    return false;
  } finally {
    lock.release();
  }
}
