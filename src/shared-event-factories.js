/**
 * Event factories for shared IMAP progress events emitted by src/imap-client.js scanForReceipts,
 * src/imap-orchestration.js, and other modules that search across mailboxes.
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
