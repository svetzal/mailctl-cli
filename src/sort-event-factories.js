/**
 * Event factories for sort progress events emitted by src/sorter.js.
 */

export const accountStart = (name, user) => ({ type: "account-start", name, user });
export const folderExists = (folder) => ({ type: "folder-exists", folder });
export const folderCreated = (folder) => ({ type: "folder-created", folder });
export const scanComplete = (count) => ({ type: "scan-complete", count });
export const moveDryRun = (icon, count, label) => ({ type: "move-dry-run", icon, count, label });
export const moved = (icon, count, label) => ({ type: "moved", icon, count, label });
