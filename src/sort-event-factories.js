/**
 * Event factories for sort progress events emitted by src/sorter.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

/** @type {((name: string, user: string) => { type: "account-start" } & Record<string, any>) & { type: "account-start" }} */
export const accountStart = defineEvent("account-start", "name", "user");
/** @type {((folder: string) => { type: "folder-exists" } & Record<string, any>) & { type: "folder-exists" }} */
export const folderExists = defineEvent("folder-exists", "folder");
/** @type {((folder: string) => { type: "folder-created" } & Record<string, any>) & { type: "folder-created" }} */
export const folderCreated = defineEvent("folder-created", "folder");
/** @type {((error: Error, folder: string) => { type: "folder-error", severity: string, error: Error } & Record<string, any>) & { type: "folder-error" }} */
export const folderError = defineErrorEvent("folder-error", "error", "folder");
/** @type {((count: number) => { type: "scan-complete" } & Record<string, any>) & { type: "scan-complete" }} */
export const scanComplete = defineEvent("scan-complete", "count");
/** @type {((icon: string, count: number, label: string) => { type: "move-dry-run" } & Record<string, any>) & { type: "move-dry-run" }} */
export const moveDryRun = defineEvent("move-dry-run", "icon", "count", "label");
/** @type {((icon: string, count: number, label: string) => { type: "moved" } & Record<string, any>) & { type: "moved" }} */
export const moved = defineEvent("moved", "icon", "count", "label");
/** @type {((error: Error, label: string) => { type: "move-error", severity: string, error: Error } & Record<string, any>) & { type: "move-error" }} */
export const moveError = defineErrorEvent("move-error", "error", "label");
