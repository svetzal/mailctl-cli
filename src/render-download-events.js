/**
 * Pure renderer for download progress events (the legacy `download` command).
 * No I/O — returns a string (or null for unknown event types).
 */
import { formatKB } from "./format-bytes.js";

/**
 * Render a download progress event as a human-readable string.
 *
 * @param {object} event
 * @returns {string | null}
 */
export function renderDownloadEvent(event) {
  switch (event.type) {
    case "download-account-start":
      return `\n📎 Downloading from ${event.name} (${event.user})...`;
    case "download-biz-count":
      return `   🏢 ${event.count} business receipt emails to check for PDFs`;
    case "fetch-structure-error":
      return `      ⚠️  Could not fetch structure for UID ${event.uid}: ${event.error.message}`;
    case "download-dry-run":
      return `   📄 [DRY RUN] Would download: ${event.filename}`;
    case "invalid-pdf":
      return `      ⚠️  Skipping ${event.filename} — not a valid PDF`;
    case "duplicate-content":
      return `      ⏭️  Skipping ${event.filename} — duplicate content`;
    case "downloaded":
      return `   📄 Downloaded: ${event.filename} (${formatKB(event.size)})`;
    case "download-failed":
      return `      ⚠️  Download failed for ${event.filename}: ${event.error.message}`;
    default:
      return null;
  }
}
