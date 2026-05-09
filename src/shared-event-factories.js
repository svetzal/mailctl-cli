/**
 * Event factories for shared IMAP progress events emitted by src/imap-client.js scanForReceipts.
 */

export const mailboxStart = (mailbox, count) => ({ type: "mailbox-start", mailbox, count });
export const mailboxEmpty = (mailbox) => ({ type: "mailbox-empty", mailbox });
export const mailboxMatches = (mailbox, count) => ({ type: "mailbox-matches", mailbox, count });
