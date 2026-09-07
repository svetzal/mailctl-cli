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
 * @param {boolean} [opts.includeJunk] - also include the Junk folder(s), wherever they live
 * @returns {string[]} filtered mailbox paths
 */
export function filterSearchMailboxes(mailboxes, opts = {}) {
  const excludePaths = opts.excludePaths || [];
  return mailboxes
    .filter((mb) => {
      const isJunk = mb.specialUse === "\\Junk";
      if (isJunk && opts.includeJunk) {
        // Opted in: the Junk folder is searchable even when it sits under an
        // underscore-prefixed parent (e.g. `_lma-shield/spam`).
        return !excludePaths.some((prefix) => mb.path === prefix || mb.path.startsWith(`${prefix}/`));
      }
      if (mb.specialUse && SEARCH_EXCLUDED_SPECIAL_USE.has(mb.specialUse)) return false;
      // Underscore-prefixed folders are tool-internal (e.g. Apple Mail's, or the
      // Leave Me Alone unsubscribe service's `_lma-shield`) and excluded by default —
      // EXCEPT the screening quarantine (`_lma-shield/screened`), where Leave Me Alone
      // parks screened mail that can include legitimate vendor invoices, so it must
      // remain searchable.
      if (mb.path.startsWith("_") && !mb.path.endsWith("/screened")) return false;
      if (mb.path === "Notes") return false;
      for (const prefix of excludePaths) {
        if (mb.path === prefix || mb.path.startsWith(`${prefix}/`)) return false;
      }
      return true;
    })
    .map((mb) => mb.path);
}

/**
 * Paths of the mailboxes flagged as Junk. Used to tell the user what a default
 * search did not look at, so a message filed as spam is never silently invisible.
 * @param {Array<{ path: string, specialUse?: string }>} mailboxes - from listMailboxes()
 * @returns {string[]}
 */
export function junkMailboxes(mailboxes) {
  return mailboxes.filter((mb) => mb.specialUse === "\\Junk").map((mb) => mb.path);
}
