/**
 * Event factories for shared IMAP progress events emitted by src/imap-client.js scanForReceipts,
 * src/imap-orchestration.js, and other modules that search across mailboxes.
 */

/**
 * @typedef {object} MailboxStartEvent
 * @property {'mailbox-start'} type
 * @property {string} mailbox
 * @property {number} count
 */
/**
 * @typedef {object} MailboxEmptyEvent
 * @property {'mailbox-empty'} type
 * @property {string} mailbox
 */
/**
 * @typedef {object} MailboxMatchesEvent
 * @property {'mailbox-matches'} type
 * @property {string} mailbox
 * @property {number} count
 */
/**
 * @typedef {object} MailboxLockFailedEvent
 * @property {'mailbox-lock-failed'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {string} mailbox
 */
/**
 * @typedef {object} SearchFailedEvent
 * @property {'search-failed'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} mailbox
 */
/**
 * @typedef {object} SearchErrorEvent
 * @property {'search-error'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} term
 */
/**
 * @typedef {object} FetchErrorEvent
 * @property {'fetch-error'} type
 * @property {'warning'} severity
 * @property {Error} error
 */
/**
 * @typedef {MailboxStartEvent | MailboxEmptyEvent | MailboxMatchesEvent | MailboxLockFailedEvent | SearchFailedEvent | SearchErrorEvent | FetchErrorEvent} SharedEvent
 */

import { defineEventTable } from "./event-table.js";

const TABLE = {
  mailboxStart: { params: ["mailbox", "count"] },
  mailboxEmpty: { params: ["mailbox"] },
  mailboxMatches: { params: ["mailbox", "count"] },
  mailboxLockFailed: {
    severity: "error",
    params: ["mailbox"],
    render: (e) => `   Could not lock mailbox ${e.mailbox}: ${e.error.message}`,
  },
  searchFailed: {
    severity: "warning",
    params: ["mailbox"],
    render: (e) => `   Search failed in ${e.mailbox}: ${e.error.message}`,
  },
  searchError: { severity: "warning", params: ["term"] },
  fetchError: { severity: "warning" },
};

const { factories, renderEvent } = defineEventTable(TABLE);

export const { mailboxStart, mailboxEmpty, mailboxMatches, mailboxLockFailed, searchFailed, searchError, fetchError } =
  factories;
export const renderSharedEvent = renderEvent;
