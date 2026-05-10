/**
 * Event factories for sort progress events emitted by src/sorter.js.
 */

import { defineEvent } from "./define-event.js";

export const accountStart = defineEvent("account-start", "name", "user");
export const folderExists = defineEvent("folder-exists", "folder");
export const folderCreated = defineEvent("folder-created", "folder");
export const scanComplete = defineEvent("scan-complete", "count");
export const moveDryRun = defineEvent("move-dry-run", "icon", "count", "label");
export const moved = defineEvent("moved", "icon", "count", "label");
