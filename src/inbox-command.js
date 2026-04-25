/**
 * Inbox command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js inbox handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */
import { fetchInbox } from "./inbox.js";
import { parseIntOption, parseSinceOption } from "./parse-options.js";

/**
 * @typedef {object} InboxCommandDeps
 * @property {object[]} targetAccounts - accounts to check
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 */

/**
 * Orchestrate fetching recent inbox messages across accounts.
 *
 * @param {object} opts - CLI options (limit, unread, since)
 * @param {InboxCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ resultsByAccount: Map<string, Array>, allResults: Array }>}
 */
export async function inboxCommand(opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount } = deps;

  const limit = parseIntOption(opts.limit, 10);
  const since = parseSinceOption(opts.since, "7d");

  /** @type {Map<string, Array>} */
  const resultsByAccount = new Map();
  const allResults = [];

  await forEachAccount(targetAccounts, async (client, acct) => {
    const messages = await fetchInbox(client, acct.name, {
      limit,
      since,
      unreadOnly: opts.unread ?? false,
      onProgress,
    });

    resultsByAccount.set(acct.name, messages);
    allResults.push(...messages);
  });

  return { resultsByAccount, allResults };
}
