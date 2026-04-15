/**
 * Pure formatting functions for the list-folders command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {object} FolderInfo
 * @property {string} path - IMAP folder path
 * @property {string|null} specialUse - special-use attribute (e.g. "\\Trash") or null
 */

/**
 * @typedef {object} AccountFolders
 * @property {string} account - account display name
 * @property {FolderInfo[]} folders - folders belonging to this account
 */

/**
 * Format a human-readable listing of folders grouped by account.
 *
 * @param {AccountFolders[]} foldersByAccount - folder data grouped by account
 * @returns {string}
 */
export function formatFoldersText(foldersByAccount) {
  if (foldersByAccount.length === 0) {
    return "";
  }

  const lines = [];

  for (const { account, folders } of foldersByAccount) {
    lines.push(`\n=== ${account} ===`);
    for (const f of folders) {
      const special = f.specialUse ? ` (${f.specialUse})` : "";
      lines.push(`  ${f.path}${special}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a JSON-ready flat array of folders, each tagged with its account name.
 *
 * @param {AccountFolders[]} foldersByAccount
 * @returns {{ account: string, path: string, specialUse: string|null }[]}
 */
export function buildFoldersJson(foldersByAccount) {
  return foldersByAccount.flatMap((af) => af.folders.map((f) => ({ account: af.account, ...f })));
}
