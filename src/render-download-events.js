/**
 * Pure renderer for download progress events (the legacy `download` command).
 * No I/O — returns a string (or null for unknown event types).
 */
import { formatKB } from "./format-bytes.js";
import { createEventRenderer } from "./render-shared-events.js";

export const renderDownloadEvent = createEventRenderer({
  "download-account-start": (e) => `\n📎 Downloading from ${e.name} (${e.user})...`,
  "download-biz-count": (e) => `   🏢 ${e.count} business receipt emails to check for PDFs`,
  "fetch-structure-error": (e) => `      ⚠️  Could not fetch structure for UID ${e.uid}: ${e.error.message}`,
  "download-dry-run": (e) => `   📄 [DRY RUN] Would download: ${e.filename}`,
  "invalid-pdf": (e) => `      ⚠️  Skipping ${e.filename} — not a valid PDF`,
  "duplicate-content": (e) => `      ⏭️  Skipping ${e.filename} — duplicate content`,
  downloaded: (e) => `   📄 Downloaded: ${e.filename} (${formatKB(e.size)})`,
  "download-failed": (e) => `      ⚠️  Download failed for ${e.filename}: ${e.error.message}`,
});
