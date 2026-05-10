import {
  downloadAccountStart,
  downloadBizCount,
  downloadDryRun,
  downloaded,
  duplicateContent,
} from "./download-event-factories.js";
import { formatKB } from "./format-bytes.js";
import { createEventRenderer } from "./render-shared-events.js";

/** @type {(event: object) => string | null} */
export const renderDownloadEvent = createEventRenderer({
  [downloadAccountStart.type]: (e) => `\n📎 Downloading from ${e.name} (${e.user})...`,
  [downloadBizCount.type]: (e) => `   🏢 ${e.count} business receipt emails to check for PDFs`,
  "fetch-structure-error": (e) => `      ⚠️  Could not fetch structure for UID ${e.uid}: ${e.error.message}`,
  [downloadDryRun.type]: (e) => `   📄 [DRY RUN] Would download: ${e.filename}`,
  "invalid-pdf": (e) => `      ⚠️  Skipping ${e.filename} — not a valid PDF`,
  [duplicateContent.type]: (e) => `      ⏭️  Skipping ${e.filename} — duplicate content`,
  [downloaded.type]: (e) => `   📄 Downloaded: ${e.filename} (${formatKB(e.size)})`,
  "download-failed": (e) => `      ⚠️  Download failed for ${e.filename}: ${e.error.message}`,
});
