/**
 * Event factories for scan progress events emitted by src/scanner.js.
 */

import { defineEvent } from "./define-event.js";

export const scanAccountStart = defineEvent("scan-account-start", "name", "user");
export const scanAccountComplete = defineEvent("scan-account-complete", "name", "count");
