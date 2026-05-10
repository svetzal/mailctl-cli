/**
 * Event factories for auth progress events emitted by src/m365-auth.js.
 */

import { defineEvent } from "./define-event.js";
import { errorEvent } from "./error-event.js";

export const deviceCodePrompt = defineEvent("device-code-prompt", "verificationUri", "userCode");
export const authWaiting = defineEvent("auth-waiting");
export const authSuccess = defineEvent("auth-success");
export const tokenRefreshFailed = Object.assign((error) => errorEvent("token-refresh-failed", "error", error), {
  type: "token-refresh-failed",
});
