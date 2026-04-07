/**
 * Find which mailbox contains a given UID.
 * Tries INBOX first, then scans all provided mailbox paths.
 *
 * @param {any} client - connected IMAP client
 * @param {number|string} uid - message UID to find
 * @param {string[]} mailboxPaths - mailbox paths to search (already filtered)
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<string|null>} mailbox path or null if not found
 */
export async function detectMailbox(client, uid, mailboxPaths, onProgress = () => {}) {
  const uidStr = String(uid);

  // Fast path: try INBOX first
  const inboxFound = await searchMailboxForUid(client, "INBOX", uidStr, onProgress);
  if (inboxFound) return "INBOX";

  // Scan remaining mailboxes
  for (const path of mailboxPaths) {
    if (path === "INBOX") continue;
    const found = await searchMailboxForUid(client, path, uidStr, onProgress);
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
 * @param {function(object): void} onProgress
 * @returns {Promise<boolean>}
 */
async function searchMailboxForUid(client, mailboxPath, uid, onProgress) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return false;
  }

  try {
    const found = await client.search({ uid }, { uid: true });
    return found && found.length > 0;
  } catch (err) {
    // Search failed — return empty results
    onProgress({ type: "search-failed", mailbox: mailboxPath, error: err });
    return false;
  } finally {
    lock.release();
  }
}
