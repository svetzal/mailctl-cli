/**
 * Search command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js search handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */

import { resolveDateFilters } from "./date-filters.js";
import { deduplicateByMessageId } from "./dedup.js";
import { filterSearchMailboxes } from "./imap-client.js";
import { parseIntOption } from "./parse-options.js";
import { searchMailbox } from "./search.js";

/**
 * @typedef {object} SearchCommandDeps
 * @property {object[]} targetAccounts - accounts to search
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 */

/**
 * Orchestrate searching for emails across configured accounts.
 *
 * @param {string|undefined} query - general search query (optional with field opts)
 * @param {object} opts - CLI options (from, to, subject, body, since, before, months, mailbox, excludeMailbox, limit)
 * @param {SearchCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ allResults: Array, warnings: string[] }>}
 * @throws {Error} when neither a query nor field criteria are provided
 */
export async function searchCommand(query, opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount, listMailboxes } = deps;

  if (!query && !opts.from && !opts.to && !opts.subject && !opts.body) {
    throw new Error("Provide a search query or use --from, --to, --subject, or --body to filter.");
  }

  const limit = parseIntOption(opts.limit, 20);

  const { since, before, warnings } = resolveDateFilters({
    months: opts.months,
    since: opts.since,
    before: opts.before,
  });

  const allResults = [];

  await forEachAccount(targetAccounts, async (client, acct) => {
    let mailboxPaths;
    const mailboxOption = opts.mailbox ?? [];
    if (mailboxOption.length > 0) {
      mailboxPaths = mailboxOption;
    } else {
      const allBoxes = await listMailboxes(client);
      mailboxPaths = filterSearchMailboxes(allBoxes, {
        excludePaths: opts.excludeMailbox ?? [],
      });
    }

    // Search mailboxes sequentially (IMAP requires one mailbox lock at a time)
    const accountResults = [];
    for (const mbPath of mailboxPaths) {
      const results = await searchMailbox(client, acct.name, mbPath, query, {
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        since,
        before,
        limit,
        onProgress,
      });
      accountResults.push(...results);
    }

    // Deduplicate by message-id before adding to global results
    const dedupedResults = deduplicateByMessageId(accountResults);
    allResults.push(...dedupedResults);
  });

  return { allResults, warnings };
}
