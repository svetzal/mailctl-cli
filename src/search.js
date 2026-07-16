/**
 * Email search logic — IMAP mailbox search with deduplication.
 * Extracted from cli.js to keep the shell thin and this logic testable.
 */

import { sanitizeForAgentOutput } from "./content-sanitizer.js";
import { withMailboxLock } from "./imap-orchestration.js";

/**
 * @param {object} opts
 * @param {string} [opts.from]
 * @param {string} [opts.to]
 * @param {string} [opts.subject]
 * @param {string} [opts.body]
 * @param {Record<string, any>} dateCriteria
 * @returns {Record<string, any>}
 */
function buildFieldCriteria(opts, dateCriteria) {
  /** @type {Record<string, any>} */
  const criteria = { ...dateCriteria };
  if (opts.from) criteria.from = opts.from;
  if (opts.to) criteria.to = opts.to;
  if (opts.subject) criteria.subject = opts.subject;
  if (opts.body) criteria.body = opts.body;
  return criteria;
}

/**
 * @param {import("./imap-types.js").ImapClient} client
 * @param {string} uidRange
 * @param {string} acctName
 * @param {string} mailboxPath
 * @returns {Promise<Array>}
 */
async function fetchAndMap(client, uidRange, acctName, mailboxPath) {
  const results = [];
  for await (const msg of client.fetch(
    uidRange,
    { envelope: true, headers: ["message-id"], uid: true },
    { uid: true },
  )) {
    const env = msg.envelope;
    const from = env.from?.[0];
    const to = env.to?.[0];
    const messageId = env.messageId || "";
    results.push({
      account: acctName,
      mailbox: mailboxPath,
      uid: msg.uid,
      messageId,
      date: env.date,
      from: from?.address || "",
      fromName: sanitizeForAgentOutput(from?.name || ""),
      to: to?.address || "",
      toName: sanitizeForAgentOutput(to?.name || ""),
      subject: sanitizeForAgentOutput(env.subject || ""),
    });
  }
  return results;
}

/**
 * Search a single mailbox within an already-connected IMAP client.
 * Returns an array of result objects (may be empty).
 *
 * When no field-specific criteria are provided the query is matched against
 * both the From header and the Subject header, and the results are merged.
 *
 * @param {import("./imap-types.js").ImapClient} client - connected IMAP client
 * @param {string} acctName
 * @param {string} mailboxPath
 * @param {string|null|undefined} query
 * @param {object} [opts]
 * @param {string} [opts.from]    - search by sender
 * @param {string} [opts.to]      - search by recipient
 * @param {string} [opts.subject] - search by subject
 * @param {string} [opts.body]    - search by body
 * @param {Date}   [opts.since]   - IMAP SINCE (on or after this date)
 * @param {Date}   [opts.before]  - IMAP BEFORE (before this date, exclusive)
 * @param {number} [opts.limit=20] - max results
 * @param {function(object): void} [opts.onProgress] - receives structured progress events
 * @returns {Promise<Array>}
 */
export async function searchMailbox(client, acctName, mailboxPath, query, opts = {}) {
  const limit = opts.limit || 20;
  const onProgress = opts.onProgress || (() => {});

  return (
    (await withMailboxLock(
      client,
      mailboxPath,
      async () => {
        const hasFieldCriteria = !!(opts.from || opts.to || opts.subject || opts.body);

        /** @type {Record<string, any>} */
        const dateCriteria = {};
        if (opts.since) dateCriteria.since = opts.since;
        if (opts.before) dateCriteria.before = opts.before;

        if (!query && !hasFieldCriteria) return [];

        let uidsToFetch;
        if (!hasFieldCriteria) {
          // General query only — search both From and Subject
          const fromResult = await client.search({ from: query, ...dateCriteria }, { uid: true }).catch(() => []);
          const subjResult = await client.search({ subject: query, ...dateCriteria }, { uid: true }).catch(() => []);
          const fromUids = Array.isArray(fromResult) ? fromResult : [];
          const subjUids = Array.isArray(subjResult) ? subjResult : [];
          uidsToFetch = [...new Set([...fromUids, ...subjUids])];
        } else {
          // Field-specific criteria (with or without general query)
          uidsToFetch = await client.search(buildFieldCriteria(opts, dateCriteria), { uid: true });
        }

        if (!uidsToFetch || uidsToFetch.length === 0) return [];

        const uidRange = uidsToFetch.slice(-limit).join(",");
        return fetchAndMap(client, uidRange, acctName, mailboxPath);
      },
      { onProgress },
    )) ?? []
  );
}
