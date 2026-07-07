import { filterSearchMailboxes } from "./imap-client.js";
import { withMailboxLock } from "./imap-orchestration.js";
import { searchFailed } from "./shared-event-factories.js";

/**
 * Find which mailbox contains a given UID.
 * Tries INBOX first, then scans all provided mailbox paths.
 *
 * @param {import("./imap-types.js").ImapClient} client - connected IMAP client
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
 * List all searchable mailboxes, detect which one contains `uid`, and return it.
 * Returns null if not found in any mailbox — does not throw.
 *
 * @param {import("./imap-types.js").ImapClient} client - connected IMAP client
 * @param {string|number} uid - message UID to find
 * @param {Function} listMailboxes - (client) → Promise<Array>
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<string|null>} mailbox path or null if not found
 */
export async function detectMailboxAcrossAll(client, uid, listMailboxes, onProgress = () => {}) {
  const allBoxes = await listMailboxes(client);
  const paths = filterSearchMailboxes(allBoxes);
  const mailbox = await detectMailbox(client, uid, paths, onProgress);
  if (!mailbox) return null;
  return mailbox;
}

/**
 * Check if a UID exists in a specific mailbox.
 *
 * @param {import("./imap-types.js").ImapClient} client - connected IMAP client
 * @param {string} mailboxPath - mailbox to check
 * @param {string} uid - UID to search for
 * @param {function(object): void} onProgress
 * @returns {Promise<boolean>}
 */
async function searchMailboxForUid(client, mailboxPath, uid, onProgress) {
  return (
    (await withMailboxLock(
      client,
      mailboxPath,
      async () => {
        try {
          const found = await client.search({ uid }, { uid: true });
          return found && found.length > 0;
        } catch (err) {
          // Search failed — return false
          onProgress(searchFailed(err, mailboxPath));
          return false;
        }
      },
      { onProgress },
    )) ?? false
  );
}
