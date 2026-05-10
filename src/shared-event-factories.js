/**
 * Event factories for shared IMAP progress events emitted by src/imap-client.js scanForReceipts.
 */

import { defineEvent } from "./define-event.js";

export const mailboxStart = defineEvent("mailbox-start", "mailbox", "count");
export const mailboxEmpty = defineEvent("mailbox-empty", "mailbox");
export const mailboxMatches = defineEvent("mailbox-matches", "mailbox", "count");
