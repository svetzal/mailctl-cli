/**
 * Pure renderer for scan progress events.
 * No I/O — returns a string (or null for unknown event types).
 */
import { renderSharedEvent } from "./render-shared-events.js";

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
    default:
      return renderSharedEvent(event);
  }
}
