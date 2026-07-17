/**
 * Event factories for sort progress events emitted by src/sorter.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
 */

/**
 * @typedef {object} AccountStartEvent
 * @property {'account-start'} type
 * @property {string} name
 * @property {string} user
 */
/**
 * @typedef {object} FolderExistsEvent
 * @property {'folder-exists'} type
 * @property {string} folder
 */
/**
 * @typedef {object} FolderCreatedEvent
 * @property {'folder-created'} type
 * @property {string} folder
 */
/**
 * @typedef {object} FolderErrorEvent
 * @property {'folder-error'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {string} folder
 */
/**
 * @typedef {object} ScanCompleteEvent
 * @property {'scan-complete'} type
 * @property {number} count
 */
/**
 * @typedef {object} MoveDryRunEvent
 * @property {'move-dry-run'} type
 * @property {string} icon
 * @property {number} count
 * @property {string} label
 */
/**
 * @typedef {object} MovedEvent
 * @property {'moved'} type
 * @property {string} icon
 * @property {number} count
 * @property {string} label
 */
/**
 * @typedef {object} MoveErrorEvent
 * @property {'move-error'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {string} label
 */
/**
 * @typedef {AccountStartEvent | FolderExistsEvent | FolderCreatedEvent | FolderErrorEvent | ScanCompleteEvent | MoveDryRunEvent | MovedEvent | MoveErrorEvent} SortEvent
 */

import { defineCommandEventTable } from "./command-event-table.js";

const TABLE = {
  accountStart: {
    params: ["name", "user"],
    render: (e) => `\n📬 Sorting ${e.name} (${e.user})...`,
  },
  folderExists: {
    params: ["folder"],
    render: (e) => `   ✅ Folder exists: ${e.folder}`,
  },
  folderCreated: {
    params: ["folder"],
    render: (e) => `   📁 Created folder: ${e.folder}`,
  },
  folderError: {
    severity: "error",
    params: ["folder"],
    render: (e) => `   ❌ Failed to create ${e.folder}: ${e.error.message}`,
  },
  scanComplete: {
    params: ["count"],
    render: (e) => `   🔍 Found ${e.count} receipt messages to sort`,
  },
  moveDryRun: {
    params: ["icon", "count", "label"],
    render: (e) => `   ${e.icon} [DRY RUN] Would move ${e.count} messages: ${e.label}`,
  },
  moved: {
    params: ["icon", "count", "label"],
    render: (e) => `   ${e.icon} Moved ${e.count} messages: ${e.label}`,
  },
  moveError: {
    severity: "error",
    params: ["label"],
    render: (e) => `   ⚠️  Move failed (${e.label}): ${e.error.message}`,
  },
};

const { factories, renderEvent } = defineCommandEventTable(TABLE);

export const { accountStart, folderExists, folderCreated, folderError, scanComplete, moveDryRun, moved, moveError } =
  factories;
export const renderSortEvent = renderEvent;
