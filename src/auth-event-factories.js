/**
 * Event factories for auth progress events emitted by src/m365-auth.js.
 */

import { errorEvent } from "./error-event.js";

export const deviceCodePrompt = (verificationUri, userCode) => ({
  type: "device-code-prompt",
  verificationUri,
  userCode,
});
export const authWaiting = () => ({ type: "auth-waiting" });
export const authSuccess = () => ({ type: "auth-success" });
export const tokenRefreshFailed = (error) => errorEvent("token-refresh-failed", "error", error);
