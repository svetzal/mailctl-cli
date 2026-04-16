/**
 * Shared IMAP orchestration utilities.
 * Pure logic or thin async helpers — no direct I/O imports.
 *
 * Standard error event types emitted via onProgress:
 *
 * - `{ type: "mailbox-lock-failed", mailbox: string, error: Error }` — lock acquisition failed
 * - `{ type: "search-failed", mailbox: string, error: Error }` — search within a locked mailbox failed
 *
 * Helpers:
 *
 * - `withMailboxLock(client, mailboxPath, fn, options)` — acquire a lock, run fn, release in finally
 * - `groupByMailbox(results)` — group scan results by mailbox path
 * - `forEachMailboxGroup(client, byMailbox, fn, onProgress)` — iterate over a mailbox→messages map with locking
 */

/**
 * Acquires a mailbox lock, runs fn(), and releases it in a finally block.
 * On lock failure, calls onLockFailed(err) if provided and returns its result.
 * Otherwise emits { type: "mailbox-lock-failed", mailbox, error } via onProgress
 * and returns undefined.
 *
 * @param {object} client - imapflow client
 * @param {string} mailboxPath - mailbox path to lock
 * @param {() => Promise<any>} fn - async function to run inside the lock
 * @param {{ onProgress?: (event: object) => void, onLockFailed?: (err: Error) => any }} [options]
 * @returns {Promise<any>}
 */
export async function withMailboxLock(client, mailboxPath, fn, { onProgress = () => {}, onLockFailed } = {}) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    if (onLockFailed) {
      return onLockFailed(err);
    }
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return undefined;
  }
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

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
 * Emits `mailbox-lock-failed` via onProgress when `getMailboxLock` throws
 * (e.g. mailbox not found), then skips that mailbox.
 *
 * @param {any} client - connected IMAP client (accepts duck-typed mocks in tests)
 * @param {Map<string, Array>} byMailbox - produced by groupByMailbox()
 * @param {function(string, Array): Promise<void>} fn - called with (mailboxPath, messages)
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<void>}
 */
export async function forEachMailboxGroup(client, byMailbox, fn, onProgress = () => {}) {
  for (const [mailbox, messages] of byMailbox) {
    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch (err) {
      onProgress({ type: "mailbox-lock-failed", mailbox, error: err });
      continue;
    }
    try {
      await fn(mailbox, messages);
    } finally {
      lock.release();
    }
  }
}
