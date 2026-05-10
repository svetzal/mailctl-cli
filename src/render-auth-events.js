import { authSuccess, authWaiting, deviceCodePrompt, tokenRefreshFailed } from "./auth-event-factories.js";
import { createEventRenderer } from "./render-shared-events.js";

/** @type {(event: object) => string | null} */
export const renderAuthEvent = createEventRenderer(
  {
    [tokenRefreshFailed.type]: (e) => `   Token refresh failed: ${e.error?.message ?? "unknown error"}`,
    [deviceCodePrompt.type]: (e) =>
      `\nTo authenticate Microsoft 365, visit: ${e.verificationUri}\nEnter code: ${e.userCode}`,
    [authWaiting.type]: () => `Waiting for authentication...`,
    [authSuccess.type]: () => `Authentication successful. Tokens cached.`,
    "connect-error": (e) => `   ❌ Failed to connect to ${e.account}: ${e.error?.message ?? "unknown error"}`,
  },
  { fallback: false },
);
