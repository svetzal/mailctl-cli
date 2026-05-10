import { createEventRenderer } from "./render-shared-events.js";
import {
  accountStart,
  folderCreated,
  folderError,
  folderExists,
  moveDryRun,
  moved,
  moveError,
  scanComplete,
} from "./sort-event-factories.js";

/** @type {(event: object) => string | null} */
export const renderSortEvent = createEventRenderer({
  [accountStart.type]: (e) => `\n📬 Sorting ${e.name} (${e.user})...`,
  [folderExists.type]: (e) => `   ✅ Folder exists: ${e.folder}`,
  [folderCreated.type]: (e) => `   📁 Created folder: ${e.folder}`,
  [folderError.type]: (e) => `   ❌ Failed to create ${e.folder}: ${e.error.message}`,
  [scanComplete.type]: (e) => `   🔍 Found ${e.count} receipt messages to sort`,
  [moveDryRun.type]: (e) => `   ${e.icon} [DRY RUN] Would move ${e.count} messages: ${e.label}`,
  [moved.type]: (e) => `   ${e.icon} Moved ${e.count} messages: ${e.label}`,
  [moveError.type]: (e) => `   ⚠️  Move failed (${e.label}): ${e.error.message}`,
});
