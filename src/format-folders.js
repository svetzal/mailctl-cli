import { createFormatOutput } from "./cli-helpers.js";

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
 * Flattens per-account folder groups into a single array, tagging each entry with its account name.
 *
 * @param {AccountFolders[]} foldersByAccount
 * @returns {{ account: string, path: string, specialUse: string|null }[]}
 */
export function buildFoldersJson(foldersByAccount) {
  return foldersByAccount.flatMap((af) => af.folders.map((f) => ({ account: af.account, ...f })));
}

/** @type {(json: boolean, foldersByAccount: AccountFolders[]) => string} */
export const formatFoldersOutput = createFormatOutput(buildFoldersJson, formatFoldersText);
