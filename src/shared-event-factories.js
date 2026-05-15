/**
 * Event factories for shared IMAP progress events emitted by src/imap-client.js scanForReceipts,
 * src/imap-orchestration.js, and other modules that search across mailboxes.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

/** @type {((mailbox: string, count: number) => { type: "mailbox-start" } & Record<string, any>) & { type: "mailbox-start" }} */
export const mailboxStart = defineEvent("mailbox-start", "mailbox", "count");
/** @type {((mailbox: string) => { type: "mailbox-empty" } & Record<string, any>) & { type: "mailbox-empty" }} */
export const mailboxEmpty = defineEvent("mailbox-empty", "mailbox");
/** @type {((mailbox: string, count: number) => { type: "mailbox-matches" } & Record<string, any>) & { type: "mailbox-matches" }} */
export const mailboxMatches = defineEvent("mailbox-matches", "mailbox", "count");

// Error events shared across multiple IMAP-using modules
/** @type {((error: Error, mailbox: string) => { type: "mailbox-lock-failed", severity: string, error: Error } & Record<string, any>) & { type: "mailbox-lock-failed" }} */
export const mailboxLockFailed = defineErrorEvent("mailbox-lock-failed", "error", "mailbox");
/** @type {((error: Error, mailbox: string) => { type: "search-failed", severity: string, error: Error } & Record<string, any>) & { type: "search-failed" }} */
export const searchFailed = defineErrorEvent("search-failed", "warning", "mailbox");
/** @type {((error: Error, term: string) => { type: "search-error", severity: string, error: Error } & Record<string, any>) & { type: "search-error" }} */
export const searchError = defineErrorEvent("search-error", "warning", "term");
/** @type {((error: Error) => { type: "fetch-error", severity: string, error: Error }) & { type: "fetch-error" }} */
export const fetchError = defineErrorEvent("fetch-error", "warning");
