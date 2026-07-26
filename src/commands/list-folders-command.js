/**
 * List-folders command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js list-folders handler so it
 * can be tested independently. All IMAP I/O is injected via deps.
 */

import { rethrowWithPrefix } from "../rethrow-with-prefix.js";

/**
 * @typedef {object} ListFoldersCommandDeps
 * @property {object[]} targetAccounts - accounts to list folders for
 * @property {Function} forEachAccount - (accounts, fn, onProgress) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 */

/**
 * @param {object} _opts - CLI options (unused, reserved for future flags)
 * @param {ListFoldersCommandDeps} deps - injected dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ allAccountFolders: Array<{ account: string, folders: Array<{ path: string, specialUse: string|null }> }>, accountFailures: Array<{account: string, error: string}> }>}
 */
export async function listFoldersCommand(_opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount, listMailboxes } = deps;

  /** @type {Array<{ account: string, folders: Array<{ path: string, specialUse: string|null }> }>} */
  const allAccountFolders = [];
  let accountFailures = [];

  try {
    ({ accountFailures = [] } =
      (await forEachAccount(
        targetAccounts,
        async (client, acct) => {
          const folders = await listMailboxes(client);
          allAccountFolders.push({
            account: acct.name,
            folders: folders.map((f) => ({ path: f.path, specialUse: f.specialUse || null })),
          });
        },
        onProgress,
      )) ?? {});
  } catch (err) {
    rethrowWithPrefix(err, "List folders failed");
  }

  return { allAccountFolders, accountFailures };
}
