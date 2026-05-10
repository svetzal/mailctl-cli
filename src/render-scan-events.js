import { createEventRenderer } from "./render-shared-events.js";
import { scanAccountComplete, scanAccountStart } from "./scan-event-factories.js";

/** @type {(event: object) => string | null} */
export const renderScanEvent = createEventRenderer({
  [scanAccountStart.type]: (e) => `🔍 Scanning ${e.name} (${e.user})...`,
  [scanAccountComplete.type]: (e) => `   ✅ Found ${e.count} receipt-like messages`,
});
