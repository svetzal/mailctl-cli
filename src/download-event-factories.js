/**
 * Event factories for download progress events emitted by src/downloader.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
 */

/**
 * @typedef {object} DownloadAccountStartEvent
 * @property {'download-account-start'} type
 * @property {string} name
 * @property {string} user
 */
/**
 * @typedef {object} DownloadBizCountEvent
 * @property {'download-biz-count'} type
 * @property {number} count
 */
/**
 * @typedef {object} DownloadDryRunEvent
 * @property {'download-dry-run'} type
 * @property {string} filename
 */
/**
 * @typedef {object} DuplicateContentEvent
 * @property {'duplicate-content'} type
 * @property {string} filename
 */
/**
 * @typedef {object} DownloadedEvent
 * @property {'downloaded'} type
 * @property {string} filename
 * @property {number} size
 */
/**
 * @typedef {object} FetchStructureErrorEvent
 * @property {'fetch-structure-error'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {number} uid
 */
/**
 * @typedef {object} InvalidPdfEvent
 * @property {'invalid-pdf'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} filename
 */
/**
 * @typedef {object} DownloadFailedEvent
 * @property {'download-failed'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {string} filename
 */
/**
 * @typedef {object} HashReadErrorEvent
 * @property {'hash-read-error'} type
 * @property {'warning'} severity
 * @property {Error} error
 * @property {string} file
 */
/**
 * @typedef {DownloadAccountStartEvent | DownloadBizCountEvent | DownloadDryRunEvent | DuplicateContentEvent | DownloadedEvent | FetchStructureErrorEvent | InvalidPdfEvent | DownloadFailedEvent | HashReadErrorEvent} DownloadEvent
 */

import { defineCommandEventTable } from "./command-event-table.js";
import { formatKB } from "./format-date.js";

const TABLE = {
  downloadAccountStart: {
    params: ["name", "user"],
    render: (e) => `\n📎 Downloading from ${e.name} (${e.user})...`,
  },
  downloadBizCount: {
    params: ["count"],
    render: (e) => `   🏢 ${e.count} business receipt emails to check for PDFs`,
  },
  downloadDryRun: {
    params: ["filename"],
    render: (e) => `   📄 [DRY RUN] Would download: ${e.filename}`,
  },
  duplicateContent: {
    params: ["filename"],
    render: (e) => `      ⏭️  Skipping ${e.filename} — duplicate content`,
  },
  downloaded: {
    params: ["filename", "size"],
    render: (e) => `   📄 Downloaded: ${e.filename} (${formatKB(e.size)})`,
  },
  fetchStructureError: {
    severity: "error",
    params: ["uid"],
    render: (e) => `      ⚠️  Could not fetch structure for UID ${e.uid}: ${e.error.message}`,
  },
  invalidPdf: {
    severity: "warning",
    params: ["filename"],
    render: (e) => `      ⚠️  Skipping ${e.filename} — not a valid PDF`,
  },
  downloadFailed: {
    severity: "error",
    params: ["filename"],
    render: (e) => `      ⚠️  Download failed for ${e.filename}: ${e.error.message}`,
  },
  hashReadError: {
    severity: "warning",
    params: ["file"],
  },
};

const { factories, renderEvent } = defineCommandEventTable(TABLE);

export const {
  downloadAccountStart,
  downloadBizCount,
  downloadDryRun,
  duplicateContent,
  downloaded,
  fetchStructureError,
  invalidPdf,
  downloadFailed,
  hashReadError,
} = factories;
export const renderDownloadEvent = renderEvent;
