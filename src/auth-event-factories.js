/**
 * Event factories for auth progress events emitted by src/m365-auth.js.
 */

import { defineErrorEvent, defineEvent } from "./define-event.js";

export const deviceCodePrompt = defineEvent("device-code-prompt", "verificationUri", "userCode");
export const authWaiting = defineEvent("auth-waiting");
export const authSuccess = defineEvent("auth-success");
export const tokenRefreshFailed = defineErrorEvent("token-refresh-failed", "error");
