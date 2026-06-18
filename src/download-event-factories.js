/**
 * Event factories for download progress events emitted by src/downloader.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
 */

import { defineCommandEventTable } from "./command-event-table.js";
import { formatKB } from "./format-utils.js";

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
