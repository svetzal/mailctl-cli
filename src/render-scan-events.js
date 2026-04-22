/**
 * Pure renderer for scan progress events.
 * No I/O — returns a string (or null for unknown event types).
 */
import { createEventRenderer } from "./render-shared-events.js";

export const renderScanEvent = createEventRenderer({
  "scan-account-start": (e) => `🔍 Scanning ${e.name} (${e.user})...`,
  "scan-account-complete": (e) => `   ✅ Found ${e.count} receipt-like messages`,
});
