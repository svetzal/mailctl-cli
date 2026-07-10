/**
 * Contacts command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js contacts handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */

import { getConfigSelfAddresses } from "../config.js";
import { aggregateContacts, extractContacts } from "../contacts.js";
import { formatShortDateWithYear } from "../format-date.js";
import { parseIntOption, parseSinceOption } from "../parse-options.js";
import { rethrowWithPrefix } from "../rethrow-with-prefix.js";

/**
 * @typedef {object} ContactsCommandDeps
 * @property {object[]} targetAccounts - accounts to scan
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 */

/**
 * @param {object} opts - CLI options (limit, since, sent, received, search)
 * @param {ContactsCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ contacts: Array, sinceLabel: string }>}
 */
export async function contactsCommand(opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount } = deps;

  const limit = parseIntOption(opts.limit, 25);
  const since = parseSinceOption(opts.since, "6m");

  const sinceLabel = opts.since ? `since ${formatShortDateWithYear(since)}` : "last 6 months";

  const allEntries = [];

  try {
    await forEachAccount(targetAccounts, async (client, acct) => {
      const entries = await extractContacts(client, acct.name, {
        since,
        limit,
        sentOnly: opts.sent ?? false,
        receivedOnly: opts.received ?? false,
        onProgress,
      });

      allEntries.push(...entries);
    });
  } catch (err) {
    rethrowWithPrefix(err, "Contacts fetch failed");
  }

  // Collect self addresses: config selfAddresses + each account's user address
  const selfAddresses = [...getConfigSelfAddresses()];
  for (const acct of targetAccounts) {
    if (acct.user) selfAddresses.push(acct.user);
  }

  const contacts = aggregateContacts(allEntries, {
    search: opts.search,
    limit,
    selfAddresses,
  });

  return { contacts, sinceLabel };
}
