/**
 * Pure renderer for scan progress events.
 * No I/O — returns a string (or null for unknown event types).
 */

/**
 * Render a scan progress event as a human-readable string.
 *
 * @param {object} event
 * @returns {string | null}
 */
export function renderScanEvent(event) {
  switch (event.type) {
    case "scan-account-start":
      return `🔍 Scanning ${event.name} (${event.user})...`;
    case "scan-account-complete":
      return `   ✅ Found ${event.count} receipt-like messages`;
    case "mailbox-lock-failed":
      return `   Could not lock mailbox ${event.mailbox}: ${event.error.message}`;
    case "search-failed":
      return `   Search failed in ${event.mailbox}: ${event.error.message}`;
    default:
      return null;
  }
}
