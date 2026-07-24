/**
 * Shared receipt-search core.
 *
 * Both `scanForReceipts` (src/imap-client.js) and `searchMailboxForReceipts`
 * (src/receipts/receipt-search-pipeline.js) run the same algorithm: lock a
 * mailbox, search it term-by-term, dedup matching UIDs into a Set, fetch
 * envelopes for the combined UID range, and tally per-item failures. This
 * module is the single authoritative implementation of that algorithm — the
 * two callers differ only in which search criteria they build and which
 * progress events they emit.
 */

import { withMailboxLock } from "../imap-orchestration.js";
import { rethrowIfProgrammerError } from "../programmer-error.js";
import { BILLING_SENDER_PATTERNS, RECEIPT_SUBJECT_TERMS } from "./receipt-terms.js";

/**
 * Builds the ordered list of IMAP search criteria used to find candidate
 * receipt messages: one `{subject}` criterion per receipt subject term, plus
 * (when `includeSenders` is true) one `{from}` criterion per known billing
 * sender pattern. `since`, when present, is applied to every criterion.
 *
 * @param {object} [opts]
 * @param {Date} [opts.since] - only messages after this date
 * @param {boolean} [opts.includeSenders] - also search BILLING_SENDER_PATTERNS as `{from}` criteria
 * @returns {Array<{ term: string, criteria: object }>}
 */
export function buildReceiptSearchCriteria({ since, includeSenders = false } = {}) {
  /** @type {Array<{ term: string, criteria: { subject?: string, from?: string, since?: Date } }>} */
  const entries = RECEIPT_SUBJECT_TERMS.map((term) => ({ term, criteria: { subject: term } }));

  if (includeSenders) {
    for (const pattern of BILLING_SENDER_PATTERNS) {
      entries.push({ term: pattern, criteria: { from: pattern } });
    }
  }

  if (since) {
    for (const entry of entries) entry.criteria.since = since;
  }

  return entries;
}

/**
 * Locks `mailboxPath`, searches it with each of `criteria` in turn, dedups the
 * matching UIDs, fetches `fetchQuery` for the combined range, and maps each
 * fetched message through `buildRecord`. Escalates programmer errors
 * (TypeError/ReferenceError/RangeError/SyntaxError without a Node I/O `code`)
 * out of both the search and fetch phases via `rethrowIfProgrammerError` —
 * this is the single place that owns that contract for both callers.
 *
 * @param {import("../imap-types.js").ImapClient} client - connected IMAP client
 * @param {string} mailboxPath
 * @param {object} opts
 * @param {Array<{ term: string, criteria: object }>} opts.criteria - from buildReceiptSearchCriteria()
 * @param {object} opts.fetchQuery - imapflow fetch query (e.g. { envelope: true, uid: true })
 * @param {function(object): object} opts.buildRecord - maps a fetched message to a result record
 * @param {object} [opts.events] - optional progress-event factories; each slot is skipped when absent
 * @param {function(string, number | undefined): object} [opts.events.start] - (mailbox, messageCount) => event
 * @param {function(string): object} [opts.events.empty] - (mailbox) => event
 * @param {function(string, number): object} [opts.events.candidates] - (mailbox, count) => event
 * @param {function(Error, string): object} [opts.events.searchError] - (error, term) => event; callers that
 *        report the mailbox instead of the term should close over mailboxPath rather than rely on this arg
 * @param {function(Error): object} [opts.events.fetchError] - (error) => event
 * @param {function(object): void} [opts.onProgress] - receives emitted progress events
 * @returns {Promise<{ results: Array, failures: Array<{ mailbox: string, phase: string, term?: string, error: Error }> }>}
 */
export async function searchMailboxForReceiptRecords(
  client,
  mailboxPath,
  { criteria, fetchQuery, buildRecord, events = {}, onProgress = () => {} },
) {
  const failures = [];

  const inner = await withMailboxLock(
    client,
    mailboxPath,
    async () => {
      // client.mailbox is false | MailboxObject on a real ImapFlow; convert false → undefined
      // so that optional chaining correctly short-circuits on "no mailbox selected".
      const messageCount = (client.mailbox || undefined)?.exists;
      if (events.start) onProgress(events.start(mailboxPath, messageCount));

      const allUids = new Set();
      for (const { term, criteria: searchCriteria } of criteria) {
        try {
          const uids = await client.search(searchCriteria, { uid: true });
          if (uids) for (const uid of uids) allUids.add(uid);
        } catch (err) {
          rethrowIfProgrammerError(err);
          if (events.searchError) onProgress(events.searchError(err, term));
          failures.push({ mailbox: mailboxPath, phase: "search", term, error: err });
        }
      }

      if (allUids.size === 0) {
        if (events.empty) onProgress(events.empty(mailboxPath));
        return [];
      }

      if (events.candidates) onProgress(events.candidates(mailboxPath, allUids.size));

      const results = [];
      const uidRange = [...allUids].join(",");
      try {
        for await (const msg of client.fetch(uidRange, fetchQuery, { uid: true })) {
          results.push(buildRecord(msg));
        }
      } catch (err) {
        rethrowIfProgrammerError(err);
        if (events.fetchError) onProgress(events.fetchError(err));
        failures.push({ mailbox: mailboxPath, phase: "fetch", error: err });
      }

      return results;
    },
    { onProgress },
  );

  return { results: inner ?? [], failures };
}
