/**
 * Pure mailbox filtering functions.
 * Extracted from imap-client.js so they can be tested independently of IMAP I/O.
 */

/** Special-use flags for mailboxes that should be excluded from scanning. */
const EXCLUDED_SPECIAL_USE = new Set(["\\Junk", "\\Trash", "\\Drafts"]);

/** Special-use flags excluded from search by default (less restrictive than scan). */
const SEARCH_EXCLUDED_SPECIAL_USE = new Set(["\\Junk", "\\Drafts"]);

/**
 * Filter mailboxes to those suitable for scanning.
 * Excludes Junk, Trash, Drafts, Apple Mail internal folders, and Notes.
 * @param {Array<{ path: string, specialUse?: string }>} mailboxes - from listMailboxes()
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
 * @param {Array<{ path: string, specialUse?: string }>} mailboxes - from listMailboxes()
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
