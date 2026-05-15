/**
 * Event factories for scan progress events emitted by src/scanner.js.
 */

import { defineEvent } from "./define-event.js";

/** @type {((name: string, user: string) => { type: "scan-account-start" } & Record<string, any>) & { type: "scan-account-start" }} */
export const scanAccountStart = defineEvent("scan-account-start", "name", "user");
/** @type {((name: string, count: number) => { type: "scan-account-complete" } & Record<string, any>) & { type: "scan-account-complete" }} */
export const scanAccountComplete = defineEvent("scan-account-complete", "name", "count");
