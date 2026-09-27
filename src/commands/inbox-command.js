/**
 * Inbox command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js inbox handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */
import { fetchInbox } from "../inbox.js";
import { parseIntOption, parseSinceOption } from "../parse-options.js";
import { rethrowWithPrefix } from "../rethrow-with-prefix.js";

/**
 * @typedef {Object} InboxCommandDeps
 * @property {Object[]} targetAccounts - accounts to check
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 */

/**
 * @param {Object} opts - CLI options (limit, unread, since)
 * @param {InboxCommandDeps} deps - injected dependencies
 * @param {(event: Object) => void} [onProgress] - receives structured progress events
 * @returns {Promise<{ resultsByAccount: Map<string, Array>, allResults: Array, accountFailures: Array<{account: string, error: string}> }>}
 */
export async function inboxCommand(opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount } = deps;

  const limit = parseIntOption(opts.limit, 10);
  const since = parseSinceOption(opts.since, "7d");

  /** @type {Map<string, Array>} */
  const resultsByAccount = new Map();
  const allResults = [];
  let accountFailures = [];

  try {
    ({ accountFailures = [] } =
      (await forEachAccount(targetAccounts, async (client, acct) => {
        const messages = await fetchInbox(client, acct.name, {
          limit,
          since,
          unreadOnly: opts.unread ?? false,
          onProgress,
        });

        resultsByAccount.set(acct.name, messages);
        allResults.push(...messages);
      })) ?? {});
  } catch (err) {
    rethrowWithPrefix(err, "Inbox fetch failed");
  }

  return { resultsByAccount, allResults, accountFailures };
}
