/**
 * Shared IMAP orchestration utilities.
 * Pure logic or thin async helpers — no direct I/O imports.
 *
 * Standard error event types emitted via onProgress:
 *
 * - `{ type: "mailbox-lock-failed", severity: "error", mailbox: string, error: Error }` — lock acquisition failed
 * - `{ type: "search-failed", severity: "warning", mailbox: string, error: Error }` — search within a locked mailbox failed
 *
 * Helpers:
 *
 * - `streamToBuffer(stream)` — consume a readable stream into a Buffer
 * - `withMailboxLock(client, mailboxPath, fn, options)` — acquire a lock, run fn, release in finally; returns null on lock failure
 * - `groupByMailbox(results)` — group scan results by mailbox path
 * - `forEachMailboxGroup(client, byMailbox, fn, onProgress)` — iterate over a mailbox→messages map with locking
 */

import { errorEvent } from "./error-event.js";

/**
 * Consume a Node.js readable stream and return all data as a single Buffer.
 *
 * @param {AsyncIterable<Buffer>} stream - readable stream to consume
 * @returns {Promise<Buffer>}
 */
export async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Acquires a mailbox lock, runs fn(), and releases it in a finally block.
 * On lock failure, emits { type: "mailbox-lock-failed", mailbox, error } via onProgress
 * and returns null. Callers should check for a null return value to detect lock failure.
 *
 * @param {object} client - imapflow client
 * @param {string} mailboxPath - mailbox path to lock
 * @param {() => Promise<any>} fn - async function to run inside the lock
 * @param {{ onProgress?: (event: object) => void }} [options]
 * @returns {Promise<any>}
 */
export async function withMailboxLock(client, mailboxPath, fn, { onProgress = () => {} } = {}) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    onProgress(errorEvent("mailbox-lock-failed", "error", err, { mailbox: mailboxPath }));
    return null;
  }
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

/**
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
      onProgress(errorEvent("mailbox-lock-failed", "error", err, { mailbox }));
      continue;
    }
    try {
      await fn(mailbox, messages);
    } finally {
      lock.release();
    }
  }
}
