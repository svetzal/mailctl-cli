/**
 * Pure renderer for sort progress events.
 * No I/O — returns a string (or null for unknown event types).
 */
import { createEventRenderer } from "./render-shared-events.js";

export const renderSortEvent = createEventRenderer({
  "account-start": (e) => `\n📬 Sorting ${e.name} (${e.user})...`,
  "folder-exists": (e) => `   ✅ Folder exists: ${e.folder}`,
  "folder-created": (e) => `   📁 Created folder: ${e.folder}`,
  "folder-error": (e) => `   ❌ Failed to create ${e.folder}: ${e.error.message}`,
  "scan-complete": (e) => `   🔍 Found ${e.count} receipt messages to sort`,
  "move-dry-run": (e) => `   ${e.icon} [DRY RUN] Would move ${e.count} messages: ${e.label}`,
  moved: (e) => `   ${e.icon} Moved ${e.count} messages: ${e.label}`,
  "move-error": (e) => `   ⚠️  Move failed (${e.label}): ${e.error.message}`,
});
