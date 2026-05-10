/**
 * Event factories for shared IMAP progress events emitted by src/imap-client.js scanForReceipts,
 * src/imap-orchestration.js, and other modules that search across mailboxes.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

export const mailboxStart = defineEvent("mailbox-start", "mailbox", "count");
export const mailboxEmpty = defineEvent("mailbox-empty", "mailbox");
export const mailboxMatches = defineEvent("mailbox-matches", "mailbox", "count");

// Error events shared across multiple IMAP-using modules
export const mailboxLockFailed = defineErrorEvent("mailbox-lock-failed", "error", "mailbox");
export const searchFailed = defineErrorEvent("search-failed", "warning", "mailbox");
export const searchError = defineErrorEvent("search-error", "warning", "term");
export const fetchError = defineErrorEvent("fetch-error", "warning");
