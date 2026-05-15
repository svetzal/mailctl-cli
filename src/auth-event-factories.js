/**
 * Event factories for auth progress events emitted by src/m365-auth.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

/** @type {((verificationUri: string, userCode: string) => { type: "device-code-prompt" } & Record<string, any>) & { type: "device-code-prompt" }} */
export const deviceCodePrompt = defineEvent("device-code-prompt", "verificationUri", "userCode");
/** @type {(() => { type: "auth-waiting" }) & { type: "auth-waiting" }} */
export const authWaiting = defineEvent("auth-waiting");
/** @type {(() => { type: "auth-success" }) & { type: "auth-success" }} */
export const authSuccess = defineEvent("auth-success");
/** @type {((error: Error) => { type: "token-refresh-failed", severity: string, error: Error }) & { type: "token-refresh-failed" }} */
export const tokenRefreshFailed = defineErrorEvent("token-refresh-failed", "error");
/** @type {((error: Error, account: string) => { type: "connect-error", severity: string, error: Error } & Record<string, any>) & { type: "connect-error" }} */
export const connectError = defineErrorEvent("connect-error", "error", "account");
