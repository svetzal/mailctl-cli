/**
 * Event factories for scan progress events emitted by src/scanner.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
 */

/**
 * @typedef {object} ScanAccountStartEvent
 * @property {'scan-account-start'} type
 * @property {string} name
 * @property {string} user
 */
/**
 * @typedef {object} ScanAccountCompleteEvent
 * @property {'scan-account-complete'} type
 * @property {string} name
 * @property {number} count
 */
/**
 * @typedef {ScanAccountStartEvent | ScanAccountCompleteEvent} ScanEvent
 */

import { defineCommandEventTable } from "./command-event-table.js";

const TABLE = {
  scanAccountStart: {
    params: ["name", "user"],
    render: (e) => `🔍 Scanning ${e.name} (${e.user})...`,
  },
  scanAccountComplete: {
    params: ["name", "count"],
    render: (e) => `   ✅ Found ${e.count} receipt-like messages`,
  },
};

const { factories, renderEvent } = defineCommandEventTable(TABLE);

export const { scanAccountStart, scanAccountComplete } = factories;
export const renderScanEvent = renderEvent;
