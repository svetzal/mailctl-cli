/**
 * Message deduplication utilities.
 * Pure functions — no I/O, no side effects.
 */

/**
 * Deduplicate an array of email result objects by message-id.
 *
 * The deduplication key is `mid:<messageId>` when a message-id is present.
 * When absent, the key falls back to `<account>:<mailbox>:<uid>`.
 * First occurrence of each key is kept; subsequent duplicates are discarded.
 *
 * @template {{ messageId?: string, account: string, mailbox: string, uid: string|number }} T
 * @param {T[]} results
 * @returns {T[]}
 */
export function deduplicateByMessageId(results) {
  const seen = new Set();
  const unique = [];

  for (const r of results) {
    const key = r.messageId
      ? `mid:${r.messageId}`
      : `${r.account}:${r.mailbox}:${r.uid}`;

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }

  return unique;
}
