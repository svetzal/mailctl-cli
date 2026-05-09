/**
 * Event factories for download progress events emitted by src/downloader.js.
 */

export const downloadAccountStart = (name, user) => ({ type: "download-account-start", name, user });
export const downloadBizCount = (count) => ({ type: "download-biz-count", count });
export const downloadDryRun = (filename) => ({ type: "download-dry-run", filename });
export const duplicateContent = (filename) => ({ type: "duplicate-content", filename });
export const downloaded = (filename, size) => ({ type: "downloaded", filename, size });
