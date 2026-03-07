/**
 * Shared IMAP orchestration utilities.
 * Pure logic or thin async helpers — no direct I/O imports.
 */

/**
 * Group scan results by mailbox path.
 * Pure function — same inputs always produce same output.
 *
 * @template {{ mailbox: string }} T
 * @param {T[]} results - array of items that each carry a .mailbox property
 * @returns {Map<string, T[]>}
 */
export function groupByMailbox(results) {
  const map = new Map();
  for (const r of results) {
    if (!map.has(r.mailbox)) map.set(r.mailbox, []);
    map.get(r.mailbox).push(r);
  }
  return map;
}

/**
 * Iterate over a mailbox→messages map, acquiring an IMAP lock for each mailbox,
 * calling `fn`, and releasing the lock in a `finally` block.
 *
 * Skips a mailbox silently when `getMailboxLock` throws (e.g. mailbox not found).
 *
 * @param {any} client - connected IMAP client (accepts duck-typed mocks in tests)
 * @param {Map<string, Array>} byMailbox - produced by groupByMailbox()
 * @param {function(string, Array): Promise<void>} fn - called with (mailboxPath, messages)
 * @returns {Promise<void>}
 */
export async function forEachMailboxGroup(client, byMailbox, fn) {
  for (const [mailbox, messages] of byMailbox) {
    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch {
      // Mailbox not accessible on this account — skip silently.
      continue;
    }
    try {
      await fn(mailbox, messages);
    } finally {
      lock.release();
    }
  }
}
