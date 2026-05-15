/**
 * Event factories for download progress events emitted by src/downloader.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

/** @type {((name: string, user: string) => { type: "download-account-start" } & Record<string, any>) & { type: "download-account-start" }} */
export const downloadAccountStart = defineEvent("download-account-start", "name", "user");
/** @type {((count: number) => { type: "download-biz-count" } & Record<string, any>) & { type: "download-biz-count" }} */
export const downloadBizCount = defineEvent("download-biz-count", "count");
/** @type {((filename: string) => { type: "download-dry-run" } & Record<string, any>) & { type: "download-dry-run" }} */
export const downloadDryRun = defineEvent("download-dry-run", "filename");
/** @type {((filename: string) => { type: "duplicate-content" } & Record<string, any>) & { type: "duplicate-content" }} */
export const duplicateContent = defineEvent("duplicate-content", "filename");
/** @type {((filename: string, size: number) => { type: "downloaded" } & Record<string, any>) & { type: "downloaded" }} */
export const downloaded = defineEvent("downloaded", "filename", "size");
/** @type {((error: Error, uid: string | number) => { type: "fetch-structure-error", severity: string, error: Error } & Record<string, any>) & { type: "fetch-structure-error" }} */
export const fetchStructureError = defineErrorEvent("fetch-structure-error", "error", "uid");
/** @type {((error: Error, filename: string) => { type: "invalid-pdf", severity: string, error: Error } & Record<string, any>) & { type: "invalid-pdf" }} */
export const invalidPdf = defineErrorEvent("invalid-pdf", "warning", "filename");
/** @type {((error: Error, filename: string) => { type: "download-failed", severity: string, error: Error } & Record<string, any>) & { type: "download-failed" }} */
export const downloadFailed = defineErrorEvent("download-failed", "error", "filename");
/** @type {((error: Error, file: string) => { type: "hash-read-error", severity: string, error: Error } & Record<string, any>) & { type: "hash-read-error" }} */
export const hashReadError = defineErrorEvent("hash-read-error", "warning", "file");
