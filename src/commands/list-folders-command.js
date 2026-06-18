/**
 * List-folders command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js list-folders handler so it
 * can be tested independently. All IMAP I/O is injected via deps.
 */

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
 * @returns {Promise<{ allAccountFolders: Array<{ account: string, folders: Array<{ path: string, specialUse: string|null }> }> }>}
 */
export async function listFoldersCommand(_opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount, listMailboxes } = deps;

  /** @type {Array<{ account: string, folders: Array<{ path: string, specialUse: string|null }> }>} */
  const allAccountFolders = [];

  try {
    await forEachAccount(
      targetAccounts,
      async (client, acct) => {
        const folders = await listMailboxes(client);
        allAccountFolders.push({
          account: acct.name,
          folders: folders.map((f) => ({ path: f.path, specialUse: f.specialUse || null })),
        });
      },
      onProgress,
    );
  } catch (err) {
    throw new Error(`List folders failed: ${err.message}`);
  }

  return { allAccountFolders };
}
