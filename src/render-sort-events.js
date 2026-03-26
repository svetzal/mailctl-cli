/**
 * Pure renderer for sort progress events.
 * No I/O — returns a string (or null for unknown event types).
 */

/**
 * Render a sort progress event as a human-readable string.
 *
 * @param {object} event
 * @returns {string | null}
 */
export function renderSortEvent(event) {
  switch (event.type) {
    case "account-start":
      return `\n📬 Sorting ${event.name} (${event.user})...`;
    case "folder-exists":
      return `   ✅ Folder exists: ${event.folder}`;
    case "folder-created":
      return `   📁 Created folder: ${event.folder}`;
    case "folder-error":
      return `   ❌ Failed to create ${event.folder}: ${event.error.message}`;
    case "scan-complete":
      return `   🔍 Found ${event.count} receipt messages to sort`;
    case "move-dry-run":
      return `   ${event.icon} [DRY RUN] Would move ${event.count} messages: ${event.label}`;
    case "moved":
      return `   ${event.icon} Moved ${event.count} messages: ${event.label}`;
    case "move-error":
      return `   ⚠️  Move failed (${event.label}): ${event.error.message}`;
    default:
      return null;
  }
}
