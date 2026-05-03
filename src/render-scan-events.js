import { createEventRenderer } from "./render-shared-events.js";

/** @type {(event: object) => string | null} */
export const renderScanEvent = createEventRenderer({
  "scan-account-start": (e) => `🔍 Scanning ${e.name} (${e.user})...`,
  "scan-account-complete": (e) => `   ✅ Found ${e.count} receipt-like messages`,
});
