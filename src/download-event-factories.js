/**
 * Event factories for download progress events emitted by src/downloader.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

export const downloadAccountStart = defineEvent("download-account-start", "name", "user");
export const downloadBizCount = defineEvent("download-biz-count", "count");
export const downloadDryRun = defineEvent("download-dry-run", "filename");
export const duplicateContent = defineEvent("duplicate-content", "filename");
export const downloaded = defineEvent("downloaded", "filename", "size");
export const fetchStructureError = defineErrorEvent("fetch-structure-error", "error", "uid");
export const invalidPdf = defineErrorEvent("invalid-pdf", "warning", "filename");
export const downloadFailed = defineErrorEvent("download-failed", "error", "filename");
